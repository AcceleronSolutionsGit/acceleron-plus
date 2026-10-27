import test from "node:test";
import assert from "node:assert/strict";
import { calculateCostingMetrics, round2 } from "../src/lib/costing.ts";

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
