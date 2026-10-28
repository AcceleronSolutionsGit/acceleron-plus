import { NextResponse } from "next/server";
import { identityDb, projectDb } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { readJson } from "@/lib/route-helpers";
import { plannedCostFor, parseAllocationPeriods } from "@/lib/staffing";
import { rateForMargin } from "@/lib/margin";
import { toDateInput } from "@/lib/dates";

export const runtime = "nodejs";

/**
 * POST /api/admin/external-users/[id]/allocations
 * Allocates a non-Darwinbox user to a project.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(["admin", "pm"]);
  if (!auth.ok) return auth.response;

  const { id: userId } = await params;
  if (!userId) {
    return NextResponse.json({ error: "User ID is required." }, { status: 400 });
  }

  const parsed = await readJson(req);
  if (!parsed.ok) return parsed.response;

  const body = parsed.body as {
    projectId?: string;
    roleInProject?: string;
    memberType?: string;
    customDailyCostInr?: number | string;
    allocationPercent?: number | string;
    allocationPeriods?: unknown;
    startDate?: string;
    endDate?: string;
    notes?: string;
  };

  const projectId = body.projectId?.trim();
  const roleInProject = body.roleInProject?.trim() || "Consultant";
  const memberType = body.memberType?.trim() || "consultant";
  const customDailyCostInr =
    body.customDailyCostInr !== undefined && body.customDailyCostInr !== ""
      ? Number(body.customDailyCostInr)
      : null;
  let allocationPercent =
    body.allocationPercent !== undefined && body.allocationPercent !== ""
      ? Math.max(1, Number(body.allocationPercent))
      : 100;

  if (!projectId) {
    return NextResponse.json({ error: "Project is required." }, { status: 400 });
  }

  try {
    // Verify user exists
    const user = await identityDb("users").where("id", userId).first();
    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    // Verify project exists
    const project = await projectDb("projects").where("id", projectId).first();
    if (!project) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    const allocationPeriods = parseAllocationPeriods(body.allocationPeriods);
    const hasPeriods = Boolean(allocationPeriods && allocationPeriods.length > 0);

    let startDate =
      toDateInput(body.startDate) ||
      (project.start_date ? toDateInput(project.start_date) : new Date().toISOString().split("T")[0]);
    let endDate =
      toDateInput(body.endDate) ||
      (project.planned_end_date ? toDateInput(project.planned_end_date) : (project.actual_end_date ? toDateInput(project.actual_end_date) : null));
    const notes = body.notes?.trim() || null;

    if (hasPeriods && allocationPeriods) {
      const pStarts = allocationPeriods.map((p) => p.startDate).filter(Boolean).sort();
      const pEnds = allocationPeriods.map((p) => p.endDate).filter(Boolean).sort();
      if (pStarts.length > 0) startDate = pStarts[0];
      if (pEnds.length > 0) endDate = pEnds[pEnds.length - 1];
      const sumAlloc = allocationPeriods.reduce((sum, p) => sum + Number(p.allocationPercent || 0), 0);
      if (sumAlloc > 0) allocationPercent = sumAlloc;
    }

    // Check if already actively allocated to this project
    const existing = await projectDb("project_team_members")
      .where("project_id", projectId)
      .where("user_id", userId)
      .where("is_active", true)
      .first();

    if (existing) {
      return NextResponse.json(
        { error: `${user.full_name} is already allocated to project ${project.name} (${project.code}).` },
        { status: 409 }
      );
    }

    const targetMargin =
      project.target_margin_percent !== null && project.target_margin_percent !== undefined
        ? Number(project.target_margin_percent)
        : null;
    const billableRate =
      customDailyCostInr && targetMargin !== null
        ? rateForMargin(customDailyCostInr, targetMargin)
        : null;

    const planned = plannedCostFor({
      startDate,
      endDate,
      allocationPercent,
      allocationPeriods,
      dailyCostInr: customDailyCostInr,
      dailyBillableRateInr: billableRate,
    });

    const [allocation] = await projectDb("project_team_members")
      .insert({
        project_id: projectId,
        user_id: userId,
        user_name: user.full_name,
        role_in_project: roleInProject,
        member_type: memberType,
        custom_daily_cost_inr: customDailyCostInr,
        daily_cost_inr: customDailyCostInr,
        daily_billable_rate_inr: billableRate,
        allocation_percent: allocationPercent,
        start_date: startDate,
        end_date: endDate,
        allocation_periods: allocationPeriods ? JSON.stringify(allocationPeriods) : null,
        planned_days: planned.plannedDays,
        planned_cost_inr: planned.plannedCostInr,
        planned_billable_inr: planned.plannedBillableInr,
        notes: notes,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning("*");

    return NextResponse.json({
      success: true,
      allocation,
      message: `${user.full_name} has been allocated to ${project.name}.`,
    });
  } catch (err) {
    console.error("[admin.external-users.allocations.POST]", err);
    return NextResponse.json({ error: "Could not create project allocation." }, { status: 500 });
  }
}
