// ═══════════════════════════════════════════════════════════════
// Server-side authentication helpers.
//
// The session cookie is signed (see session.ts), so its contents can
// be trusted without a database round-trip. We still check the user
// row on every request so that deactivating a user, or forcing a
// global sign-out, takes effect immediately rather than after 8 hours.
// ═══════════════════════════════════════════════════════════════

import { cookies } from "next/headers";
import { cache } from "react";
import { NextResponse } from "next/server";
import { identityDb, projectDb } from "./db";
import {
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  SESSION_MAX_AGE_SECONDS,
  createSessionCookie,
  deriveAppRole,
  verifySessionCookie,
  type SessionPayload,
  type SessionSeed,
} from "./session";
import type { AppRole, User } from "./types";
import { resolveProjectOr404, type ResolvedProject } from "./route-helpers";
import {
  can,
  describeAccess,
  normaliseProjectRole,
  type AccessContext,
  type Capability,
} from "./permissions";

export {
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  SESSION_MAX_AGE_SECONDS,
  createSessionCookie,
  deriveAppRole,
  verifySessionCookie,
};
export type { SessionPayload, SessionSeed };

export interface AuthUserRow {
  id: string;
  tenant_id: string;
  email: string;
  full_name: string;
  role_id: string | null;
  role_code: string | null;
  role_name: string | null;
  darwinbox_ref: string | null;
  is_active: boolean;
  must_change_password: boolean | null;
  sessions_valid_from: Date | string | null;
  password_hash: string | null;
  last_login_at: Date | string | null;
  failed_login_count: number | null;
  locked_until: Date | string | null;
  created_at: Date | string | null;
  updated_at: Date | string | null;
}

/**
 * Load a user (plus their role code) from identity_db.
 * `roles` is left-joined so a user with no role still resolves.
 */
export async function findAuthUserByEmail(email: string): Promise<AuthUserRow | undefined> {
  return identityDb("users as u")
    .leftJoin("roles as r", "r.id", "u.role_id")
    .select(
      "u.*",
      identityDb.ref("r.code").as("role_code"),
      identityDb.ref("r.name").as("role_name")
    )
    .whereRaw("lower(u.email) = ?", [email.trim().toLowerCase()])
    .first<AuthUserRow | undefined>();
}

export async function findAuthUserById(id: string): Promise<AuthUserRow | undefined> {
  return identityDb("users as u")
    .leftJoin("roles as r", "r.id", "u.role_id")
    .select(
      "u.*",
      identityDb.ref("r.code").as("role_code"),
      identityDb.ref("r.name").as("role_name")
    )
    .where("u.id", id)
    .first<AuthUserRow | undefined>();
}

/**
 * Per-request cached user lookup. React's `cache` dedupes this, so a
 * page that calls getSession() and getCurrentUser() hits the DB once.
 */
const loadUser = cache(async (userId: string): Promise<AuthUserRow | undefined> => {
  try {
    return await findAuthUserById(userId);
  } catch (err) {
    console.error("[auth] Failed to load user", userId, err);
    return undefined;
  }
});

