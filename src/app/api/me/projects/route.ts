// GET  /api/me/projects  — active projects + my current allocation / request status
// POST   /api/me/projects  — add yourself to a project
// PATCH  /api/me/projects  — change your role / allocation on it
// DELETE /api/me/projects?projectId=…  — take yourself off it
//
// Phase 1 rule: employees see every live project by name, pick one, choose
// a role and an allocation, and are on it immediately — no approval first.
// Their reporting manager reviews self-allocations afterwards on Team
// Allocations (/admin/allocation-requests) and can remove one.

import { NextResponse } from "next/server";
import { projectDb, identityDb } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { readJson, serverError, validationError } from "@/lib/route-helpers";
import { SELF_SELECTABLE_ROLES, PM, toTeamRole } from "@/lib/team-roles";

export const runtime = "nodejs";

// A project team has three roles: Developer, Team Lead and PM. Only the
// first two can be picked for yourself — PM gives access to the project's
// finances, so it is granted by an admin or one of the project's PMs from
// the project's Team tab, never self-declared.
const ALLOWED_ROLES = SELF_SELECTABLE_ROLES;

/** PM is granted by an admin or the project's PMs, never self-declared. */
function pmSelfRefused() {
  return NextResponse.json(
    {
      success: false,
      error:
        "You can add yourself as Developer or Team Lead. To be a PM on a project, ask an administrator or one of that project's PMs to set it on the Team tab.",
    },
    { status: 403 }
  );
}

/** Self-allocation is for employees; a client contact has their own portal. */
function clientRefused() {
  return NextResponse.json(
    { success: false, error: "You do not have permission to access this resource." },
    { status: 403 }
  );
}

/** Resolve the caller's employee_id from identity_db. */
async function myEmployeeId(session: { userId: string; email: string }): Promise<string | null> {
  const user = await identityDb("users")
    .where("id", session.userId)
    .select("darwinbox_ref", "email")
    .first<{ darwinbox_ref: string | null; email: string } | undefined>();
  if (user?.darwinbox_ref) return String(user.darwinbox_ref);
  const byEmail = await identityDb("employee_master")
    .whereRaw("lower(company_email_id) = ?", [String(user?.email ?? session.email).toLowerCase()])
    .select("employee_id")
    .first<{ employee_id: string } | undefined>()
    .catch(() => undefined);
  return byEmail ? String(byEmail.employee_id) : null;
}

export async function GET() {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;
    if (auth.session.role === "client") return clientRefused();
    const userId = auth.session.userId;

    // All active projects — name, code, and what people search them by.
    // No financials: employees don't see budgets.
    //
    // Projects imported from the Zoho sales-order Excel carry the customer
    // and the SO number, which is how most people know them. The SO column
    // is added by hand on some databases, so ask for it and fall back to
    // the plain list rather than showing nobody anything.
    const BASE = ["id", "code", "name", "status", "start_date", "planned_end_date", "client_company_name"];
    const live = () =>
      projectDb("projects").whereNotIn("status", ["cancelled", "closed"]).orderBy("code", "asc");
    type Row = Record<string, unknown>;
    const withRef = (await live()
      .select(...BASE, "zoho_sales_order_ref")
      .catch(() => null)) as Row[] | null;
    const projects: Row[] =
      withRef ?? ((await live().select(...BASE).catch(() => [])) as Row[]);

    // Current allocations (active team memberships)
    const allocations = (await projectDb("project_team_members")
      .where({ user_id: userId, is_active: true })
      .select("project_id", "role_in_project", "allocation_percent", "start_date", "end_date")
      .catch(() => [])) as Record<string, unknown>[];

    // Pending or recent requests
    const requests = (await projectDb("project_allocation_requests")
      .where("user_id", userId)
      .orderBy("created_at", "desc")
      .select("id", "project_id", "requested_role", "requested_allocation_percent",
              "requested_start_date", "requested_end_date", "status", "review_notes", "reviewed_at")
      .catch(() => [])) as Record<string, unknown>[];

    const allocMap = new Map(allocations.map((a) => [String(a.project_id), a]));
    const reqMap = new Map<string, Record<string, unknown>>();
    for (const r of requests) {
      const pid = String(r.project_id);
      if (!reqMap.has(pid)) reqMap.set(pid, r); // most recent first
    }

    return NextResponse.json({
      success: true,
      roles: ALLOWED_ROLES,
      projects: projects.map((p) => ({
        id: String(p.id),
        code: String(p.code),
        name: String(p.name),
        status: String(p.status),
        startDate: p.start_date ?? null,
        plannedEndDate: p.planned_end_date ?? null,
        clientName: p.client_company_name ? String(p.client_company_name) : null,
        salesOrderRef: p.zoho_sales_order_ref ? String(p.zoho_sales_order_ref) : null,
        myAllocation: allocMap.has(String(p.id))
          ? {
              role: String(allocMap.get(String(p.id))!.role_in_project ?? ""),
              allocationPercent: Number(allocMap.get(String(p.id))!.allocation_percent ?? 100),
            }
          : null,
        myRequest: reqMap.has(String(p.id))
          ? {
              id: String(reqMap.get(String(p.id))!.id),
              role: String(reqMap.get(String(p.id))!.requested_role ?? ""),
              status: String(reqMap.get(String(p.id))!.status ?? "pending"),
              reviewNotes: reqMap.get(String(p.id))!.review_notes
                ? String(reqMap.get(String(p.id))!.review_notes)
                : null,
            }
          : null,
      })),
    });
  } catch (err) {
    return serverError("me.projects.GET", err);
  }
}

