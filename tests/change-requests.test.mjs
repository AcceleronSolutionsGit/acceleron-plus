import test from "node:test";
import assert from "node:assert/strict";
import { projectDb, itsmDb } from "../src/lib/db.ts";
import {
  ensureChangeRequestSchema,
  createProjectChangeRequest,
  getProjectChangeRequests,
  updateProjectChangeRequest,
  deleteProjectChangeRequest,
  reconcileProjectOrderValue,
} from "../src/lib/change-request-service.ts";
import { calculateCostingMetrics } from "../src/lib/costing.ts";

test("1. Change Request Schema Initialization", async () => {
  await ensureChangeRequestSchema();

  const hasCrTable = await projectDb.schema.hasTable("project_change_requests");
  assert.equal(hasCrTable, true, "project_change_requests table must exist in projectDb");

  const hasInitialCol = await projectDb.schema.hasColumn("projects", "initial_order_value_inr");
  assert.equal(hasInitialCol, true, "projects.initial_order_value_inr column must exist");

  const hasCrValueCol = await projectDb.schema.hasColumn("projects", "cr_value_inr");
  assert.equal(hasCrValueCol, true, "projects.cr_value_inr column must exist");
});

test("2. End-to-End Change Request Creation with PO/Doc, Planned Hours & Order Value Reconciliation", async () => {
  // 1. Create a dedicated test project
  const testProjectCode = `TEST-CR-${Date.now().toString().slice(-5)}`;
  const initialBudget = 1000000; // ₹10,00,000 baseline

  const [testProject] = await projectDb("projects")
    .insert({
      code: testProjectCode,
      name: "E2E Change Request Test Project",
      status: "active",
      tenant_id: "acceleron",
      budget_inr: initialBudget,
      initial_order_value_inr: initialBudget,
      target_margin_percent: 25, // 25% target margin
      currency: "INR",
    })
    .returning("*");

  assert.ok(testProject, "Test project created");
  const projectId = testProject.id;

  try {
    // 2. Add Change Request 1 with PO document, planned hours, and order value
    const sampleDocBuffer = Buffer.from(
      "Customer Purchase Order amendment for Project " + testProjectCode + " Value: INR 2,50,000"
    );

    const cr1Result = await createProjectChangeRequest({
      projectId,
      title: "Scope Extension: Additional BI Reports & Analytics Dashboard",
      description: "Client requested 5 additional executive dashboards with automated PDF export.",
      orderValueInr: 250000, // ₹2,50,000
      plannedHours: 80, // 80 planned hours
      poNumber: "PO-CLIENT-2026-0042",
      status: "approved",
      createdByUserId: "test-user-id",
      createdByName: "Lead PM",
      file: {
        originalName: "Signed_PO_0042.pdf",
        mimeType: "application/pdf",
        buffer: sampleDocBuffer,
      },
    });

    assert.ok(cr1Result.changeRequest, "Change Request 1 must be created");
    assert.equal(cr1Result.changeRequest.orderValueInr, 250000);
    assert.equal(cr1Result.changeRequest.plannedHours, 80);
    assert.equal(cr1Result.changeRequest.poNumber, "PO-CLIENT-2026-0042");
    assert.ok(cr1Result.changeRequest.documentId, "Attached document must generate documentId");
    assert.equal(cr1Result.changeRequest.documentName, "Signed_PO_0042.pdf");

    // Verify document was registered in project_documents
    const docRow = await projectDb("project_documents")
      .where("id", cr1Result.changeRequest.documentId)
      .first();
    assert.ok(docRow, "Document must exist in project_documents");
    assert.equal(docRow.project_id, projectId);

    // Verify order value update: Initial (₹10,00,000) + CR (₹2,50,000) = Total (₹12,50,000)
    assert.equal(cr1Result.orderValue.initialOrderValueInr, 1000000);
    assert.equal(cr1Result.orderValue.crOrderValueInr, 250000);
    assert.equal(cr1Result.orderValue.totalOrderValueInr, 1250000);

    // Verify project record in DB has been updated with new total order value
    const updatedPrj1 = await projectDb("projects").where("id", projectId).first();
    assert.equal(parseFloat(updatedPrj1.budget_inr), 1250000);
    assert.equal(parseFloat(updatedPrj1.initial_order_value_inr), 1000000);
    assert.equal(parseFloat(updatedPrj1.cr_value_inr), 250000);

    // 3. Add Change Request 2 (e.g. ₹1,50,000, 40 hours)
    const cr2Result = await createProjectChangeRequest({
      projectId,
      title: "Scope Extension: Single Sign-On (SSO) Okta Integration",
      description: "Integration with customer Okta identity provider for SAML SSO.",
      orderValueInr: 150000, // ₹1,50,000
      plannedHours: 40, // 40 planned hours
      poNumber: "PO-CLIENT-2026-0088",
      status: "approved",
      createdByUserId: "test-user-id",
      createdByName: "Lead PM",
    });

    assert.equal(cr2Result.orderValue.crOrderValueInr, 400000); // 250k + 150k
    assert.equal(cr2Result.orderValue.totalOrderValueInr, 1400000); // 1000k + 400k

    // 4. Test Querying and Tracking against Planned Hours
    const fetchResult = await getProjectChangeRequests(projectId);
    assert.equal(fetchResult.changeRequests.length, 2);
    assert.equal(fetchResult.summary.initialOrderValueInr, 1000000);
    assert.equal(fetchResult.summary.crOrderValueInr, 400000);
    assert.equal(fetchResult.summary.totalOrderValueInr, 1400000);
    assert.equal(fetchResult.summary.totalPlannedHours, 120); // 80 + 40 hrs

    // 5. Test updating actual hours and tracking variance
    const cr1Id = cr1Result.changeRequest.id;
    const updateResult = await updateProjectChangeRequest(cr1Id, {
      actualHours: 24, // 24 hours logged
    });
    assert.equal(updateResult.changeRequest.actualHours, 24);

    const reFetch = await getProjectChangeRequests(projectId);
    assert.equal(reFetch.summary.totalActualHours, 24);
    assert.equal(reFetch.summary.varianceHours, 96); // 120 - 24
    assert.equal(reFetch.summary.hoursBurnPercent, 20); // 24 / 120 = 20%

    // 6. Test Costing & Margins calculated against new Total Order Value
    const costing = calculateCostingMetrics({
      orderValue: fetchResult.summary.totalOrderValueInr, // ₹14,00,000
      targetMarginPercent: 25,
      plannedCost: 900000,
      actualCost: 600000,
    });

    assert.equal(costing.orderValue, 1400000);
    assert.equal(costing.targetCost, 1050000); // 14,00,000 * (1 - 0.25)
    assert.equal(costing.plannedMargin, 500000); // 14,00,000 - 9,00,000
    assert.equal(costing.actualMargin, 800000); // 14,00,000 - 6,00,000

    // 7. Test Deleting a Change Request: Project order value adjusts dynamically
    const cr2Id = cr2Result.changeRequest.id;
    const deleteResult = await deleteProjectChangeRequest(cr2Id);
    assert.equal(deleteResult.success, true);
    assert.equal(deleteResult.orderValue.crOrderValueInr, 250000);
    assert.equal(deleteResult.orderValue.totalOrderValueInr, 1250000);

    const finalProject = await projectDb("projects").where("id", projectId).first();
    assert.equal(parseFloat(finalProject.budget_inr), 1250000);
  } finally {
    // Clean up test data
    await projectDb("project_change_requests").where("project_id", projectId).del().catch(() => {});
    await projectDb("project_documents").where("project_id", projectId).del().catch(() => {});
    await projectDb("projects").where("id", projectId).del().catch(() => {});
    await projectDb.destroy().catch(() => {});
    await itsmDb.destroy().catch(() => {});
  }
});
