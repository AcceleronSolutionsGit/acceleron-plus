import test from "node:test";
import assert from "node:assert/strict";
import { calculateCostingMetrics, round2 } from "../src/lib/costing.ts";
import {
  plannedCostFor,
  workingDaysBetween,
  parseAllocationPeriods,
} from "../src/lib/staffing-calc.ts";

test("1. Order Value and Target Cost Calculation", () => {
  // Order Value = 10,00,000; Target Margin = 20%
  // Target Cost = 10,00,000 * (1 - 0.20) = 8,00,000
  const result = calculateCostingMetrics({
    orderValue: 1000000,
    targetMarginPercent: 20,
    plannedCost: 750000,
    actualCost: 780000,
  });

  assert.equal(result.orderValue, 1000000, "Order Value must remain the billable value");
  assert.equal(result.targetMarginPercent, 20);
  assert.equal(result.targetMarginAmount, 200000);
  assert.equal(result.targetCost, 800000, "Target Cost should be Order Value - Target Margin");
  assert.notEqual(result.orderValue, result.targetCost, "Order Value must not be treated as Target Cost");
});

test("2. Planned Cost vs Target Cost (Cost Deviation)", () => {
  // Favorable: Planned Cost < Target Cost (8,00,000 - 7,50,000 = +50,000)
  const favorable = calculateCostingMetrics({
    orderValue: 1000000,
    targetMarginPercent: 20,
    plannedCost: 750000,
    actualCost: 0,
  });
  assert.equal(favorable.targetVsPlannedBalance, 50000);
  assert.equal(favorable.targetVsPlannedStatus, "favorable");

  // Balanced: Planned Cost == Target Cost (8,00,000 - 8,00,000 = 0)
  const balanced = calculateCostingMetrics({
    orderValue: 1000000,
    targetMarginPercent: 20,
    plannedCost: 800000,
    actualCost: 0,
  });
  assert.equal(balanced.targetVsPlannedBalance, 0);
  assert.equal(balanced.targetVsPlannedStatus, "balanced");

  // Unfavorable: Planned Cost > Target Cost (8,00,000 - 8,50,000 = -50,000)
  const unfavorable = calculateCostingMetrics({
    orderValue: 1000000,
    targetMarginPercent: 20,
    plannedCost: 850000,
    actualCost: 0,
  });
  assert.equal(unfavorable.targetVsPlannedBalance, -50000);
  assert.equal(unfavorable.targetVsPlannedStatus, "unfavorable");
});

test("3. Target Cost vs Actual Cost (Actual Cost Deviation)", () => {
  // Favorable: Actual Cost < Target Cost (8,00,000 - 7,20,000 = +80,000)
  const favorable = calculateCostingMetrics({
    orderValue: 1000000,
    targetMarginPercent: 20,
    plannedCost: 750000,
    actualCost: 720000,
  });
  assert.equal(favorable.targetVsActualBalance, 80000);
  assert.equal(favorable.targetVsActualStatus, "favorable");

  // Balanced: Actual Cost == Target Cost
  const balanced = calculateCostingMetrics({
    orderValue: 1000000,
    targetMarginPercent: 20,
    plannedCost: 750000,
    actualCost: 800000,
  });
  assert.equal(balanced.targetVsActualBalance, 0);
  assert.equal(balanced.targetVsActualStatus, "balanced");

  // Unfavorable: Actual Cost > Target Cost (8,00,000 - 9,00,000 = -1,00,000)
  const unfavorable = calculateCostingMetrics({
    orderValue: 1000000,
    targetMarginPercent: 20,
    plannedCost: 750000,
    actualCost: 900000,
  });
  assert.equal(unfavorable.targetVsActualBalance, -100000);
  assert.equal(unfavorable.targetVsActualStatus, "unfavorable");
});

test("4. Order Value vs Planned Cost (Planned Margin)", () => {
  // Order Value = 10,00,000; Planned Cost = 7,50,000
  // Planned Margin = 2,50,000 (25%)
  const result = calculateCostingMetrics({
    orderValue: 1000000,
    targetMarginPercent: 20,
    plannedCost: 750000,
    actualCost: 0,
  });
  assert.equal(result.plannedMargin, 250000);
  assert.equal(result.plannedMarginPercent, 25);
  assert.equal(result.plannedMarginStatus, "favorable");
});

