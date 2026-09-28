// ═══════════════════════════════════════════════════════════════
// seed-journey.js — End-to-End PMT + ITSM Journey Seeder
// Run: node src/lib/seeds/seed-journey.js
// ═══════════════════════════════════════════════════════════════

const { itsmDb, projectDb, closeAll } = require("../db-config");
const db = projectDb;
async function run() {
  console.log("🚀 Seeding End-to-End PMT + ITSM Journey...\n");

  const tenantId = "acceleron";
  const pmUserId = "20000000-0000-0000-0000-000000000002"; // Priya Sharma
  const memberUserId = "30000000-0000-0000-0000-000000000003"; // Arjun Mehta

  // 1. Employee Rate Bands (Ensure they exist)
  await db("solutioning_line_items").del();
  await db("solutioning_sessions").del();
  await db("projects").del();
  await db("leads").del();
  await itsmDb("project_contexts").del();

  const bands = await db("employee_rate_bands").select("*");
  if (bands.length === 0) {
    await db("employee_rate_bands").insert([
      { tenant_id: tenantId, band_name: "L1 Support", level_code: "L1", daily_cost_inr: 2000 },
      { tenant_id: tenantId, band_name: "Senior Consultant", level_code: "L3", daily_cost_inr: 8000 },
    ]);
  }
  const l3Band = await db("employee_rate_bands").where("level_code", "L3").first();

  // 2. Create a Lead
  console.log("👉 1. Creating Lead...");
  const [lead] = await db("leads").insert({
    tenant_id: tenantId,
    lead_number: "ACC-LEAD-0089",
    company_name: "Global Tech Inc.",
    contact_name: "Alice Johnson",
    opportunity_value_inr: 2500000,
    status: "solutioning",
    pm_owner_user_id: pmUserId,
  }).returning("*");

  // 3. Create Solutioning Session
  console.log("👉 2. Creating Solutioning Session...");
  const [session] = await db("solutioning_sessions").insert({
    tenant_id: tenantId,
    lead_id: lead.id,
    session_name: "v1.0 - Core Implementation",
    status: "finalized",
    risk_buffer_percent: 15,
    total_effort_days: 60,
    total_cost_inr: 480000,
    total_additional_cost_inr: 20000,
    proposed_fee_inr: 572000,
    margin_percent: 12.5,
    created_by_user_id: pmUserId,
  }).returning("*");

  await db("solutioning_line_items").insert({
    session_id: session.id,
    phase_name: "Implementation",
    task_description: "Core System Build",
    rate_band_id: l3Band.id,
    rate_band_name: l3Band.band_name,
    quantity_resources: 2,
    estimated_days: 30,
    daily_rate_inr: l3Band.daily_cost_inr,
    subtotal_inr: 480000,
    sequence: 1,
  });

  // 4. Create Project
  console.log("👉 3. Creating Project...");
  const [project] = await db("projects").insert({
    tenant_id: tenantId,
    name: "Global Tech ERP Rollout",
    code: "PRJ-0089",
    status: "active",
    lead_id: lead.id,
    client_company_name: "Global Tech Inc.",
    project_manager_user_id: pmUserId,
    budget_inr: 572000,
    start_date: "2026-09-01",
    planned_end_date: "2026-11-30",
  }).returning("*");

  // 5. Create ITSM Project Context (Bidirectional Sync)
  const [itsmCtx] = await itsmDb("project_contexts").insert({
    tenant_id: tenantId,
    project_db_id: project.id,
    project_code: project.code,
    project_name: project.name,
    status: "active",
    is_active: true,
  }).returning("*");

  await db("projects").where("id", project.id).update({ itsm_context_id: itsmCtx.id });

  // 6. Add WBS and Milestones
  console.log("👉 4. Creating WBS & Milestones...");
  const [wbs] = await db("wbs_items").insert({
    project_id: project.id,
    code: "1.0",
    name: "Phase 1: Foundation",
    sequence: 1,
  }).returning("*");

  await db("milestones").insert({
    project_id: project.id,
    name: "Foundation Sign-off",
    due_date: "2026-09-15",
    status: "completed",
    completed_at: "2026-09-14",
  });

  // 7. Log Timesheets
  console.log("👉 5. Logging Timesheets...");
  await db("project_timesheets").insert({
    project_id: project.id,
    user_id: memberUserId,
    user_name: "Arjun Mehta",
    log_date: "2026-09-05",
    hours_logged: 8,
    activity_type: "development",
    notes: "Initial setup",
    status: "approved",
    approved_by_user_id: pmUserId,
  });

  // 8. Create Linked ITSM Ticket
  console.log("👉 6. Creating linked ITSM Ticket...");
  const [ticket] = await itsmDb("tickets").insert({
    tenant_id: tenantId,
    ticket_number: "INC-2026-9001",
    ticket_type: "incident",
    subject: "ERP Rollout - Database Connection Issue",
    status: "open",
    project_context_id: itsmCtx.id,
    priority: "high",
    agent_user_id: memberUserId,
  }).returning("*");

  console.log(`\n✅ Journey seeded successfully!`);
  console.log(`Lead: ${lead.lead_number}`);
  console.log(`Project: ${project.code}`);
  console.log(`Ticket: ${ticket.ticket_number}`);
  
  process.exit(0);
}

run().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
})
  .finally(closeAll);