/** Reads and checks the role / allocation fields shared by POST and PATCH. */
function readAllocationFields(body: Record<string, unknown>, partial: boolean) {
  const errors: string[] = [];
  const role = body.role ?? body.requestedRole;
  const pct = body.allocationPercent;

  // Canonical "Developer" / "Team Lead" / "PM", or null when it is none.
  const requestedRole =
    role === undefined ? undefined : String(role).trim() ? toTeamRole(role) : "";
  const allocationPercent = pct === undefined ? undefined : Number(pct);

  if (!partial || requestedRole !== undefined) {
    if (requestedRole === undefined || requestedRole === "") errors.push("Which role?");
    else if (requestedRole === null) errors.push("Your role must be Developer or Team Lead.");
  }
  if (!partial || allocationPercent !== undefined) {
    const n = allocationPercent ?? 100;
    if (!Number.isInteger(n) || n < 5 || n > 500) {
      errors.push("Allocation must be between 5% and 500%.");
    }
  }
  return { errors, requestedRole, allocationPercent };
}

/**
 * Add yourself to a project.
 *
 * Phase 1 is self-service: there is no approval step before somebody is on
 * a project. They are added to the team at once and can log time straight
 * away. Every self-allocation also leaves a row in
 * project_allocation_requests with status "self_allocated", which is what
 * the reporting manager reviews afterwards on Team Allocations — and where
 * they can take somebody off a project that was picked by mistake.
 */