test("5. Order Value vs Actual Cost (Actual Margin)", () => {
  // Order Value = 10,00,000; Actual Cost = 7,80,000
  // Actual Margin = 2,20,000 (22%)
  const result = calculateCostingMetrics({
    orderValue: 1000000,
    targetMarginPercent: 20,
    plannedCost: 750000,
    actualCost: 780000,
  });
  assert.equal(result.actualMargin, 220000);
  assert.equal(result.actualMarginPercent, 22);
  assert.equal(result.actualMarginStatus, "favorable");
});

test("6. Null values, string inputs, zero values, and decimal precision", () => {
  const result = calculateCostingMetrics({
    orderValue: "500000.50",
    targetMarginPercent: "15.5",
    plannedCost: "400000.25",
    actualCost: null,
  });

  assert.equal(result.orderValue, 500000.5);
  assert.equal(result.targetMarginPercent, 15.5);
  // Target Cost = 500000.50 * (1 - 0.155) = 422500.42
  assert.equal(result.targetCost, 422500.42);
  assert.equal(result.plannedCost, 400000.25);
  // Cost Deviation = 422500.42 - 400000.25 = 22500.17
  assert.equal(result.targetVsPlannedBalance, 22500.17);
  assert.equal(result.targetVsPlannedStatus, "favorable");
  assert.equal(result.actualCost, 0);
  assert.equal(result.targetVsActualBalance, 422500.42);
});

test("7. Zero Order Value handling", () => {
  const result = calculateCostingMetrics({
    orderValue: 0,
    targetMarginPercent: 20,
    plannedCost: 50000,
    actualCost: 60000,
  });

  assert.equal(result.orderValue, 0);
  assert.equal(result.targetCost, 0);
  assert.equal(result.targetVsPlannedBalance, -50000);
  assert.equal(result.targetVsPlannedStatus, "unfavorable");
  assert.equal(result.targetVsActualBalance, -60000);
  assert.equal(result.targetVsActualStatus, "unfavorable");
  assert.equal(result.plannedMargin, -50000);
  assert.equal(result.plannedMarginPercent, null);
  assert.equal(result.actualMargin, -60000);
  assert.equal(result.actualMarginPercent, null);
});

test("8. Order Value and Target Margin compute Target Cost correctly", () => {
  const result1 = calculateCostingMetrics({
    orderValue: 2000000,
    targetMarginPercent: 25,
    plannedCost: 1400000,
    actualCost: 1200000,
  });
  assert.equal(result1.orderValue, 2000000, "Order Value should be 20,00,000");
  assert.equal(result1.targetMarginPercent, 25, "Target margin should be 25%");
  assert.equal(result1.targetCost, 1500000, "Target Cost must be 20,00,000 * (1 - 0.25) = 15,00,000");
  assert.equal(result1.targetVsPlannedBalance, 100000, "Planned cost is favorable by 1,00,000");
  assert.equal(result1.targetVsPlannedStatus, "favorable");

  const result2 = calculateCostingMetrics({
    orderValue: 500000,
    targetMarginPercent: null,
    plannedCost: 400000,
    actualCost: 450000,
  });
  assert.equal(result2.orderValue, 500000);
  assert.equal(result2.targetMarginPercent, null);
  assert.equal(result2.targetCost, 500000, "Target Cost defaults to Order Value when margin is unconfigured");
});

test("9. Financial redaction hides budgetInr, targetMarginPercent, and targetCostInr for non-financial viewers", async () => {
  const { redactProjectFinancials } = await import("../src/lib/permissions.ts");

  const project = {
    id: "proj-1",
    name: "Confidential Project",
    budgetInr: 1000000,
    targetMarginPercent: 20,
    targetCostInr: 800000,
    status: "in_progress",
    category: "SOFTWARE",
  };

  const redacted = redactProjectFinancials(project);
  assert.equal(redacted.name, "Confidential Project");
  assert.equal(redacted.status, "in_progress");
  assert.equal(redacted.category, "SOFTWARE");
  assert.equal("budgetInr" in redacted, false, "budgetInr should be redacted");
  assert.equal("targetMarginPercent" in redacted, false, "targetMarginPercent should be redacted");
  assert.equal("targetCostInr" in redacted, false, "targetCostInr should be redacted");
});