function toIso(value: Date | string | null | undefined): string {
  if (!value) return new Date().toISOString();
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function rowToUser(row: AuthUserRow): User {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    email: row.email,
    fullName: row.full_name,
    roleId: row.role_id ?? undefined,
    role: row.role_id
      ? {
          id: row.role_id,
          tenantId: row.tenant_id,
          code: row.role_code ?? "member",
          name: row.role_name ?? "Member",
          isActive: true,
          createdAt: toIso(row.created_at),
          updatedAt: toIso(row.updated_at),
        }
      : undefined,
    darwinboxRef: row.darwinbox_ref ?? undefined,
    isActive: row.is_active ?? true,
    mfaEnabled: false,
    lastLoginAt: row.last_login_at ? toIso(row.last_login_at) : undefined,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

/**
 * Verify the cookie, then confirm the user is still allowed in.
 * Returns null for: no cookie, bad signature, expired session,
 * deleted user, deactivated user, or a session issued before the
 * user's `sessions_valid_from` watermark (global sign-out).
 */
export const getSession = cache(async (): Promise<SessionPayload | null> => {
  const cookieStore = await cookies();
  const payload = await verifySessionCookie(cookieStore.get(SESSION_COOKIE)?.value);
  if (!payload) return null;

  const row = await loadUser(payload.userId);
  if (!row || !row.is_active) return null;

  if (row.sessions_valid_from) {
    const watermark = new Date(row.sessions_valid_from).getTime();
    if (Number.isFinite(watermark) && payload.iat * 1000 < watermark) return null;
  }

  // Trust the database over the cookie for role, so a role change
  // applies on the next request instead of the next login.
  const roleCode = row.role_code ?? payload.roleCode;
  return { ...payload, roleCode, role: deriveAppRole(roleCode) };
});

/** The currently authenticated user, or null. */
export async function getCurrentUser(): Promise<User | null> {
  const session = await getSession();
  if (!session) return null;
  const row = await loadUser(session.userId);
  return row ? rowToUser(row) : null;
}

/** True when the user must set a new password before doing anything else. */
export async function mustChangePassword(): Promise<boolean> {
  const session = await getSession();
  if (!session) return false;
  const row = await loadUser(session.userId);
  return Boolean(row?.must_change_password);
}

// ─── Route guards ──────────────────────────────────────────────────

export type GuardResult =
  | { ok: true; session: SessionPayload }
  | { ok: false; response: NextResponse };

/**
 * Use at the top of a route handler:
 *
 *   const auth = await requireSession();
 *   if (!auth.ok) return auth.response;
 *   // auth.session is typed and trustworthy from here
 */
export async function requireSession(): Promise<GuardResult> {
  const session = await getSession();
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Not authenticated" }, { status: 401 }),
    };
  }
  return { ok: true, session };
}

/** As requireSession, but also checks the caller holds one of `roles`. */
export async function requireRole(roles: AppRole[]): Promise<GuardResult> {
  const auth = await requireSession();
  if (!auth.ok) return auth;

  if (!roles.includes(auth.session.role)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "You do not have permission to perform this action." },
        { status: 403 }
      ),
    };
  }
  return auth;
}

/** Build the session seed for a verified user row. */
export function sessionSeedFor(row: AuthUserRow): SessionSeed {
  const roleCode = row.role_code ?? "member";
  return {
    userId: row.id,
    tenantId: row.tenant_id,
    email: row.email,
    fullName: row.full_name,
    roleCode,
    role: deriveAppRole(roleCode),
  };
}

// ─── Project-scoped access ─────────────────────────────────────────

/**
 * Work out what the signed-in person may do on one project.
 *
 * Combines their global role with their row in project_team_members,
 * and treats the named project manager or sponsor as an owner even when
 * nobody remembered to add them to the team table.
 */
export async function getProjectAccess(
  projectId: string,
  session?: SessionPayload | null
): Promise<AccessContext & { userId: string | null }> {
  const current = session ?? (await getSession());

  if (!current) {
    return {
      role: "client",
      projectRole: "viewer",
      isProjectOwner: false,
      isProjectManager: false,
      projectScoped: true,
      userId: null,
    };
  }

  const context: AccessContext & { userId: string | null } = {
    role: current.role,
    projectRole: null,
    isProjectOwner: false,
    isProjectManager: false,
    // Resolved for this one project, so the financial rule applies.
    projectScoped: true,
    userId: current.userId,
  };

  if (current.role === "admin") return context;

  try {
    const [project, membership] = await Promise.all([
      projectDb("projects")
        .where("id", projectId)
        .select("project_manager_user_id", "sponsor_user_id")
        .first<{ project_manager_user_id: string | null; sponsor_user_id: string | null } | undefined>(),
      projectDb("project_team_members")
        .where({ project_id: projectId, user_id: current.userId })
        .andWhere("is_active", true)
        .select("role_in_project")
        .first<{ role_in_project: string | null } | undefined>(),
    ]);

    if (membership) context.projectRole = normaliseProjectRole(membership.role_in_project);

    // A project can have several PMs: the one named on the project row,
    // and anyone holding the PM role on its team.
    if (project?.project_manager_user_id === current.userId || context.projectRole === "manager") {
      context.isProjectManager = true;
    }
    if (
      project &&
      (project.project_manager_user_id === current.userId || project.sponsor_user_id === current.userId)
    ) {
      context.isProjectOwner = true;
    }
  } catch (err) {
    // A missing table must not silently grant access — fall back to the
    // most restrictive reading of their global role.
    console.error("[auth] Could not resolve project access:", err);
    context.projectRole = "viewer";
    context.isProjectManager = false;
  }

  return context;
}

