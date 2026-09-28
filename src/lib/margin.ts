// ═══════════════════════════════════════════════════════════════
// Project margin.
//
// Margin is what the project earns over what it costs, as a share of
// what the client is billed:
//
//     margin % = (billable − cost) ÷ billable × 100
//
// Not cost ÷ billable, and not billable ÷ cost. Getting this wrong by
// one arrangement is how a 40% project quietly becomes a 29% one, so
// it lives in exactly one function.
//
// Three numbers matter and they answer different questions:
//
//   target    what the PM committed to
//   planned   what the staffing plan implies, before anybody works
//   actual    what the hours logged so far have earned
// ═══════════════════════════════════════════════════════════════

import { projectDb } from "./db";
import { getProjectTeam, teamTotals, HOURS_PER_DAY } from "./staffing";

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Margin as a percentage of revenue.
 *
 * Null when nothing is billable: a project with no revenue has no
 * margin, and reporting 0% or −100% would both be inventing a figure.
 */
export function marginPercent(billable: number, cost: number): number | null {
  if (!billable || billable <= 0) return null;
  return round2(((billable - cost) / billable) * 100);
}

/**
 * The billable day rate that hits a target margin at a given cost.
 *
 *     billable = cost ÷ (1 − margin)
 *
 * A target of 100% or more has no solution — you cannot reach it at
 * any finite price — so it returns null rather than infinity.
 */
export function rateForMargin(dailyCost: number, targetPercent: number): number | null {
  if (!Number.isFinite(dailyCost) || dailyCost <= 0) return null;
  if (!Number.isFinite(targetPercent) || targetPercent >= 100) return null;
  return round2(dailyCost / (1 - targetPercent / 100));
}

export interface MarginPicture {
  targetPercent: number | null;
  setBy: string | null;
  setAt: string | null;
  notes: string | null;

  planned: {
    costInr: number;
    billableInr: number;
    marginInr: number;
    marginPercent: number | null;
    /** Percentage points above or below target. */
    variancePoints: number | null;
  };

  actual: {
    costInr: number;
    billableInr: number;
    marginInr: number;
    marginPercent: number | null;
    variancePoints: number | null;
    /** Days logged, for context on how meaningful "actual" is yet. */
    daysLogged: number;
  };

  /** The project's stated budget, for comparison with billable value. */
  budgetInr: number | null;
  headcount: number;
  /** True when a target is set and planned margin falls below it. */
  belowTarget: boolean;
}

/**
 * Everything a PM needs to see about a project's commercials.
 *
 * Built from the staffed team rather than from invoices: the question
 * is whether the shape of the delivery earns what was promised, and
 * that is answerable long before anybody invoices.
 */
export async function marginFor(projectId: string): Promise<MarginPicture> {
  const [project, team] = await Promise.all([
    projectDb("projects")
      .where("id", projectId)
      .select(
        "budget_inr",
        "target_margin_percent",
        "margin_set_by_user_id",
        "margin_set_at",
        "margin_notes"
      )
      .first<Record<string, unknown> | undefined>(),
    getProjectTeam(projectId, { includeCost: true }),
  ]);

  const totals = teamTotals(team);
  const target =
    project?.target_margin_percent === null || project?.target_margin_percent === undefined
      ? null
      : Number(project.target_margin_percent);

  // Actual billable follows the same rate the plan used, applied to the
  // days actually logged — so the comparison is like for like.
  const actualBillable = round2(
    team.reduce((sum, member) => {
      const rate = member.cost?.dailyBillableRateInr ?? 0;
      return sum + (member.cost?.actualDays ?? 0) * rate;
    }, 0)
  );

  const plannedMargin = marginPercent(totals.plannedBillableInr, totals.plannedCostInr);
  const actualMargin = marginPercent(actualBillable, totals.actualCostInr);

  return {
    targetPercent: target,
    setBy: project?.margin_set_by_user_id ? String(project.margin_set_by_user_id) : null,
    setAt: project?.margin_set_at ? new Date(project.margin_set_at as string).toISOString() : null,
    notes: project?.margin_notes ? String(project.margin_notes) : null,

    planned: {
      costInr: totals.plannedCostInr,
      billableInr: totals.plannedBillableInr,
      marginInr: round2(totals.plannedBillableInr - totals.plannedCostInr),
      marginPercent: plannedMargin,
      variancePoints:
        target !== null && plannedMargin !== null ? round2(plannedMargin - target) : null,
    },

    actual: {
      costInr: totals.actualCostInr,
      billableInr: actualBillable,
      marginInr: round2(actualBillable - totals.actualCostInr),
      marginPercent: actualMargin,
      variancePoints:
        target !== null && actualMargin !== null ? round2(actualMargin - target) : null,
      daysLogged: totals.actualDays,
    },

    budgetInr:
      project?.budget_inr === null || project?.budget_inr === undefined
        ? null
        : Number(project.budget_inr),
    headcount: totals.headcount,
    belowTarget: target !== null && plannedMargin !== null && plannedMargin < target,
  };
}

export interface RepriceResult {
  updated: number;
  skipped: { userName: string | null; reason: string }[];
  before: number | null;
  after: number | null;
}

/**
 * Rewrite the team's billable rates so the project hits its target.
 *
 * Every person is repriced from their own cost, which keeps the margin
 * uniform across the team rather than subsidising one grade with
 * another. Somebody with no cost on file is skipped and named — there
 * is nothing to compute from, and silently leaving them at zero would
 * flatter the result.
 *
 * Cost is untouched. What a person costs is a fact; what the client is
 * charged is the decision being made here.
 */
export async function repriceToTarget(
  projectId: string,
  targetPercent: number
): Promise<RepriceResult> {
  const before = await marginFor(projectId);

  const members = (await projectDb("project_team_members")
    .where({ project_id: projectId, is_active: true })
    .select("id", "user_name", "daily_cost_inr", "planned_days")) as Record<string, unknown>[];

  const skipped: { userName: string | null; reason: string }[] = [];
  let updated = 0;

  for (const member of members) {
    const cost = member.daily_cost_inr === null ? null : Number(member.daily_cost_inr);
    if (!cost || cost <= 0) {
      skipped.push({
        userName: member.user_name ? String(member.user_name) : null,
        reason: "no daily cost on file",
      });
      continue;
    }

    const rate = rateForMargin(cost, targetPercent);
    if (rate === null) {
      skipped.push({
        userName: member.user_name ? String(member.user_name) : null,
        reason: "that target cannot be reached at any price",
      });
      continue;
    }

    const days = Number(member.planned_days ?? 0);
    await projectDb("project_team_members")
      .where("id", String(member.id))
      .update({
        daily_billable_rate_inr: rate,
        planned_billable_inr: round2(days * rate),
        updated_at: new Date(),
      });
    updated += 1;
  }

  const after = await marginFor(projectId);

  return {
    updated,
    skipped,
    before: before.planned.marginPercent,
    after: after.planned.marginPercent,
  };
}

/** Hours-per-day, re-exported so callers need only this module. */
export { HOURS_PER_DAY };
