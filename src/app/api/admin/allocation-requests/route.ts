// GET  /api/admin/allocation-requests   — list self-allocations (and old requests)
// POST /api/admin/allocation-requests   — review, remove, approve or reject
//
// Phase 1 is self-service: an employee adds themselves to a project and is
// on it at once (see /api/me/projects). Each one leaves a row here with
// status "self_allocated", and the reporting manager reviews it afterwards:
//
//   review  — self_allocated            → reviewed   (looks right)
//   remove  — self_allocated | reviewed → removed    (takes them off)
//
// Requests from before self-service can still be approved or rejected:
//
//   approve — pending → approved (adds them to the team)
//   reject  — pending → rejected
//
// Admins see all requests. Reporting managers see only requests from
// their direct reports (Darwinbox direct_manager_employee_id, or a manual
// employee_master.reporting_manager_user_id link — see lib/reportees.ts).
// On approval: a project_team_members row is inserted automatically.

import { NextResponse } from "next/server";
import { projectDb } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { readJson, serverError } from "@/lib/route-helpers";
import { directReportUserIds } from "@/lib/reportees";
import { DEVELOPER, PM, TEAM_LEAD, legacyToTeamRole } from "@/lib/team-roles";

/**
 * The role a request becomes on the team. A request is somebody speaking
 * for themselves, so it is never PM — that is granted on the Team tab by
 * an admin or the project's PMs.
 */
function teamRoleFromRequest(requested: unknown, fallback: unknown = DEVELOPER): string {
  const raw = requested ?? fallback;
  const role = legacyToTeamRole(raw);
  return role === PM ? TEAM_LEAD : role;
}

export const runtime = "nodejs";

/** Direct reports' user ids for a manager; null for an admin (unrestricted). */
async function reporteeUserIds(userId: string, isAdmin: boolean): Promise<string[] | null> {
  if (isAdmin) return null;
  return directReportUserIds(userId);
}

