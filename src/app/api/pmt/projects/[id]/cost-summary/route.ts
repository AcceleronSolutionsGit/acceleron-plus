// GET /api/pmt/projects/[id]/cost-summary
// Privacy-safe: all costs are at band level, never individual salary

import { NextRequest, NextResponse } from "next/server";
import { projectDb, itsmDb } from "@/lib/db";
import { requireProjectCapability } from "@/lib/auth";

const DAILY_HOURS = 8;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // Cost is commercial data: financials.view keeps members and clients out.
  const guard = await requireProjectCapability(id, "financials.view");
  if (!guard.ok) return guard.response;
  const projectId = guard.project.id;

  const { searchParams } = new URL(req.url);
  const startDate    = searchParams.get("startDate");
  const endDate      = searchParams.get("endDate");
  const includeItsm  = searchParams.get("includeItsm") !== "false"; // default true

  // ── Fetch project ───────────────────────────────────────────────
  const project = await projectDb("projects").where("id", projectId).first();
  if (!project) return NextResponse.json({ success: false, error: "NOT_FOUND" }, { status: 404 });

  // ── Fetch all timesheets + team member band info ─────────────────
  // Join timesheets → team_members → rate_bands to get cost-per-hour (band level)
  let tsQuery = projectDb("project_timesheets as ts")
    .leftJoin("project_team_members as ptm", function () {
      this.on("ptm.project_id", "ts.project_id").andOn("ptm.user_id", "ts.user_id");
    })
    .leftJoin("employee_rate_bands as erb", "ptm.rate_band_id", "erb.id")
    .where("ts.project_id", projectId)
    .select(
      "ts.id",
      "ts.user_id",
      "ts.wbs_name",
      "ts.log_date",
      "ts.hours_logged",
      "ts.activity_type",
      "ts.status",
      "ptm.rate_band_name",
      "ptm.rate_band_id",
      "erb.level_code",
      "erb.daily_cost_inr",
      "erb.daily_billable_rate_inr"
    );

  if (startDate) tsQuery = tsQuery.where("ts.log_date", ">=", startDate);
  if (endDate)   tsQuery = tsQuery.where("ts.log_date", "<=", endDate);

  const timesheets = await tsQuery;

  // ── Fetch WBS-phase mapping ──────────────────────────────────────
  const wbsItems = await projectDb("wbs_items").where("project_id", projectId).select("id", "name", "code", "parent_wbs_id");

  // ── Fetch solutioning session for budgeted numbers ───────────────
  const solutioningSession = project.lead_id
    ? await projectDb("solutioning_sessions")
        .where("lead_id", project.lead_id)
        .where("status", "finalized")
        .first()
    : null;

  const budgetedFeeInr = solutioningSession?.proposed_fee_inr ?? project.budget_inr ?? 0;
  const poValue = project.po_id
    ? (await projectDb("purchase_orders").where("id", project.po_id).first())?.po_value_inr ?? 0
    : 0;

  // ── Fetch total planned hours from project_team_members ──────────
  const teamMembers = await projectDb("project_team_members").where("project_id", projectId);
  const totalPlannedDays = teamMembers.reduce((sum: number, tm: any) => sum + (parseFloat(tm.planned_days) || 0), 0);
  const totalPlannedHours = totalPlannedDays * DAILY_HOURS;

  // ── Budgeted cost per WBS from solutioning line items ───────────
  let budgetedByPhase: Record<string, number> = {};
  if (solutioningSession) {
    const lineItems = await projectDb("solutioning_line_items")
      .where("session_id", solutioningSession.id);
    for (const item of lineItems) {
      const phase = item.phase_name ?? "General";
      budgetedByPhase[phase] = (budgetedByPhase[phase] ?? 0) + parseFloat(item.subtotal_inr ?? 0);
    }
  }

  // ── Aggregate by Rate Band ──────────────────────────────────────
  const bandMap: Record<string, {
    rateBandName: string;
    levelCode: string;
    dailyCostInr: number;
    dailyBillableRateInr: number;
    userIds: Set<string>;
    totalHours: number;
  }> = {};

  for (const ts of timesheets) {
    const band = ts.rate_band_name ?? "Unassigned";
    if (!bandMap[band]) {
      bandMap[band] = {
        rateBandName: band,
        levelCode: ts.level_code ?? "—",
        dailyCostInr: parseFloat(ts.daily_cost_inr ?? 0),
        dailyBillableRateInr: parseFloat(ts.daily_billable_rate_inr ?? 0),
        userIds: new Set(),
        totalHours: 0,
      };
    }
    bandMap[band].userIds.add(ts.user_id);
    bandMap[band].totalHours += parseFloat(ts.hours_logged);
  }

  const costByBand = Object.values(bandMap).map((b) => {
    const totalDays    = b.totalHours / DAILY_HOURS;
    const totalCostInr = totalDays * b.dailyCostInr;
    const totalBillableInr = totalDays * b.dailyBillableRateInr;
    return {
      rateBandName:        b.rateBandName,
      levelCode:           b.levelCode,
      resourceCount:       b.userIds.size,
      totalHours:          parseFloat(b.totalHours.toFixed(2)),
      totalDays:           parseFloat(totalDays.toFixed(2)),
      dailyCostInr:        b.dailyCostInr,
      totalCostInr:        parseFloat(totalCostInr.toFixed(2)),
      billableRateInr:     b.dailyBillableRateInr,
      totalBillableInr:    parseFloat(totalBillableInr.toFixed(2)),
    };
  }).sort((a, b) => b.totalCostInr - a.totalCostInr);

  // ── Aggregate by Phase (WBS parent) ────────────────────────────
  // Map wbs_name → parent phase name
  const wbsById: Record<string, any> = {};
  for (const w of wbsItems) wbsById[w.id] = w;

  function getPhase(wbsName: string | null): string {
    if (!wbsName) return "General";
    // Find WBS item by name and resolve its top-level parent
    const found = wbsItems.find((w) => w.name === wbsName);
    if (!found) return wbsName;
    if (!found.parent_wbs_id) return found.name;
    const parent = wbsById[found.parent_wbs_id];
    return parent?.name ?? found.name;
  }

  const phaseMap: Record<string, { totalHours: number; totalCostInr: number }> = {};

  for (const ts of timesheets) {
    const phase = getPhase(ts.wbs_name);
    if (!phaseMap[phase]) phaseMap[phase] = { totalHours: 0, totalCostInr: 0 };
    const hours = parseFloat(ts.hours_logged);
    const costPerHour = (parseFloat(ts.daily_cost_inr ?? 0)) / DAILY_HOURS;
    phaseMap[phase].totalHours += hours;
    phaseMap[phase].totalCostInr += hours * costPerHour;
  }

  const costByPhase = Object.entries(phaseMap).map(([phaseName, vals]) => {
    const budgeted = budgetedByPhase[phaseName] ?? 0;
    const variance = budgeted - vals.totalCostInr;
    return {
      phaseName,
      totalHours:      parseFloat(vals.totalHours.toFixed(2)),
      totalCostInr:    parseFloat(vals.totalCostInr.toFixed(2)),
      budgetedCostInr: parseFloat(budgeted.toFixed(2)),
      varianceInr:     parseFloat(variance.toFixed(2)),
      variancePercent: budgeted > 0 ? parseFloat(((variance / budgeted) * 100).toFixed(2)) : 0,
    };
  });

  const totalProjectHours = timesheets.reduce((s: number, r: any) => s + parseFloat(r.hours_logged), 0);
  const totalInternalCostInr = costByBand.reduce((s, b) => s + b.totalCostInr, 0);
  const totalBillableValueInr = costByBand.reduce((s, b) => s + b.totalBillableInr, 0);

  // ── ITSM time logs linked to this project ───────────────────────
  let itsmContribution = {
    totalHours: 0,
    totalCostInr: 0,
    breakdown: [] as any[],
  };

  if (includeItsm && project.itsm_context_id) {
    const itsmLogs = await itsmDb("time_logs")
      .where("project_id", projectId)
      .select(
        itsmDb.raw("CASE WHEN ticket_id IS NOT NULL THEN 'ticket' ELSE 'change_request' END as entity_type"),
        itsmDb.raw("COUNT(*) as count"),
        itsmDb.raw("SUM(hours_logged) as total_hours")
      )
      .groupByRaw("CASE WHEN ticket_id IS NOT NULL THEN 'ticket' ELSE 'change_request' END");

    // We approximate ITSM cost using the project's avg band cost
    const avgBandCostPerHour = totalProjectHours > 0
      ? (totalInternalCostInr / totalProjectHours)
      : 0;

    let itsmTotalHours = 0;
    let itsmTotalCost = 0;

    const itsmBreakdown = itsmLogs.map((r: any) => {
      const hours = parseFloat(r.total_hours);
      const cost  = parseFloat((hours * avgBandCostPerHour).toFixed(2));
      itsmTotalHours += hours;
      itsmTotalCost  += cost;
      return {
        type: r.entity_type === "ticket" ? "incident/sr" : "change_request",
        count: parseInt(r.count),
        totalHours: parseFloat(hours.toFixed(2)),
        totalCostInr: cost,
      };
    });

    itsmContribution = {
      totalHours: parseFloat(itsmTotalHours.toFixed(2)),
      totalCostInr: parseFloat(itsmTotalCost.toFixed(2)),
      breakdown: itsmBreakdown,
    };
  }

  const totalAllHours = totalProjectHours + itsmContribution.totalHours;
  const marginInr     = budgetedFeeInr - totalInternalCostInr;
  const marginPct     = budgetedFeeInr > 0 ? (marginInr / budgetedFeeInr) * 100 : 0;
  const budgetUtilPct = budgetedFeeInr > 0 ? (totalInternalCostInr / budgetedFeeInr) * 100 : 0;

  return NextResponse.json({
    success: true,
    data: {
      projectId,
      projectCode: project.code,
      projectName: project.name,
      budget: {
        budgetedFeeInr:    parseFloat(budgetedFeeInr),
        poValueInr:        parseFloat(poValue),
        totalPlannedHours: parseFloat(totalPlannedHours.toFixed(2)),
        currency:          "INR",
      },
      actuals: {
        totalProjectHoursLogged: parseFloat(totalProjectHours.toFixed(2)),
        totalItsmHoursLogged:    itsmContribution.totalHours,
        totalHoursLogged:        parseFloat(totalAllHours.toFixed(2)),
        totalInternalCostInr:    parseFloat(totalInternalCostInr.toFixed(2)),
        totalBillableValueInr:   parseFloat(totalBillableValueInr.toFixed(2)),
        marginInr:               parseFloat(marginInr.toFixed(2)),
        marginPercent:           parseFloat(marginPct.toFixed(2)),
        budgetUtilizedPercent:   parseFloat(budgetUtilPct.toFixed(2)),
      },
      costByBand,
      costByPhase,
      itsmContribution,
      generatedAt: new Date().toISOString(),
    },
  });
}
