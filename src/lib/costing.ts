/**
 * Order & Project Costing and Margin Calculation Module
 *
 * Implements business logic for:
 * 1. Order Value (Billable Value) & Target Cost calculation
 * 2. Planned Cost vs Target Cost (Cost Deviation)
 * 3. Target Cost vs Actual Cost (Actual Cost Deviation)
 * 4. Order Value vs Planned Cost (Planned Margin)
 * 5. Order Value vs Actual Cost (Actual Margin)
 */

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export interface CostingInput {
  /** Billable Order Value (e.g. project.budget_inr or proposed fee) */
  orderValue: number | string | null | undefined;
  /** Target Margin % configured on the project (e.g. 25 for 25%) */
  targetMarginPercent?: number | string | null | undefined;
  /** Total Planned Cost (Labor + Overhead + Additional Expenses) */
  plannedCost: number | string | null | undefined;
  /** Total Actual Cost (Labor timesheets + Overhead + Actual Expenses) */
  actualCost: number | string | null | undefined;
}

export type DeviationStatus = "favorable" | "unfavorable" | "balanced";

export interface CostingMetrics {
  /** Billable Value of the order / project */
  orderValue: number;
  /** Applicable target margin percentage, or null if unconfigured */
  targetMarginPercent: number | null;
  /** Target margin monetary amount = Order Value * (Target Margin % / 100) */
  targetMarginAmount: number;
  /**
   * System-calculated cost ceiling:
   * Target Cost = Order Value - Target Margin
   * If margin is percentage-based: Target Cost = Order Value * (1 - Target Margin % / 100)
   */
  targetCost: number;

  /** Total planned delivery cost */
  plannedCost: number;
  /**
   * Cost Deviation: Target Cost - Planned Cost
   * - Positive: Planned Cost is below Target Cost (Favorable)
   * - Zero: Planned Cost matches Target Cost (Balanced)
   * - Negative: Planned Cost exceeds Target Cost (Unfavorable)
   */
  targetVsPlannedBalance: number;
  targetVsPlannedStatus: DeviationStatus;

  /** Total actual delivery cost incurred */
  actualCost: number;
  /**
   * Actual Cost Deviation: Target Cost - Actual Cost
   * - Positive: Actual Cost is below Target Cost (Favorable)
   * - Zero: Actual Cost matches Target Cost (Balanced)
   * - Negative: Actual Cost exceeds Target Cost (Unfavorable)
   */
  targetVsActualBalance: number;
  targetVsActualStatus: DeviationStatus;

  /** Planned Margin = Order Value - Planned Cost */
  plannedMargin: number;
  /** Planned Margin % = (Planned Margin / Order Value) * 100 */
  plannedMarginPercent: number | null;
  plannedMarginStatus: DeviationStatus;

  /** Actual Margin = Order Value - Actual Cost */
  actualMargin: number;
  /** Actual Margin % = (Actual Margin / Order Value) * 100 */
  actualMarginPercent: number | null;
  actualMarginStatus: DeviationStatus;
}

/**
 * Calculates all cost, deviation, and margin metrics according to business requirements.
 */
export function calculateCostingMetrics(input: CostingInput): CostingMetrics {
  const rawOrderValue = typeof input.orderValue === "string" ? parseFloat(input.orderValue) : input.orderValue;
  const orderValue = round2(
    rawOrderValue !== null && rawOrderValue !== undefined && !Number.isNaN(rawOrderValue)
      ? Math.max(0, rawOrderValue)
      : 0
  );

  const rawTargetMargin =
    input.targetMarginPercent !== null &&
    input.targetMarginPercent !== undefined &&
    input.targetMarginPercent !== ""
      ? typeof input.targetMarginPercent === "string"
        ? parseFloat(input.targetMarginPercent)
        : input.targetMarginPercent
      : null;

  const targetMarginPercent =
    rawTargetMargin !== null && Number.isFinite(rawTargetMargin)
      ? round2(rawTargetMargin)
      : null;

  const rawPlannedCost = typeof input.plannedCost === "string" ? parseFloat(input.plannedCost) : input.plannedCost;
  const plannedCost = round2(
    rawPlannedCost !== null && rawPlannedCost !== undefined && !Number.isNaN(rawPlannedCost)
      ? Math.max(0, rawPlannedCost)
      : 0
  );

  const rawActualCost = typeof input.actualCost === "string" ? parseFloat(input.actualCost) : input.actualCost;
  const actualCost = round2(
    rawActualCost !== null && rawActualCost !== undefined && !Number.isNaN(rawActualCost)
      ? Math.max(0, rawActualCost)
      : 0
  );

  // 1. Target Cost Calculation:
  // Target Cost = Order Value - Target Margin
  // If margin is percentage-based: Target Cost = Order Value * (1 - Target Margin % / 100)
  // If targetMarginPercent is null, targetCost defaults to orderValue (0% target margin)
  const effectiveMarginPct = targetMarginPercent !== null ? targetMarginPercent : 0;
  const targetMarginAmount = round2((orderValue * effectiveMarginPct) / 100);
  const targetCost = round2(orderValue * (1 - effectiveMarginPct / 100));

  // 2. Planned Cost vs Target Cost:
  // Cost Deviation = Target Cost - Planned Cost
  const targetVsPlannedBalance = round2(targetCost - plannedCost);

  // 3. Target Cost vs Actual Cost:
  // Actual Cost Deviation = Target Cost - Actual Cost
  const targetVsActualBalance = round2(targetCost - actualCost);

  // 4. Order Value vs Planned Cost (Planned Margin):
  // Planned Margin = Order Value - Planned Cost
  const plannedMargin = round2(orderValue - plannedCost);
  const plannedMarginPercent = orderValue > 0 ? round2((plannedMargin / orderValue) * 100) : null;

  // 5. Order Value vs Actual Cost (Actual Margin):
  // Actual Margin = Order Value - Actual Cost
  const actualMargin = round2(orderValue - actualCost);
  const actualMarginPercent = orderValue > 0 ? round2((actualMargin / orderValue) * 100) : null;

  const getStatus = (val: number): DeviationStatus => {
    if (val > 0.009) return "favorable";
    if (val < -0.009) return "unfavorable";
    return "balanced";
  };

  return {
    orderValue,
    targetMarginPercent,
    targetMarginAmount,
    targetCost,
    plannedCost,
    targetVsPlannedBalance,
    targetVsPlannedStatus: getStatus(targetVsPlannedBalance),
    actualCost,
    targetVsActualBalance,
    targetVsActualStatus: getStatus(targetVsActualBalance),
    plannedMargin,
    plannedMarginPercent,
    plannedMarginStatus: getStatus(plannedMargin),
    actualMargin,
    actualMarginPercent,
    actualMarginStatus: getStatus(actualMargin),
  };
}