export async function GET(req: Request) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;
    const isAdmin = auth.session.role === "admin";
    const userId = auth.session.userId;

    // Managers see only their reportees; admins see all.
    const allowed = await reporteeUserIds(userId, isAdmin);
    if (!isAdmin && allowed !== null && allowed.length === 0) {
      return NextResponse.json({ success: true, requests: [] });
    }

    const url = new URL(req.url);
    const statusFilter = url.searchParams.get("status") || "self_allocated";

    let query = projectDb("project_allocation_requests as r")
      .join("projects as p", "p.id", "r.project_id")
      // Are they still on it? They may have taken themselves off since.
      .leftJoin("project_team_members as m", function () {
        this.on("m.project_id", "=", "r.project_id").andOn("m.user_id", "=", "r.user_id");
      })
      .select(
        "m.is_active as on_project",
        "r.id",
        "r.project_id",
        "p.code as project_code",
        "p.name as project_name",
        "r.user_id",
        "r.user_name",
        "r.employee_id",
        "r.requested_role",
        "r.requested_allocation_percent",
        "r.requested_start_date",
        "r.requested_end_date",
        "r.notes",
        "r.status",
        "r.review_notes",
        "r.reviewed_by_user_id",
        "r.reviewed_at",
        "r.created_at"
      )
      .orderBy("r.created_at", "asc");

    if (statusFilter !== "all") {
      query = query.where("r.status", statusFilter);
    } else {
      // Superseded requests are bookkeeping, not something to review.
      query = query.whereNot("r.status", "withdrawn");
    }
    // Scope to manager's reportees if not admin
    if (allowed !== null) {
      query = query.whereIn("r.user_id", allowed);
    }

    const rows = (await query.catch(() => [])) as Record<string, unknown>[];

    return NextResponse.json({
      success: true,
      requests: rows.map((r) => ({
        id: String(r.id),
        projectId: String(r.project_id),
        projectCode: String(r.project_code),
        projectName: String(r.project_name),
        userId: String(r.user_id),
        userName: r.user_name ? String(r.user_name) : null,
        employeeId: r.employee_id ? String(r.employee_id) : null,
        requestedRole: String(r.requested_role ?? ""),
        requestedAllocationPercent: Number(r.requested_allocation_percent ?? 100),
        requestedStartDate: r.requested_start_date ? String(r.requested_start_date) : null,
        requestedEndDate: r.requested_end_date ? String(r.requested_end_date) : null,
        notes: r.notes ? String(r.notes) : null,
        status: String(r.status ?? "pending"),
        onProject: r.on_project === true,
        reviewNotes: r.review_notes ? String(r.review_notes) : null,
        reviewedAt: r.reviewed_at ? new Date(String(r.reviewed_at)).toISOString() : null,
        createdAt: r.created_at ? new Date(String(r.created_at)).toISOString() : null,
      })),
    });
  } catch (err) {
    return serverError("admin.allocationRequests.GET", err);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;
    const isAdmin = auth.session.role === "admin";
    const reviewerId = auth.session.userId;

    const parsed = await readJson(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.body as Record<string, unknown>;

    const requestId = String(body.requestId ?? "").trim();
    const action = String(body.action ?? "").trim();
    const reviewNotes = body.reviewNotes ? String(body.reviewNotes).trim() : null;

    if (!requestId) {
      return NextResponse.json({ success: false, error: "Which request?" }, { status: 400 });
    }
    const FROM: Record<string, string[]> = {
      review: ["self_allocated"],
      remove: ["self_allocated", "reviewed"],
      approve: ["pending"],
      reject: ["pending"],
    };
    const TO: Record<string, string> = {
      review: "reviewed",
      remove: "removed",
      approve: "approved",
      reject: "rejected",
    };
    if (!FROM[action]) {
      return NextResponse.json(
        { success: false, error: 'Action must be "review", "remove", "approve" or "reject".' },
        { status: 400 }
      );
    }

    // Load the row and verify the reviewer is allowed to act on it.
    const request = await projectDb("project_allocation_requests")
      .where({ id: requestId })
      .whereIn("status", FROM[action])
      .first<Record<string, unknown> | undefined>();

    if (!request) {
      return NextResponse.json({ success: false, error: "Not found, or already dealt with." }, { status: 404 });
    }

    // Nobody approves their own request, admins included.
    if (String(request.user_id) === reviewerId) {
      return NextResponse.json(
        { success: false, error: "You cannot review your own request." },
        { status: 403 }
      );
    }

    // Non-admins can only review requests from their direct reports.
    if (!isAdmin) {
      const allowed = await reporteeUserIds(reviewerId, false);
      if (!allowed || !allowed.includes(String(request.user_id))) {
        return NextResponse.json(
          { success: false, error: "You can only review requests from your direct reports." },
          { status: 403 }
        );
      }
    }

    await projectDb.transaction(async (trx) => {
      // Update request status
      await trx("project_allocation_requests")
        .where("id", requestId)
        .update({
          status: TO[action],
          reviewed_by_user_id: reviewerId,
          reviewed_at: new Date(),
          review_notes: reviewNotes,
          updated_at: new Date(),
        });

      if (action === "remove") {
        // Off the project. Deactivated rather than deleted: any hours they
        // logged in the meantime stay on the books.
        await trx("project_team_members")
          .where({ project_id: String(request.project_id), user_id: String(request.user_id) })
          .update({ is_active: false, updated_at: new Date() });
      }

      if (action === "approve") {
        // Check if already a team member (race condition guard)
        const existing = await trx("project_team_members")
          .where({
            project_id: String(request.project_id),
            user_id: String(request.user_id),
          })
          .first();

        if (!existing) {
          await trx("project_team_members").insert({
            project_id: String(request.project_id),
            user_id: String(request.user_id),
            user_name: request.user_name ? String(request.user_name) : null,
            employee_id: request.employee_id ? String(request.employee_id) : null,
            role_in_project: teamRoleFromRequest(request.requested_role),
            allocation_percent: Number(request.requested_allocation_percent ?? 100),
            start_date: request.requested_start_date ? String(request.requested_start_date) : null,
            end_date: request.requested_end_date ? String(request.requested_end_date) : null,
            is_active: true,
            created_at: new Date(),
            updated_at: new Date(),
          });
        } else {
          // Reactivate if deactivated
          await trx("project_team_members")
            .where({
              project_id: String(request.project_id),
              user_id: String(request.user_id),
            })
            .update({
              is_active: true,
              // An existing PM row keeps PM; otherwise the requested role.
              role_in_project:
                legacyToTeamRole(existing.role_in_project) === PM && existing.is_active
                  ? PM
                  : teamRoleFromRequest(request.requested_role, existing.role_in_project),
              allocation_percent: Number(request.requested_allocation_percent ?? existing.allocation_percent),
              updated_at: new Date(),
            });
        }
      }
    });

    return NextResponse.json({ success: true, action, requestId });
  } catch (err) {
    return serverError("admin.allocationRequests.POST", err);
  }
}
