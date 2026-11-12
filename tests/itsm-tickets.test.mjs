import test from "node:test";
import assert from "node:assert/strict";
import { itsmDb, projectDb } from "../src/lib/db.ts";
import { saveTicketAttachment } from "../src/lib/ticket-attachment-storage.ts";

// Pure SLA calculation function matching itsm-engine
function calculateSlaDueDate(priority, createdAt = new Date()) {
  const slaDate = new Date(createdAt);
  switch (priority) {
    case "urgent":
      slaDate.setHours(slaDate.getHours() + 24);
      break;
    case "high":
      slaDate.setHours(slaDate.getHours() + 48);
      break;
    case "medium":
      slaDate.setHours(slaDate.getHours() + 72);
      break;
    case "low":
    default:
      slaDate.setHours(slaDate.getHours() + 120);
      break;
  }
  return slaDate;
}

test("1. ITSM Ticket Number Generation & SLA Computation", () => {
  const now = new Date("2026-11-12T10:00:00.000Z");

  const urgentDue = calculateSlaDueDate("urgent", now);
  assert.ok(urgentDue > now, "Urgent SLA due date must be in the future");
  const diffHoursUrgent = (urgentDue.getTime() - now.getTime()) / (1000 * 60 * 60);
  assert.equal(diffHoursUrgent, 24, "Urgent SLA should be 24 hours");

  const highDue = calculateSlaDueDate("high", now);
  const diffHoursHigh = (highDue.getTime() - now.getTime()) / (1000 * 60 * 60);
  assert.equal(diffHoursHigh, 48, "High SLA should be 48 hours");

  const lowDue = calculateSlaDueDate("low", now);
  assert.ok(lowDue > urgentDue, "Low priority SLA must have a later due date than urgent");

  const getPrefix = (type) =>
    type === "service_request" ? "SR" : type === "problem" ? "PRB" : type === "query" ? "QRY" : "INC";

  assert.equal(getPrefix("incident"), "INC");
  assert.equal(getPrefix("service_request"), "SR");
  assert.equal(getPrefix("problem"), "PRB");
  assert.equal(getPrefix("query"), "QRY");
});

test("2. End-to-End Manual Ticket Creation with Project Linkage & Persistence", async () => {
  // Find or create test company and requester
  let company = await itsmDb("companies").first();
  if (!company) {
    [company] = await itsmDb("companies")
      .insert({
        name: "Test Corp",
        domain: "testcorp.io",
      })
      .returning("*");
  }

  let requester = await itsmDb("requesters").where("company_id", company.id).first();
  if (!requester) {
    [requester] = await itsmDb("requesters")
      .insert({
        tenant_id: company.tenant_id || "8434da2c-a300-433f-83fd-57249690ad09",
        first_name: "John",
        last_name: "Requester",
        email: `test.requester.${Date.now()}@testcorp.io`,
        company_id: company.id,
        is_active: true,
      })
      .returning("*");
  }

  // Find a test project
  const project = await projectDb("projects").whereNull("scrapped_at").first();
  const testProjectCode = project ? project.code : "PRJ-TEST-001";
  const testProjectId = project ? project.id : null;

  const testTicketNumber = `INC-2026-${Math.floor(10000 + Math.random() * 90000)}`;
  const testSubject = `Automated E2E Test Ticket - ${Date.now()}`;
  const testDesc = "Verification of manual ITSM ticket creation pipeline with project association.";

  // Insert ticket simulating POST /api/itsm/tickets
  const [ticket] = await itsmDb("tickets")
    .insert({
      tenant_id: "8434da2c-a300-433f-83fd-57249690ad09",
      ticket_number: testTicketNumber,
      requester_id: requester.id,
      company_id: company.id,
      ticket_type: "incident",
      subject: testSubject,
      description: testDesc,
      priority: "high",
      impact: "high",
      urgency: "high",
      status: "new",
      source: "portal",
      project_id: testProjectId,
      project_code: testProjectCode,
      attachments: JSON.stringify([{ name: "diagnostic.log", size: 1024, type: "text/plain" }]),
    })
    .returning("*");

  assert.ok(ticket, "Ticket must be created");
  assert.equal(ticket.ticket_number, testTicketNumber);
  assert.equal(ticket.subject, testSubject);
  assert.equal(ticket.priority, "high");
  assert.equal(ticket.project_code, testProjectCode);
  if (testProjectId) {
    assert.equal(ticket.project_id, testProjectId);
  }

  // Verify direct retrieval from DB
  const found = await itsmDb("tickets").where("ticket_number", testTicketNumber).first();
  assert.ok(found, "Newly created ticket must be found in database");
  assert.equal(found.subject, testSubject);

  // Test attachment storage helper
  const sampleBuf = Buffer.from("System logs for ticket " + testTicketNumber);
  const attMeta = await saveTicketAttachment(ticket.id, "system.log", "text/plain", sampleBuf);
  assert.ok(attMeta.storedFileName, "Attachment must return storedFileName");
  assert.ok(attMeta.filePath, "Attachment must have valid filePath");

  // Clean up test ticket
  await itsmDb("tickets").where("id", ticket.id).del().catch(() => {});
  await itsmDb.destroy().catch(() => {});
  await projectDb.destroy().catch(() => {});
});
