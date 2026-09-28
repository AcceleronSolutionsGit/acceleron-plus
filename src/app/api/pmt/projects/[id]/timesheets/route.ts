// POST  /api/pmt/projects/[id]/timesheets  — log hours
// GET   /api/pmt/projects/[id]/timesheets  — list timesheets

import { NextRequest, NextResponse } from "next/server";
import { projectDb } from "@/lib/db";
import { requireProjectCapability, can } from "@/lib/auth";
import { mapProjectTimesheetRow } from "@/lib/row-mapper";

const DAILY_HOURS = 8;

// ─── GET /api/pmt/projects/[id]/timesheets ─────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idOrCode } = await params;
  // Logging time is the baseline capability here; a client has neither it
  // nor timesheet.viewAll, so this keeps the client portal out entirely.
  const guard = await requireProjectCapability(idOrCode, "timesheet.logOwn");
  if (!guard.ok) return guard.response;
  const { session, access } = guard;
  const projectId = guard.project.id;

  const { searchParams } = new URL(req.url);
  const startDate   = searchParams.get("startDate");
  const endDate     = searchParams.get("endDate");
  const filterUser  = searchParams.get("userId");
  const wbsItemId   = searchParams.get("wbsItemId");
  const activityType = searchParams.get("activityType");
  const status      = searchParams.get("status");
  const page        = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit       = Math.min(200, parseInt(searchParams.get("limit") ?? "50"));
  const offset      = (page - 1) * limit;

  // Without timesheet.viewAll a person sees only their own entries.
  const isMember = !can(access, "timesheet.viewAll");
  const effectiveUserId = isMember ? session.userId : (filterUser ?? null);

  let query = projectDb("project_timesheets").where("project_id", projectId);
  if (startDate)       query = query.where("log_date", ">=", startDate);
  if (endDate)         query = query.where("log_date", "<=", endDate);
  if (wbsItemId)       query = query.where("wbs_item_id", wbsItemId);
  if (activityType)    query = query.where("activity_type", activityType);
  if (status)          query = query.where("status", status);

  // Aggregation summary
  const [sumResult, countByActivity, countByStatus, totalCount] = await Promise.all([
    projectDb("project_timesheets")
      .where("project_id", projectId)
      .modify((q: any) => {
        if (effectiveUserId) q.where("user_id", effectiveUserId);
        if (startDate) q.where("log_date", ">=", startDate);
        if (endDate) q.where("log_date", "<=", endDate);
      })
      .sum("hours_logged as total")
      .first(),
    projectDb("project_timesheets")
      .where("project_id", projectId)
      .modify((q: any) => {
        if (effectiveUserId) q.where("user_id", effectiveUserId);
        if (startDate) q.where("log_date", ">=", startDate);
        if (endDate) q.where("log_date", "<=", endDate);
      })
      .select("activity_type")
      .sum("hours_logged as total_hours")
      .groupBy("activity_type"),
    projectDb("project_timesheets")
      .where("project_id", projectId)
      .select("status")
      .count("id as count")
      .groupBy("status"),
    query.clone().count("id as count").first(),
  ]);

  const rows = await query.orderBy("log_date", "desc").limit(limit).offset(offset);
  const entries = rows.map(mapProjectTimesheetRow);

  // Attach rate band from project_team_members (privacy: band name only, not cost)
  const memberMap = await projectDb("project_team_members")
    .where("project_id", projectId)
    .select("user_id", "rate_band_name", "rate_band_id");
  const bandByUser: Record<string, { rateBandName?: string }> = {};
  for (const m of memberMap) {
    bandByUser[m.user_id] = { rateBandName: m.rate_band_name };
  }

  const enriched = entries.map((e: any) => ({
    ...e,
    rateBandName: bandByUser[e.userId]?.rateBandName ?? null,
  }));

  const byStatusMap: Record<string, number> = {};
  for (const s of countByStatus) { byStatusMap[s.status] = parseInt(s.count); }

  return NextResponse.json({
    success: true,
    meta: {
      projectId,
      period: { startDate: startDate ?? null, endDate: endDate ?? null },
      totalHours: parseFloat((sumResult as any)?.total ?? 0),
      totalEntries: parseInt((totalCount as any)?.count ?? 0),
      page,
      limit,
      totalPages: Math.ceil(parseInt((totalCount as any)?.count ?? 0) / limit),
    },
    summary: {
      byActivityType: countByActivity.map((r: any) => ({
        activityType: r.activity_type,
        totalHours: parseFloat(r.total_hours),
      })),
      byStatus: byStatusMap,
    },
    data: enriched,
  });
}

// ─── POST /api/pmt/projects/[id]/timesheets ────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idOrCode } = await params;
  const guard = await requireProjectCapability(idOrCode, "timesheet.logOwn");
  if (!guard.ok) return guard.response;
  const { session, project } = guard;
  const projectId = project.id;

  const body = await req.json();
  const { wbsItemId, logDate, hoursLogged, activityType = "development", notes } = body;

  // ── Validate ────────────────────────────────────────────────────
  const errors: { field: string; message: string }[] = [];

  if (!logDate) errors.push({ field: "logDate", message: "Log date is required" });
  if (logDate && new Date(logDate) > new Date()) {
    errors.push({ field: "logDate", message: "Log date cannot be in the future" });
  }
  if (hoursLogged == null) errors.push({ field: "hoursLogged", message: "Hours logged is required" });
  if (typeof hoursLogged === "number" && (hoursLogged < 0.25 || hoursLogged > 24)) {
    errors.push({ field: "hoursLogged", message: "Must be between 0.25 and 24" });
  }

  const validActivities = ["discovery", "design", "development", "testing", "documentation", "meeting", "other"];
  if (!validActivities.includes(activityType)) {
    errors.push({ field: "activityType", message: `Must be one of: ${validActivities.join(", ")}` });
  }

  if (errors.length > 0) {
    return NextResponse.json({ success: false, error: "VALIDATION_FAILED", details: errors }, { status: 400 });
  }

  // ── Check project status ────────────────────────────────────────
  if (project.status === "closed" || project.status === "cancelled") {
    return NextResponse.json({ success: false, error: "BUSINESS_RULE_VIOLATION", message: "Cannot log hours on a closed project" }, { status: 422 });
  }

  // ── Get user's rate band + WBS name (denormalized) ──────────────
  const [teamMember, wbsItem] = await Promise.all([
    projectDb("project_team_members").where({ project_id: projectId, user_id: session.userId }).first(),
    wbsItemId ? projectDb("wbs_items").where("id", wbsItemId).first() : Promise.resolve(null),
  ]);

  // ── Insert ──────────────────────────────────────────────────────
  const [row] = await projectDb("project_timesheets").insert({
    project_id:     projectId,
    user_id:        session.userId,
    user_name:      session.fullName ?? null,
    wbs_item_id:    wbsItemId ?? null,
    wbs_name:       wbsItem?.name ?? null,
    log_date:       logDate,
    hours_logged:   hoursLogged,
    activity_type:  activityType,
    notes:          notes ?? null,
    status:         "pending",
  }).returning("*");

  return NextResponse.json({
    success: true,
    data: {
      ...mapProjectTimesheetRow(row),
      rateBandName: teamMember?.rate_band_name ?? null,
      // Only the project's PM and admins see what an hour costs.
      internalCostInr: teamMember && can(guard.access, "team.viewCost")
        ? ((hoursLogged / DAILY_HOURS) * (teamMember.daily_cost_inr ?? 0))
        : null,
    },
  }, { status: 201 });
}