test("10. Multi-period allocation calculation correctly sums planned days and costs across all periods", () => {
  // Period 1: Jan 1, 2026 to Jan 31, 2026 (full calendar month = 24 working days) @ 50% = 12 planned days
  // Period 2: Feb 1, 2026 to Feb 28, 2026 (full calendar month = 24 working days) @ 100% = 24 planned days
  // Total planned days must be 12 + 24 = 36 days (NOT taking only the latest period 24 days)
  const periods = [
    { startDate: "2026-01-01", endDate: "2026-01-31", allocationPercent: 50 },
    { startDate: "2026-02-01", endDate: "2026-02-28", allocationPercent: 100 },
  ];

  const dailyCost = 5000;
  const dailyBillable = 12000;

  const result = plannedCostFor({
    startDate: "2026-01-01",
    endDate: "2026-02-28",
    allocationPercent: 100, // Stale single allocation should be ignored in favor of periods
    dailyCostInr: dailyCost,
    dailyBillableRateInr: dailyBillable,
    allocationPeriods: periods,
  });

  assert.equal(result.plannedDays, 36, "Planned days should be the sum of all periods (12 + 24 = 36)");
  assert.equal(
    result.plannedCostInr,
    36 * dailyCost,
    "Planned cost must be 36 * 5000 = 180,000 INR (sum of both periods, not only the latest 24 * 5000)"
  );
  assert.equal(
    result.plannedBillableInr,
    36 * dailyBillable,
    "Planned billable must be 36 * 12000 = 432,000 INR"
  );
  assert.notEqual(result.plannedDays, 24, "Must not take only the latest period (24 days)");
});

test("11. Multi-period allocation breakdown takes priority over stale single-period plannedDays override", () => {
  // Suppose an existing DB record had planned_days = 10 from before periods were added
  const periods = [
    { startDate: "2026-03-01", endDate: "2026-03-31", allocationPercent: 100 }, // 24 days
    { startDate: "2026-04-01", endDate: "2026-04-30", allocationPercent: 50 },  // 12 days
  ];

  const result = plannedCostFor({
    startDate: "2026-03-01",
    endDate: "2026-04-30",
    allocationPercent: 75,
    dailyCostInr: 4000,
    plannedDays: 10, // Stale single-period override
    allocationPeriods: periods,
  });

  // Stale plannedDays should NOT override the multi-period breakdown calculation
  assert.equal(result.plannedDays, 36, "Should calculate from all periods (24 + 12 = 36) rather than stale 10 days");
  assert.equal(result.plannedCostInr, 36 * 4000, "Planned cost must be 144,000 INR");
});

test("12. parseAllocationPeriods correctly parses JSON strings and handles snake_case properties", () => {
  const jsonStr = JSON.stringify([
    { start_date: "2026-01-01", end_date: "2026-01-31", allocation_percent: 50 },
    { startDate: "2026-02-01", endDate: "2026-02-28", allocationPercent: 75 },
  ]);

  const parsed = parseAllocationPeriods(jsonStr);
  assert.ok(parsed, "Parsed periods must not be null");
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].startDate, "2026-01-01");
  assert.equal(parsed[0].endDate, "2026-01-31");
  assert.equal(parsed[0].allocationPercent, 50);
  assert.equal(parsed[1].startDate, "2026-02-01");
  assert.equal(parsed[1].endDate, "2026-02-28");
  assert.equal(parsed[1].allocationPercent, 75);
});

test("13. Non-Darwinbox external user allocation calculates budget and cost based on custom CTC rate", () => {
  // External consultant staffed Jan 1, 2026 to Jan 31, 2026 (24 working days) @ 100% allocation
  // Custom Daily Cost (CTC) = 6,500 INR/day
  // Daily Billable Rate = 10,000 INR/day
  const customDailyCost = 6500;
  const dailyBillableRate = 10000;

  const result = plannedCostFor({
    startDate: "2026-01-01",
    endDate: "2026-01-31",
    allocationPercent: 100,
    dailyCostInr: customDailyCost,
    dailyBillableRateInr: dailyBillableRate,
  });

  assert.equal(result.plannedDays, 24);
  assert.equal(result.plannedCostInr, 24 * customDailyCost, "Planned cost must be 24 * 6500 = 156,000 INR");
  assert.equal(result.plannedBillableInr, 24 * dailyBillableRate, "Planned billable must be 24 * 10000 = 240,000 INR");
});