export async function POST(req: Request) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;
    if (auth.session.role === "client") return clientRefused();
    const userId = auth.session.userId;
    const fullName = auth.session.fullName ?? null;

    const parsed = await readJson(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.body as Record<string, unknown>;

    const projectId = String(body.projectId ?? "").trim();
    const startDate = body.startDate ? String(body.startDate) : null;
    const endDate = body.endDate ? String(body.endDate) : null;
    const notes = body.notes ? String(body.notes).trim() : null;

    const { errors, requestedRole, allocationPercent } = readAllocationFields(body, false);
    if (!projectId) errors.unshift("Which project?");
    if (errors.length > 0) return validationError(errors);
    const role = requestedRole!;
    const pct = allocationPercent ?? 100;
    if (role === PM) return pmSelfRefused();

    const project = await projectDb("projects")
      .where("id", projectId)
      .whereNotIn("status", ["cancelled", "closed"])
      .first();
    if (!project) {
      return NextResponse.json({ success: false, error: "Project not found or closed." }, { status: 404 });
    }

    const existing = (await projectDb("project_team_members")
      .where({ project_id: projectId, user_id: userId })
      .first()) as Record<string, unknown> | undefined;
    if (existing?.is_active) {
      return NextResponse.json(
        { success: false, error: "You are already on this project." },
        { status: 409 }
      );
    }

    const employeeId = await myEmployeeId(auth.session);
    const now = new Date();

    await projectDb.transaction(async (trx) => {
      if (existing) {
        // Back on a project you were on before (stood down, or removed).
        // The unique (project_id, user_id) key means reactivate, not insert.
        await trx("project_team_members")
          .where({ project_id: projectId, user_id: userId })
          .update({
            is_active: true,
            role_in_project: role,
            allocation_percent: pct,
            start_date: startDate ?? existing.start_date ?? null,
            end_date: endDate,
            updated_at: now,
          });
      } else {
        await trx("project_team_members").insert({
          project_id: projectId,
          user_id: userId,
          user_name: fullName,
          employee_id: employeeId,
          role_in_project: role,
          allocation_percent: pct,
          start_date: startDate,
          end_date: endDate,
          is_active: true,
          created_at: now,
          updated_at: now,
        });
      }

      // An old request still waiting for approval is moot now.
      await trx("project_allocation_requests")
        .where({ project_id: projectId, user_id: userId, status: "pending" })
        .update({ status: "withdrawn", updated_at: now });

      // The record the manager reviews.
      await trx("project_allocation_requests").insert({
        project_id: projectId,
        user_id: userId,
        user_name: fullName,
        employee_id: employeeId,
        requested_role: role,
        requested_allocation_percent: pct,
        requested_start_date: startDate,
        requested_end_date: endDate,
        notes,
        status: "self_allocated",
        created_at: now,
        updated_at: now,
      });
    });

    return NextResponse.json(
      { success: true, allocation: { projectId, role, allocationPercent: pct } },
      { status: 201 }
    );
  } catch (err) {
    return serverError("me.projects.POST", err);
  }
}

/** Change your role or allocation on a project you are on. */
export async function PATCH(req: Request) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;
    if (auth.session.role === "client") return clientRefused();
    const userId = auth.session.userId;

    const parsed = await readJson(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.body as Record<string, unknown>;

    const projectId = String(body.projectId ?? "").trim();
    const { errors, requestedRole, allocationPercent } = readAllocationFields(body, true);
    if (!projectId) errors.unshift("Which project?");
    if (requestedRole === undefined && allocationPercent === undefined) {
      errors.push("Nothing to change.");
    }
    if (errors.length > 0) return validationError(errors);

    // Keeping PM is fine for somebody who already is one; becoming one is not.
    if (requestedRole === PM) {
      const current = await projectDb("project_team_members")
        .where({ project_id: projectId, user_id: userId, is_active: true })
        .first<{ role_in_project: string | null } | undefined>();
      if (toTeamRole(current?.role_in_project) !== PM) return pmSelfRefused();
    }

    const updates: Record<string, unknown> = { updated_at: new Date() };
    if (requestedRole !== undefined) updates.role_in_project = requestedRole;
    if (allocationPercent !== undefined) updates.allocation_percent = allocationPercent;

    const count = await projectDb("project_team_members")
      .where({ project_id: projectId, user_id: userId, is_active: true })
      .update(updates);
    if (!count) {
      return NextResponse.json({ success: false, error: "You are not on this project." }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return serverError("me.projects.PATCH", err);
  }
}

/**
 * Take yourself off a project.
 *
 * The row is deactivated, never deleted: hours already logged against the
 * project are a financial record, and a PM may have priced the
 * assignment. Adding yourself back reactivates the same row.
 */
export async function DELETE(req: Request) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;
    if (auth.session.role === "client") return clientRefused();
    const userId = auth.session.userId;

    const projectId = (new URL(req.url).searchParams.get("projectId") ?? "").trim();
    if (!projectId) return validationError(["Which project?"]);

    const count = await projectDb("project_team_members")
      .where({ project_id: projectId, user_id: userId, is_active: true })
      .update({ is_active: false, updated_at: new Date() });
    if (!count) {
      return NextResponse.json({ success: false, error: "You are not on this project." }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return serverError("me.projects.DELETE", err);
  }
}
