// GET /api/pmt/projects/[id]/cost-summary
// Privacy-safe: all costs are at band level, never individual salary

import { NextRequest, NextResponse } from "next/server";
import { projectDb, itsmDb } from "@/lib/db";
import { requireProjectCapability } from "@/lib/auth";
import { getProjectTeam } from "@/lib/staffing";

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
      "ptm.member_type",
      "ptm.custom_daily_cost_inr",
      "ptm.daily_cost_inr as member_daily_cost",
      "ptm.daily_billable_rate_inr as member_daily_billable",
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

  const budgetedFeeInr = project.budget_inr !== null && project.budget_inr !== undefined
    ? parseFloat(project.budget_inr)
    : (solutioningSession?.proposed_fee_inr ? parseFloat(solutioningSession.proposed_fee_inr) : 0);
  const poValue = project.po_id
    ? (await projectDb("purchase_orders").where("id", project.po_id).first())?.po_value_inr ?? 0
    : 0;

  // ── Fetch total planned hours and planned labor cost from project team staffing ──
  const team = await getProjectTeam(projectId, { includeCost: true });
  const totalPlannedDays = team.reduce((sum, tm) => sum + (tm.cost?.plannedDays || 0), 0);
  const totalPlannedHours = totalPlannedDays * DAILY_HOURS;
  const plannedLaborCostInr = team.reduce((sum, tm) => sum + (tm.cost?.plannedCostInr || 0), 0);

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
    const effectiveDailyCost =
      ts.custom_daily_cost_inr !== null && ts.custom_daily_cost_inr !== undefined
        ? parseFloat(ts.custom_daily_cost_inr)
        : parseFloat(ts.member_daily_cost ?? ts.daily_cost_inr ?? 0);

    if (!bandMap[band]) {
      bandMap[band] = {
        rateBandName: band,
        levelCode: ts.level_code ?? "—",
        dailyCostInr: effectiveDailyCost,
        dailyBillableRateInr: parseFloat(ts.member_daily_billable ?? ts.daily_billable_rate_inr ?? 0),
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
  const wbsById: Record<string, any> = {};
  for (const w of wbsItems) wbsById[w.id] = w;

  function getPhase(wbsName: string | null): string {
    if (!wbsName) return "General";
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
    const effectiveDailyCost =
      ts.custom_daily_cost_inr !== null && ts.custom_daily_cost_inr !== undefined
        ? parseFloat(ts.custom_daily_cost_inr)
        : parseFloat(ts.member_daily_cost ?? ts.daily_cost_inr ?? 0);
    const costPerHour = effectiveDailyCost / DAILY_HOURS;
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

  // ── Overhead & Additional Costs ────────────────────────────────
  const overheadPercent = parseFloat(
    project.overhead_percent !== undefined && project.overhead_percent !== null
      ? project.overhead_percent
      : (solutioningSession?.overhead_margin_percent ?? 0)
  );

  const plannedOverheadInr = parseFloat(((plannedLaborCostInr * overheadPercent) / 100).toFixed(2));
  const actualOverheadInr = parseFloat(((totalInternalCostInr * overheadPercent) / 100).toFixed(2));
  const overheadVarianceInr = parseFloat((plannedOverheadInr - actualOverheadInr).toFixed(2));

  // Query additional costs
  let additionalCostRows = await projectDb("project_additional_costs")
    .where("project_id", projectId)
    .orderBy("created_at", "asc");

  // Fallback if none in project_additional_costs but session has some
  if (additionalCostRows.length === 0 && solutioningSession) {
    const sessionCosts = await projectDb("solutioning_additional_costs")
      .where("session_id", solutioningSession.id)
      .orderBy("sequence", "asc");
    if (sessionCosts.length > 0) {
      additionalCostRows = sessionCosts.map((sc) => ({
        id: sc.id,
        project_id: projectId,
        category: sc.category || "other",
        description: sc.description,
        planned_amount_inr: sc.amount_inr,
        actual_amount_inr: 0,
        status: "planned",
        notes: "From solutioning session",
        created_at: sc.created_at,
        updated_at: sc.updated_at,
      }));
    }
  }

  const additionalCostItems = additionalCostRows.map((c) => {
    const planned = c.po_value_inr !== null && c.po_value_inr !== undefined && c.po_value_inr !== ""
      ? parseFloat(c.po_value_inr)
      : parseFloat(c.planned_amount_inr || 0);
    const actual = c.invoice_value_inr !== null && c.invoice_value_inr !== undefined && c.invoice_value_inr !== ""
      ? parseFloat(c.invoice_value_inr)
      : parseFloat(c.actual_amount_inr || 0);
    return {
      id: c.id,
      category: c.category || "other",
      description: c.description,
      plannedAmountInr: planned,
      actualAmountInr: actual,
      varianceInr: parseFloat((planned - actual).toFixed(2)),
      status: c.status || "planned",
      notes: c.notes,
      poNumber: c.po_number || null,
      poValueInr: c.po_value_inr !== null && c.po_value_inr !== undefined ? parseFloat(c.po_value_inr) : null,
      invoiceNumber: c.invoice_number || null,
      invoiceValueInr: c.invoice_value_inr !== null && c.invoice_value_inr !== undefined ? parseFloat(c.invoice_value_inr) : null,
      invoiceDate: c.invoice_date || null,
      vendorName: c.vendor_name || null,
    };
  });

  const totalPlannedAdditionalCostInr = parseFloat(
    additionalCostItems.reduce((s, c) => s + c.plannedAmountInr, 0).toFixed(2)
  );
  const totalDirectActualAdditionalCostInr = parseFloat(
    additionalCostItems.reduce((s, c) => s + c.actualAmountInr, 0).toFixed(2)
  );
  const totalActualAdditionalCostInr = parseFloat(
    (totalDirectActualAdditionalCostInr + itsmContribution.totalCostInr).toFixed(2)
  );
  const additionalCostVarianceInr = parseFloat(
    (totalPlannedAdditionalCostInr - totalActualAdditionalCostInr).toFixed(2)
  );

  // Group additional costs by category
  const categoryMap: Record<string, { category: string; plannedInr: number; actualInr: number; varianceInr: number; count: number }> = {};
  for (const item of additionalCostItems) {
    const cat = item.category;
    if (!categoryMap[cat]) {
      categoryMap[cat] = { category: cat, plannedInr: 0, actualInr: 0, varianceInr: 0, count: 0 };
    }
    categoryMap[cat].plannedInr += item.plannedAmountInr;
    categoryMap[cat].actualInr += item.actualAmountInr;
    categoryMap[cat].count += 1;
  }
  if (itsmContribution.totalCostInr > 0) {
    categoryMap["itsm_support"] = {
      category: "itsm_support",
      plannedInr: 0,
      actualInr: itsmContribution.totalCostInr,
      varianceInr: -itsmContribution.totalCostInr,
      count: itsmContribution.breakdown.length,
    };
  }
  const additionalCostByCategory = Object.values(categoryMap).map((cat) => ({
    category: cat.category,
    plannedInr: parseFloat(cat.plannedInr.toFixed(2)),
    actualInr: parseFloat(cat.actualInr.toFixed(2)),
    varianceInr: parseFloat((cat.plannedInr - cat.actualInr).toFixed(2)),
    count: cat.count,
  }));

  // ── Overall Totals (Planned vs Actual) ──────────────────────────
  const totalPlannedCostInr = parseFloat(
    (plannedLaborCostInr + plannedOverheadInr + totalPlannedAdditionalCostInr).toFixed(2)
  );
  const totalActualCostInr = parseFloat(
    (totalInternalCostInr + actualOverheadInr + totalActualAdditionalCostInr).toFixed(2)
  );
  const totalCostVarianceInr = parseFloat((totalPlannedCostInr - totalActualCostInr).toFixed(2));

  const plannedMarginInr = parseFloat((budgetedFeeInr - totalPlannedCostInr).toFixed(2));
  const plannedMarginPercent = budgetedFeeInr > 0 ? parseFloat(((plannedMarginInr / budgetedFeeInr) * 100).toFixed(2)) : 0;

  const actualMarginInr = parseFloat((budgetedFeeInr - totalActualCostInr).toFixed(2));
  const actualMarginPercent = budgetedFeeInr > 0 ? parseFloat(((actualMarginInr / budgetedFeeInr) * 100).toFixed(2)) : 0;

  const totalAllHours = totalProjectHours + itsmContribution.totalHours;
  const legacyMarginInr = budgetedFeeInr - totalInternalCostInr;
  const legacyMarginPct = budgetedFeeInr > 0 ? (legacyMarginInr / budgetedFeeInr) * 100 : 0;
  const budgetUtilPct = budgetedFeeInr > 0 ? (totalActualCostInr / budgetedFeeInr) * 100 : 0;

  return NextResponse.json({
    success: true,
    data: {
      projectId,
      projectCode: project.code,
      projectName: project.name,
      budget: {
        budgetedFeeInr:    parseFloat(budgetedFeeInr.toFixed(2)),
        poValueInr:        parseFloat(poValue.toFixed(2)),
        totalPlannedHours: parseFloat(totalPlannedHours.toFixed(2)),
        currency:          "INR",
      },
      actuals: {
        totalProjectHoursLogged: parseFloat(totalProjectHours.toFixed(2)),
        totalItsmHoursLogged:    itsmContribution.totalHours,
        totalHoursLogged:        parseFloat(totalAllHours.toFixed(2)),
        totalInternalCostInr:    parseFloat(totalInternalCostInr.toFixed(2)),
        totalBillableValueInr:   parseFloat(totalBillableValueInr.toFixed(2)),
        marginInr:               parseFloat(actualMarginInr.toFixed(2)),
        marginPercent:           parseFloat(actualMarginPercent.toFixed(2)),
        budgetUtilizedPercent:   parseFloat(budgetUtilPct.toFixed(2)),
        // Legacy backward compatibility
        legacyMarginInr:         parseFloat(legacyMarginInr.toFixed(2)),
        legacyMarginPercent:     parseFloat(legacyMarginPct.toFixed(2)),
      },
      // ── Detailed Planned vs Actual Breakdown ──
      labor: {
        plannedHours:    parseFloat(totalPlannedHours.toFixed(2)),
        actualHours:     parseFloat(totalProjectHours.toFixed(2)),
        varianceHours:   parseFloat((totalPlannedHours - totalProjectHours).toFixed(2)),
        plannedCostInr:  parseFloat(plannedLaborCostInr.toFixed(2)),
        actualCostInr:   parseFloat(totalInternalCostInr.toFixed(2)),
        varianceCostInr: parseFloat((plannedLaborCostInr - totalInternalCostInr).toFixed(2)),
      },
      overhead: {
        percent:         overheadPercent,
        plannedInr:      plannedOverheadInr,
        actualInr:       actualOverheadInr,
        varianceInr:     overheadVarianceInr,
      },
      additionalCosts: {
        totalPlannedInr: totalPlannedAdditionalCostInr,
        totalActualInr:  totalActualAdditionalCostInr,
        directActualInr: totalDirectActualAdditionalCostInr,
        itsmCostInr:     itsmContribution.totalCostInr,
        varianceInr:     additionalCostVarianceInr,
        items:           additionalCostItems,
        byCategory:      additionalCostByCategory,
      },
      totals: {
        plannedTotalCostInr:  totalPlannedCostInr,
        actualTotalCostInr:   totalActualCostInr,
        varianceCostInr:      totalCostVarianceInr,
        plannedMarginInr:     plannedMarginInr,
        plannedMarginPercent: plannedMarginPercent,
        actualMarginInr:      actualMarginInr,
        actualMarginPercent:  actualMarginPercent,
      },
      costByBand,
      costByPhase,
      itsmContribution,
      generatedAt: new Date().toISOString(),
    },
  });
}
