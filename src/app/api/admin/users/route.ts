import { NextResponse } from "next/server";
import { identityDb, describeSetupError } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { GLOBAL_ROLE_LABELS } from "@/lib/permissions";
import { deriveAppRole } from "@/lib/session";
import { readJson } from "@/lib/route-helpers";

export const runtime = "nodejs";

/**
 * Who can sign in, and as what.
 *
 * Admin only — this is where roles are handed out, so it is the most
 * sensitive screen in the app after the employee master.
 */
export async function GET(req: Request) {
  const auth = await requireRole(["admin"]);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q")?.trim().toLowerCase();
    const roleFilter = searchParams.get("role")?.trim();
    const includeInactive = searchParams.get("includeInactive") === "1";
    // The skills screen works off the employee master rather than the
    // sign-in list: somebody can have skills worth staffing long before
    // they ever log in.
    const includeEmployees = searchParams.get("includeEmployees") === "true";

    let builder = identityDb("users as u")
      .leftJoin("roles as r", "r.id", "u.role_id")
      .leftJoin("employee_master as e", "e.employee_id", "u.darwinbox_ref")
      .select(
        "u.id",
        "u.email",
        "u.full_name",
        "u.is_active",
        "u.darwinbox_ref",
        "u.last_login_at",
        identityDb.ref("r.code").as("role_code"),
        identityDb.ref("r.name").as("role_name"),
        identityDb.ref("e.designation").as("designation"),
        identityDb.ref("e.department").as("darwinbox_department"),
        identityDb.ref("e.internal_department").as("internal_department"),
        identityDb.ref("e.office_location").as("office_location"),
        identityDb.ref("e.job_level").as("job_level")
      )
      .orderBy("u.full_name");

    if (!includeInactive) builder = builder.where("u.is_active", true);
    if (roleFilter) builder = builder.where("r.code", roleFilter);
    if (query) {
      builder = builder.where((q) =>
        q
          .whereRaw("lower(u.email) like ?", [`%${query}%`])
          .orWhereRaw("lower(u.full_name) like ?", [`%${query}%`])
      );
    }

    const [rows, roles, allUserRoles] = await Promise.all([
      builder,
      identityDb("roles").select("id", "code", "name", "description").orderBy("code"),
      identityDb("user_roles")
        .join("roles", "roles.id", "user_roles.role_id")
        .select("user_roles.user_id", "roles.code", "roles.name"),
    ]);

    // Group user roles
    const userRolesMap = new Map<string, { code: string; name: string }[]>();
    for (const ur of allUserRoles) {
      if (!userRolesMap.has(ur.user_id)) userRolesMap.set(ur.user_id, []);
      userRolesMap.get(ur.user_id)!.push({ code: ur.code, name: ur.name });
    }

    return NextResponse.json({
      success: true,
      users: rows.map((row) => {
        const uRoles = userRolesMap.get(row.id) || [];
        // Fallback to row.role_code if user_roles is empty (migration issue safety)
        const roleCodes = uRoles.length > 0 ? uRoles.map(r => r.code) : (row.role_code ? [row.role_code] : []);
        const roleNames = uRoles.length > 0 ? uRoles.map(r => r.name) : (row.role_name ? [row.role_name] : []);
        return {
          id: row.id,
        email: row.email,
        fullName: row.full_name,
        isActive: row.is_active,
        darwinboxRef: row.darwinbox_ref,
        lastLoginAt: row.last_login_at,
        roleCode: roleCodes[0] ?? null, // Primary role for legacy UI
        roleName: roleNames[0] ?? null,
        roleCodes,
        roleNames,
        appRole: deriveAppRole(roleCodes[0] ?? row.role_code),
        designation: row.designation,
        // Prefer the admin-assigned internal_department; fall back to Darwinbox raw value
        department: row.internal_department || row.darwinbox_department || null,
        officeLocation: row.office_location,
        jobLevel: row.job_level,
        };
      }),
      roles,
      roleLabels: GLOBAL_ROLE_LABELS,
      employees: includeEmployees ? await employeeDirectory() : undefined,
    });
  } catch (err) {
    const setup = describeSetupError(err);
    if (setup) return NextResponse.json({ error: setup, setup: true }, { status: 500 });
    console.error("[admin.users.GET]", err);
    return NextResponse.json({ error: "Could not load users." }, { status: 500 });
  }
}

