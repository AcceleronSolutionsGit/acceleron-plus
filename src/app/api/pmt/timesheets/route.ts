// GET  /api/pmt/timesheets        — submitted timesheets pending approval (manager view)
// POST /api/pmt/timesheets        — bulk approve/reject
// GET  /api/pmt/timesheets/[id]   — single entry detail (done separately)
//
// Reporting managers see only the timesheets of people who report to them
// (see lib/reportees.ts). Admins see everything. Nobody reviews their own.

import { NextResponse } from "next/server";
import { projectDb } from "@/lib/db";
import { requireSession, projectsManagedBy } from "@/lib/auth";
import { readJson, serverError } from "@/lib/route-helpers";
import { toDateInput } from "@/lib/dates";
import { directReportUserIds } from "@/lib/reportees";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;
    const userId = auth.session.userId;
    // `role` is the derived app role, so super_admin and tenant_admin count too.
    const isAdmin = auth.session.role === "admin";

    const url = new URL(req.url);
    const statusFilter = url.searchParams.get("status") || "submitted";
    const projectFilter = url.searchParams.get("project") || "";
    const weekFilter = url.searchParams.get("week") || "";
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
    const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") ?? "50", 10)));
    const offset = (page - 1) * limit;

    // ── Find reportees & managed projects ─────────────────────────────
    // Admins see all; managers/PMs see direct reports OR projects they manage.
    let reporteeUserIds: string[] | null = null;
    let managedProjectIds: string[] | null = null;

    if (!isAdmin) {
      const [reportees, managedProjects] = await Promise.all([
        directReportUserIds(userId),
        projectsManagedBy(userId),
      ]);
      reporteeUserIds = reportees;
      managedProjectIds = Array.from(managedProjects);

      if (reporteeUserIds.length === 0 && managedProjectIds.length === 0) {
        return NextResponse.json({
          success: true,
          entries: [],
          meta: { total: 0, page, limit, totalPages: 0 },
          projects: [],
        });
      }
    }

    let query = projectDb("project_timesheets as ts")
      .join("projects as p", "p.id", "ts.project_id");

    if (statusFilter && statusFilter !== "all") {
      if (statusFilter === "submitted" || statusFilter === "pending") {
        query = query.whereIn("ts.status", ["submitted", "pending"]);
      } else {
        query = query.where("ts.status", statusFilter);
      }
    }
    if (projectFilter) {
      query = query.where("ts.project_id", projectFilter);
    }
    if (weekFilter) {
      // Show entries for the week containing this date
      const anchor = new Date(weekFilter);
      if (!isNaN(anchor.getTime())) {
        const dow = anchor.getDay();
        const monday = new Date(anchor);
        monday.setDate(monday.getDate() + (dow === 0 ? -6 : 1 - dow));
        monday.setHours(0, 0, 0, 0);
        const sunday = new Date(monday);
        sunday.setDate(sunday.getDate() + 6);
        query = query.whereBetween("ts.log_date", [
          monday.toISOString().slice(0, 10),
          sunday.toISOString().slice(0, 10),
        ]);
      }
    }
    if (!isAdmin) {
      query = query.where((q) => {
        let applied = false;
        if (reporteeUserIds && reporteeUserIds.length > 0) {
          q.whereIn("ts.user_id", reporteeUserIds);
          applied = true;
        }
        if (managedProjectIds && managedProjectIds.length > 0) {
          if (applied) {
            q.orWhereIn("ts.project_id", managedProjectIds);
          } else {
            q.whereIn("ts.project_id", managedProjectIds);
          }
        }
      });
    }

    const countRes = await query.clone().count<{ count: string }>("* as count").first();
    const total = parseInt(countRes?.count ?? "0", 10);

    const rows = (await query
      .clone()
      .select(
        "ts.id",
        "ts.project_id",
        "p.code as project_code",
        "p.name as project_name",
        "ts.user_id",
        "ts.user_name",
        "ts.log_date",
        "ts.hours_logged",
        "ts.activity_type",
        "ts.notes",
        "ts.status",
        "ts.submitted_at",
        "ts.reviewed_by_user_id",
        "ts.reviewed_at",
        "ts.rejection_reason",
        "ts.wbs_item_id"
      )
      .orderBy("ts.submitted_at", "asc")
      .limit(limit)
      .offset(offset)
      .catch(() => [])) as Record<string, unknown>[];

    // Active projects for filter dropdown
    const projects = (await projectDb("projects")
      .whereNotIn("status", ["cancelled"])
      .orderBy("code")
      .select("id", "code", "name")
      .catch(() => [])) as Record<string, unknown>[];

    return NextResponse.json({
      success: true,
      entries: rows.map((r) => ({
        id: String(r.id),
        projectId: String(r.project_id),
        projectCode: String(r.project_code),
        projectName: String(r.project_name),
        userId: String(r.user_id),
        userName: r.user_name ? String(r.user_name) : null,
        logDate: toDateInput(r.log_date as string),
        hours: Number(r.hours_logged ?? 0),
        activityType: r.activity_type ? String(r.activity_type) : "development",
        notes: r.notes ? String(r.notes) : null,
        status: String(r.status ?? "draft"),
        submittedAt: r.submitted_at ? new Date(String(r.submitted_at)).toISOString() : null,
        reviewedAt: r.reviewed_at ? new Date(String(r.reviewed_at)).toISOString() : null,
        rejectionReason: r.rejection_reason ? String(r.rejection_reason) : null,
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      projects: projects.map((p) => ({
        id: String(p.id),
        code: String(p.code),
        name: String(p.name),
      })),
    });
  } catch (err) {
    return serverError("pmt.timesheets.GET", err);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;
    const reviewerId = auth.session.userId;
    const isAdmin = auth.session.role === "admin";

    const parsed = await readJson(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.body as Record<string, unknown>;

    // ids: string[]  action: "approve" | "reject"  rejectionReason?: string
    const ids = Array.isArray(body.ids) ? (body.ids as string[]) : [];
    const action = String(body.action ?? "").trim();
    const rejectionReason = body.rejectionReason
      ? String(body.rejectionReason).trim()
      : null;

    if (ids.length === 0) {
      return NextResponse.json({ success: false, error: "No entries selected." }, { status: 400 });
    }
    if (action !== "approve" && action !== "reject") {
      return NextResponse.json({ success: false, error: 'Action must be "approve" or "reject".' }, { status: 400 });
    }
    if (action === "reject" && !rejectionReason) {
      return NextResponse.json({ success: false, error: "A reason is required when rejecting." }, { status: 400 });
    }

    const newStatus = action === "approve" ? "approved" : "rejected";

    // Who may this reviewer act on?
    // Admins act on anyone (except own).
    // Managers act on their direct reports.
    // Project managers act on projects they manage.
    let reportees: string[] | null = null;
    let managedProjects: string[] | null = null;

    if (!isAdmin) {
      const [rep, mProjects] = await Promise.all([
        directReportUserIds(reviewerId),
        projectsManagedBy(reviewerId),
      ]);
      reportees = rep;
      managedProjects = Array.from(mProjects);

      if (reportees.length === 0 && managedProjects.length === 0) {
        return NextResponse.json(
          { success: false, error: "You can only review timesheets from your direct reports or projects you manage." },
          { status: 403 }
        );
      }
    }

    let scoped = projectDb("project_timesheets")
      .whereIn("id", ids)
      .whereIn("status", ["submitted", "pending"]) // submitted or pending entries can be reviewed
      .whereNot("user_id", reviewerId);

    if (!isAdmin) {
      scoped = scoped.where((q) => {
        let applied = false;
        if (reportees && reportees.length > 0) {
          q.whereIn("user_id", reportees);
          applied = true;
        }
        if (managedProjects && managedProjects.length > 0) {
          if (applied) {
            q.orWhereIn("project_id", managedProjects);
          } else {
            q.whereIn("project_id", managedProjects);
          }
        }
      });
    }

    const updated = await scoped.update({
      status: newStatus,
      reviewed_by_user_id: reviewerId,
      approved_by_user_id: reviewerId,
      reviewed_at: new Date(),
      rejection_reason: action === "reject" ? rejectionReason : null,
      updated_at: new Date(),
    });

    const skipped = ids.length - Number(updated ?? 0);
    return NextResponse.json({
      success: true,
      action,
      count: Number(updated ?? 0),
      // Entries that were not submitted, are your own, or belong to
      // somebody who does not report to you are left untouched.
      skipped,
    });
  } catch (err) {
    return serverError("pmt.timesheets.POST", err);
  }
}