/**
 * Ids of the projects this person is a PM on — named on the project row
 * or PM on its team. For screens that list many projects at once (the
 * portfolio dashboard, the project list, the pipeline) and have to decide
 * the money question per row.
 */
export async function projectsManagedBy(userId: string | null | undefined): Promise<Set<string>> {
  const ids = new Set<string>();
  if (!userId) return ids;
  try {
    const [named, team] = await Promise.all([
      projectDb("projects").where("project_manager_user_id", userId).pluck("id"),
      projectDb("project_team_members")
        .where({ user_id: userId, is_active: true })
        .select("project_id", "role_in_project"),
    ]);
    for (const id of named as string[]) ids.add(String(id));
    for (const row of team as { project_id: string; role_in_project: string | null }[]) {
      if (normaliseProjectRole(row.role_in_project) === "manager") ids.add(String(row.project_id));
    }
  } catch (err) {
    console.error("[auth] Could not list managed projects:", err);
  }
  return ids;
}

export type ProjectGuardResult =
  | { ok: true; session: SessionPayload; access: AccessContext & { userId: string | null } }
  | { ok: false; response: NextResponse };

/**
 * Guard a project route by capability rather than by role name:
 *
 *   const auth = await requireCapability(projectId, "plan.edit");
 *   if (!auth.ok) return auth.response;
 */
export async function requireCapability(
  projectId: string,
  capability: Capability
): Promise<ProjectGuardResult> {
  const session = await getSession();
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Not authenticated" }, { status: 401 }),
    };
  }

  const access = await getProjectAccess(projectId, session);

  if (!can(access, capability)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: `You do not have permission to do this. ${describeAccess(access)}`,
          required: capability,
          access: { role: access.role, projectRole: access.projectRole },
        },
        { status: 403 }
      ),
    };
  }

  return { ok: true, session, access };
}

export type ProjectRouteGuardResult =
  | {
      ok: true;
      session: SessionPayload;
      access: AccessContext & { userId: string | null };
      project: ResolvedProject;
    }
  | { ok: false; response: NextResponse };

/**
 * The guard every project-scoped route should use.
 *
 * It does the three things those routes were doing separately — and, in
 * several cases, not doing at all: check there is a session, resolve
 * /pmt/<uuid> or /pmt/PRJ-0001 to a real project, and check the caller's
 * capability on *that* project.
 *
 *   const guard = await requireProjectCapability(id, "plan.create");
 *   if (!guard.ok) return guard.response;
 *   const project = guard.project;
 *
 * Resolution happens after the session check so an anonymous caller
 * cannot use the 404/200 difference to enumerate project codes.
 */
export async function requireProjectCapability(
  idOrCode: string,
  capability: Capability
): Promise<ProjectRouteGuardResult> {
  const session = await getSession();
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Not authenticated" }, { status: 401 }),
    };
  }

  const resolved = await resolveProjectOr404(idOrCode);
  if (!resolved.ok) return { ok: false, response: resolved.response };

  const access = await getProjectAccess(resolved.project.id, session);

  if (!can(access, capability)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          success: false,
          error: `You do not have permission to do this. ${describeAccess(access)}`,
          required: capability,
          access: { role: access.role, projectRole: access.projectRole },
        },
        { status: 403 }
      ),
    };
  }

  return { ok: true, session, access, project: resolved.project };
}

/** The same check for routes that are not about one project. */
export async function requireCapabilityGlobally(
  capability: Capability
): Promise<GuardResult> {
  const auth = await requireSession();
  if (!auth.ok) return auth;

  const context: AccessContext = { role: auth.session.role };
  if (!can(context, capability)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          success: false,
          error: "You do not have permission to perform this action.",
          required: capability,
        },
        { status: 403 }
      ),
    };
  }
  return auth;
}

/**
 * The 403 body used by every capability guard, for the routes that have
 * to read the request before they know which capability applies.
 */
export function capabilityDenied(
  access: AccessContext,
  capability: Capability
): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: `You do not have permission to do this. ${describeAccess(access)}`,
      required: capability,
      access: { role: access.role, projectRole: access.projectRole },
    },
    { status: 403 }
  );
}

export { can, describeAccess } from "./permissions";
export type { AccessContext, Capability } from "./permissions";