/** Everyone in the employee master, with how many skills are on file. */
async function employeeDirectory() {
  const rows = (await identityDb("employee_master as e")
    .leftJoin("employee_skills as es", "es.employee_id", "e.employee_id")
    .where("e.is_active", true)
    .groupBy("e.employee_id", "e.full_name", "e.company_email_id", "e.designation", "e.department")
    .select(
      "e.employee_id",
      "e.full_name",
      "e.company_email_id",
      "e.designation",
      "e.department"
    )
    .count({ skillCount: "es.id" })
    .orderBy("e.full_name")
    .catch(() => [])) as Record<string, unknown>[];

  return rows.map((row) => ({
    employeeId: String(row.employee_id),
    fullName: row.full_name ? String(row.full_name) : String(row.employee_id),
    email: row.company_email_id ? String(row.company_email_id) : null,
    designation: row.designation ? String(row.designation) : null,
    department: row.department ? String(row.department) : null,
    skillCount: Number(row.skillCount ?? 0),
  }));
}

/**
 * Change someone's role, or activate/deactivate them.
 *
 * PATCH { userId, roleCode?, isActive? }
 */
export async function PATCH(req: Request) {
  const auth = await requireRole(["admin"]);
  if (!auth.ok) return auth.response;

  const parsed = await readJson(req);
  if (!parsed.ok) return parsed.response;

  const body = parsed.body as { userId?: unknown; roleCode?: unknown; roleCodes?: unknown; isActive?: unknown };
  const userId = typeof body.userId === "string" ? body.userId : "";
  const roleCode = typeof body.roleCode === "string" ? body.roleCode.trim() : undefined;
  const roleCodes = Array.isArray(body.roleCodes) ? body.roleCodes.map(String) : undefined;
  const isActive = typeof body.isActive === "boolean" ? body.isActive : undefined;

  if (!userId) {
    return NextResponse.json({ error: "userId is required." }, { status: 400 });
  }
  if (roleCode === undefined && roleCodes === undefined && isActive === undefined) {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  }

  try {
    const target = await identityDb("users as u")
      .leftJoin("roles as r", "r.id", "u.role_id")
      .select("u.id", "u.email", "u.full_name", "u.is_active", identityDb.ref("r.code").as("role_code"))
      .where("u.id", userId)
      .first();

    if (!target) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const update: Record<string, unknown> = {};

    if (roleCode !== undefined || roleCodes !== undefined) {
      const codesToApply = roleCodes ?? (roleCode ? [roleCode] : []);
      const dbRoles = await identityDb("roles").whereIn("code", codesToApply);
      if (dbRoles.length !== codesToApply.length) {
        return NextResponse.json({ error: "One or more unknown roles." }, { status: 400 });
      }

      // If user is admin and removes their own admin role
      const isAdminNow = target.role_code === "admin" || (await identityDb("user_roles").join("roles", "roles.id", "user_roles.role_id").where("user_id", userId).where("code", "admin").first());
      if (isAdminNow && !codesToApply.includes("admin")) {
        const adminsCount = await identityDb("user_roles")
          .join("roles", "roles.id", "user_roles.role_id")
          .join("users as u", "u.id", "user_roles.user_id")
          .where("roles.code", "admin")
          .andWhere("u.is_active", true)
          .count("* as n")
          .first<{ n: string }>();

        if (Number(adminsCount?.n ?? 0) <= 1) {
          return NextResponse.json(
            { error: "This is the only active administrator. Promote someone else first." },
            { status: 409 }
          );
        }
      }
      if (dbRoles.length > 0) {
        update.role_id = dbRoles[0].id; // Keep legacy column updated with the primary role
      }

      await identityDb("user_roles").where("user_id", userId).delete();
      if (dbRoles.length > 0) {
        await identityDb("user_roles").insert(dbRoles.map(r => ({ user_id: userId, role_id: r.id })));
      }
    }

    if (isActive !== undefined) {
      if (!isActive && target.id === auth.session.userId) {
        return NextResponse.json(
          { error: "You cannot deactivate your own account." },
          { status: 409 }
        );
      }
      if (!isActive && target.role_code === "admin") {
        const admins = await identityDb("users as u")
          .join("roles as r", "r.id", "u.role_id")
          .where("r.code", "admin")
          .andWhere("u.is_active", true)
          .count("* as n")
          .first<{ n: string }>();
        if (Number(admins?.n ?? 0) <= 1) {
          return NextResponse.json(
            { error: "This is the only active administrator. Promote someone else first." },
            { status: 409 }
          );
        }
      }
      update.is_active = isActive;
    }

    // A change of role or status should bite immediately, not in 8 hours.
    try {
      if (await identityDb.schema.hasColumn("users", "sessions_valid_from")) {
        update.sessions_valid_from = new Date();
      }
    } catch {
      // Column check is best-effort.
    }

    await identityDb("users").where("id", userId).update(update);

    try {
      await identityDb("login_audit").insert({
        user_id: userId,
        email: target.email,
        success: true,
        reason: `role_changed_by:${auth.session.email}${roleCode ? ` to:${roleCode}` : ""}${
          isActive !== undefined ? ` active:${isActive}` : ""
        }`,
      });
    } catch {
      // Auditing is best-effort.
    }

    return NextResponse.json({
      success: true,
      userId,
      message: "User updated successfully.",
    });
  } catch (err) {
    const setup = describeSetupError(err);
    if (setup) return NextResponse.json({ error: setup, setup: true }, { status: 500 });
    console.error("[admin.users.PATCH]", err);
    return NextResponse.json({ error: "Could not update the user." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const auth = await requireRole(["admin"]);
  if (!auth.ok) return auth.response;

  const parsed = await readJson(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body as any;

  if (body.type === "role") {
    // Create Role
    if (!body.code || !body.name) return NextResponse.json({ error: "Code and name required" }, { status: 400 });
    try {
      const tenantId = process.env.DEFAULT_TENANT_ID || "10000000-0000-0000-0000-000000000001";
      const [role] = await identityDb("roles").insert({
        tenant_id: tenantId,
        code: body.code.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
        name: body.name,
        description: body.description || null,
        is_active: true
      }).returning("*");
      return NextResponse.json({ success: true, role });
    } catch (e) {
      console.error(e);
      return NextResponse.json({ error: "Could not create role" }, { status: 500 });
    }
  } else {
    // Create User
    if (!body.email || !body.fullName) return NextResponse.json({ error: "Email and full name required" }, { status: 400 });
    try {
      // Find role for default
      const defaultRole = await identityDb("roles").where("code", "member").first();
      const [user] = await identityDb("users").insert({
        tenant_id: process.env.DEFAULT_TENANT_ID || "10000000-0000-0000-0000-000000000001",
        email: body.email.toLowerCase(),
        full_name: body.fullName,
        role_id: defaultRole?.id ?? null,
        is_active: true,
      }).returning("*");

      if (defaultRole) {
        await identityDb("user_roles").insert({ user_id: user.id, role_id: defaultRole.id });
      }

      return NextResponse.json({ success: true, user });
    } catch (e) {
      console.error(e);
      return NextResponse.json({ error: "Could not create user" }, { status: 500 });
    }
  }
}
