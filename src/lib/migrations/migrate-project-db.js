// ═══════════════════════════════════════════════════════════════
// project_db — Full PMT expansion migration
// Run: node src/lib/migrations/migrate-project-db.js
// ═══════════════════════════════════════════════════════════════

const { projectDb, closeAll } = require("../db-config");
const knex = projectDb;
async function run() {
  console.log("🚀 Running project_db migrations...\n");

  // ─── 1. employee_rate_bands ──────────────────────────────────
  if (!(await knex.schema.hasTable("employee_rate_bands"))) {
    await knex.schema.createTable("employee_rate_bands", (t) => {
      t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
      t.string("tenant_id").notNullable().defaultTo("acceleron");
      t.string("band_name").notNullable(); // e.g. "Junior Consultant", "Senior Consultant"
      t.string("level_code").notNullable(); // L1, L2, L3, L4
      t.decimal("daily_cost_inr", 12, 2).notNullable();
      t.decimal("daily_billable_rate_inr", 12, 2); // what we charge client
      t.string("currency").defaultTo("INR");
      t.date("effective_from").notNullable();
      t.date("effective_to");
      t.boolean("is_active").defaultTo(true);
      t.timestamps(true, true);
    });
    console.log("  ✅ Created: employee_rate_bands");
  } else { console.log("  ⏭  Exists: employee_rate_bands"); }

  // ─── 2. leads ───────────────────────────────────────────────
  if (!(await knex.schema.hasTable("leads"))) {
    await knex.schema.createTable("leads", (t) => {
      t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
      t.string("tenant_id").notNullable().defaultTo("acceleron");
      t.string("lead_number").notNullable().unique(); // ACC-LEAD-001
      t.string("zoho_crm_ref"); // Zoho Lead/Deal ID
      t.string("zoho_crm_stage"); // Qualification, Proposal, Negotiation, etc.
      t.string("company_name").notNullable();
      t.string("contact_name");
      t.string("contact_email");
      t.string("contact_phone");
      t.text("description");
      t.decimal("opportunity_value_inr", 15, 2);
      t.string("currency").defaultTo("INR");
      t.string("pm_owner_user_id"); // assigned PM
      t.string("status").defaultTo("new"); // new, qualifying, solutioning, proposal_sent, won, lost, on_hold
      t.string("source"); // zoho_crm, manual, referral
      t.date("expected_close_date");
      t.text("notes");
      t.timestamp("zoho_synced_at");
      t.timestamps(true, true);
    });
    console.log("  ✅ Created: leads");
  } else { console.log("  ⏭  Exists: leads"); }

  // ─── 3. solutioning_sessions ────────────────────────────────
  if (!(await knex.schema.hasTable("solutioning_sessions"))) {
    await knex.schema.createTable("solutioning_sessions", (t) => {
      t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
      t.uuid("lead_id").notNullable().references("id").inTable("leads").onDelete("CASCADE");
      t.string("tenant_id").notNullable().defaultTo("acceleron");
      t.string("session_name").notNullable();
      t.string("status").defaultTo("draft"); // draft, finalized
      t.decimal("risk_buffer_percent", 5, 2).defaultTo(15);
      t.decimal("total_effort_days", 10, 2).defaultTo(0);
      t.decimal("total_cost_inr", 15, 2).defaultTo(0);
      t.decimal("total_additional_cost_inr", 15, 2).defaultTo(0);
      t.decimal("proposed_fee_inr", 15, 2).defaultTo(0);
      t.decimal("margin_percent", 5, 2).defaultTo(0);
      t.string("created_by_user_id");
      t.string("finalized_by_user_id");
      t.timestamp("finalized_at");
      t.timestamps(true, true);
    });
    console.log("  ✅ Created: solutioning_sessions");
  } else { console.log("  ⏭  Exists: solutioning_sessions"); }

  // ─── 4. solutioning_line_items ──────────────────────────────
  if (!(await knex.schema.hasTable("solutioning_line_items"))) {
    await knex.schema.createTable("solutioning_line_items", (t) => {
      t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
      t.uuid("session_id").notNullable().references("id").inTable("solutioning_sessions").onDelete("CASCADE");
      t.string("phase_name").notNullable(); // e.g. "Discovery", "Implementation"
      t.string("task_description").notNullable();
      t.uuid("rate_band_id").references("id").inTable("employee_rate_bands");
      t.string("rate_band_name"); // denormalized for display
      t.integer("quantity_resources").defaultTo(1);
      t.decimal("estimated_days", 8, 2).notNullable();
      t.decimal("daily_rate_inr", 12, 2); // from rate band, copied at session creation
      t.decimal("subtotal_inr", 15, 2); // estimated_days * daily_rate * qty_resources
      t.integer("sequence").defaultTo(0);
      t.timestamps(true, true);
    });
    console.log("  ✅ Created: solutioning_line_items");
  } else { console.log("  ⏭  Exists: solutioning_line_items"); }

  // ─── 5. solutioning_additional_costs ────────────────────────
  if (!(await knex.schema.hasTable("solutioning_additional_costs"))) {
    await knex.schema.createTable("solutioning_additional_costs", (t) => {
      t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
      t.uuid("session_id").notNullable().references("id").inTable("solutioning_sessions").onDelete("CASCADE");
      t.string("description").notNullable(); // Travel, Licenses, Infrastructure
      t.string("category"); // travel | software | hardware | other
      t.decimal("amount_inr", 15, 2).notNullable();
      t.integer("sequence").defaultTo(0);
      t.timestamps(true, true);
    });
    console.log("  ✅ Created: solutioning_additional_costs");
  } else { console.log("  ⏭  Exists: solutioning_additional_costs"); }

  // ─── 6. proposals ───────────────────────────────────────────
  if (!(await knex.schema.hasTable("proposals"))) {
    await knex.schema.createTable("proposals", (t) => {
      t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
      t.string("tenant_id").notNullable().defaultTo("acceleron");
      t.string("proposal_number").notNullable().unique(); // ACC-PROP-001
      t.uuid("lead_id").notNullable().references("id").inTable("leads").onDelete("RESTRICT");
      t.uuid("solutioning_session_id").references("id").inTable("solutioning_sessions");
      t.string("title").notNullable();
      t.string("status").defaultTo("draft"); // draft | sent | accepted | rejected | revised
      t.string("version").defaultTo("v1.0");
      t.text("cover_note");
      t.text("executive_summary");
      t.text("scope_of_work");
      t.text("assumptions");
      t.text("exclusions");
      t.text("deliverables");
      t.text("timeline_notes");
      t.text("payment_terms");
      t.text("terms_and_conditions");
      t.string("ppt_url"); // generated PPT file path/URL
      t.string("prepared_by_user_id");
      t.timestamp("sent_at");
      t.timestamp("accepted_at");
      t.timestamp("rejected_at");
      t.text("rejection_reason");
      t.timestamps(true, true);
    });
    console.log("  ✅ Created: proposals");
  } else { console.log("  ⏭  Exists: proposals"); }

  // ─── 7. purchase_orders ─────────────────────────────────────
  if (!(await knex.schema.hasTable("purchase_orders"))) {
    await knex.schema.createTable("purchase_orders", (t) => {
      t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
      t.string("tenant_id").notNullable().defaultTo("acceleron");
      t.string("po_number").notNullable(); // Client's PO number
      t.uuid("proposal_id").notNullable().references("id").inTable("proposals").onDelete("RESTRICT");
      t.uuid("lead_id").references("id").inTable("leads");
      t.decimal("po_value_inr", 15, 2).notNullable();
      t.string("currency").defaultTo("INR");
      t.date("po_date").notNullable();
      t.date("po_expiry_date");
      t.string("client_company_name");
      t.string("client_contact_name");
      t.string("client_contact_email");
      t.string("document_url"); // uploaded PO document
      t.string("status").defaultTo("active"); // active | closed | cancelled
      t.string("uploaded_by_user_id");
      t.timestamp("kickoff_triggered_at");
      t.timestamps(true, true);
    });
    console.log("  ✅ Created: purchase_orders");
  } else { console.log("  ⏭  Exists: purchase_orders"); }

  // ─── 8. Add new columns to projects ─────────────────────────
  const hasLeadId = await knex.schema.hasColumn("projects", "lead_id");
  if (!hasLeadId) {
    await knex.schema.alterTable("projects", (t) => {
      t.uuid("lead_id").references("id").inTable("leads");
      t.uuid("po_id").references("id").inTable("purchase_orders");
      t.uuid("itsm_context_id"); // references itsm_db.project_contexts (cross-DB, no FK)
      t.decimal("budget_inr", 15, 2);
      t.string("client_company_name");
      t.string("zoho_books_ref"); // for future direct integration
    });
    console.log("  ✅ Altered: projects (added lead_id, po_id, itsm_context_id, budget_inr, client_company_name)");
  } else { console.log("  ⏭  Exists: projects.lead_id"); }

  // ─── 9. project_team_members ────────────────────────────────
  if (!(await knex.schema.hasTable("project_team_members"))) {
    await knex.schema.createTable("project_team_members", (t) => {
      t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
      t.uuid("project_id").notNullable().references("id").inTable("projects").onDelete("CASCADE");
      t.string("user_id").notNullable(); // cross-DB ref to identity_db.users
      t.string("user_name"); // denormalized
      t.uuid("rate_band_id").references("id").inTable("employee_rate_bands");
      t.string("rate_band_name"); // denormalized
      t.string("role_in_project"); // PM, BA, Developer, QA, etc.
      t.integer("allocation_percent").defaultTo(100); // % of time on this project
      t.date("start_date");
      t.date("end_date");
      t.boolean("is_active").defaultTo(true);
      t.timestamps(true, true);
      t.unique(["project_id", "user_id"]);
    });
    console.log("  ✅ Created: project_team_members");
  } else { console.log("  ⏭  Exists: project_team_members"); }

  // ─── 10. project_timesheets ──────────────────────────────────
  if (!(await knex.schema.hasTable("project_timesheets"))) {
    await knex.schema.createTable("project_timesheets", (t) => {
      t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
      t.uuid("project_id").notNullable().references("id").inTable("projects").onDelete("CASCADE");
      t.string("user_id").notNullable();
      t.string("user_name"); // denormalized
      t.uuid("wbs_item_id").references("id").inTable("wbs_items");
      t.string("wbs_name"); // denormalized
      t.date("log_date").notNullable();
      t.decimal("hours_logged", 6, 2).notNullable();
      t.string("activity_type").defaultTo("development"); // discovery|design|development|testing|documentation|meeting
      t.text("notes");
      t.string("status").defaultTo("pending"); // pending | approved | rejected
      t.string("approved_by_user_id");
      t.timestamps(true, true);
    });
    console.log("  ✅ Created: project_timesheets");
  } else { console.log("  ⏭  Exists: project_timesheets"); }

  // ─── 11. billing_milestones ──────────────────────────────────
  if (!(await knex.schema.hasTable("billing_milestones"))) {
    await knex.schema.createTable("billing_milestones", (t) => {
      t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
      t.uuid("project_id").notNullable().references("id").inTable("projects").onDelete("CASCADE");
      t.uuid("milestone_id").references("id").inTable("milestones"); // link to existing milestone
      t.string("billing_milestone_name").notNullable();
      t.decimal("billing_amount_inr", 15, 2).notNullable();
      t.integer("billing_percent").defaultTo(0); // % of total PO value
      t.string("status").defaultTo("pending"); // pending | pm_confirmed | notified | invoiced | paid
      t.string("currency").defaultTo("INR");
      t.text("description");
      t.date("due_date");
      t.string("pm_confirmed_by_user_id");
      t.timestamp("pm_confirmed_at");
      t.timestamp("notified_at"); // when sales/finance was notified
      t.string("zoho_invoice_ref"); // for future Zoho Books integration
      t.timestamps(true, true);
    });
    console.log("  ✅ Created: billing_milestones");
  } else { console.log("  ⏭  Exists: billing_milestones"); }

  // ─── 12. billing_notifications ───────────────────────────────
  if (!(await knex.schema.hasTable("billing_notifications"))) {
    await knex.schema.createTable("billing_notifications", (t) => {
      t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
      t.uuid("billing_milestone_id").notNullable().references("id").inTable("billing_milestones").onDelete("CASCADE");
      t.uuid("project_id").notNullable();
      t.string("notification_type").notNullable(); // email | in_app
      t.string("recipient_type").notNullable(); // sales_team | finance | pm | client
      t.string("recipient_user_id");
      t.string("recipient_email");
      t.text("message");
      t.string("status").defaultTo("sent"); // sent | delivered | failed
      t.timestamp("sent_at").defaultTo(knex.fn.now());
      t.timestamps(true, true);
    });
    console.log("  ✅ Created: billing_notifications");
  } else { console.log("  ⏭  Exists: billing_notifications"); }

  // ─── 13. project_notifications ───────────────────────────────
  if (!(await knex.schema.hasTable("project_notifications"))) {
    await knex.schema.createTable("project_notifications", (t) => {
      t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
      t.string("tenant_id").notNullable().defaultTo("acceleron");
      t.string("recipient_user_id").notNullable();
      t.string("event_type").notNullable(); // milestone_billing_ready | po_received | project_kickoff | sla_breach | deliverable_ready | proposal_accepted
      t.string("title").notNullable();
      t.text("message");
      t.uuid("project_id");
      t.string("project_code");
      t.string("entity_type"); // milestone | ticket | proposal | po
      t.string("entity_id");
      t.string("action_url"); // deep link
      t.boolean("is_read").defaultTo(false);
      t.timestamp("read_at");
      t.timestamps(true, true);
    });
    console.log("  ✅ Created: project_notifications");
  } else { console.log("  ⏭  Exists: project_notifications"); }

  // ─── 14. project_client_contacts ─────────────────────────────
  if (!(await knex.schema.hasTable("project_client_contacts"))) {
    await knex.schema.createTable("project_client_contacts", (t) => {
      t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
      t.uuid("project_id").notNullable().references("id").inTable("projects").onDelete("CASCADE");
      t.string("name").notNullable();
      t.string("email").notNullable();
      t.string("designation");
      t.string("phone");
      t.boolean("is_primary").defaultTo(false);
      t.boolean("can_access_portal").defaultTo(true);
      t.timestamps(true, true);
    });
    console.log("  ✅ Created: project_client_contacts");
  } else { console.log("  ⏭  Exists: project_client_contacts"); }

  // ─── 15. client_magic_links ──────────────────────────────────
  if (!(await knex.schema.hasTable("client_magic_links"))) {
    await knex.schema.createTable("client_magic_links", (t) => {
      t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
      t.string("token").notNullable().unique(); // UUID token sent in email
      t.uuid("project_id").notNullable().references("id").inTable("projects").onDelete("CASCADE");
      t.uuid("client_contact_id").references("id").inTable("project_client_contacts");
      t.string("client_email").notNullable();
      t.timestamp("expires_at").notNullable(); // 72 hours from creation
      t.timestamp("used_at"); // first use
      t.boolean("is_revoked").defaultTo(false);
      t.string("issued_by_user_id");
      t.timestamps(true, true);
    });
    console.log("  ✅ Created: client_magic_links");
  } else { console.log("  ⏭  Exists: client_magic_links"); }

  // ─── 16. phase_reports ───────────────────────────────────────
  if (!(await knex.schema.hasTable("phase_reports"))) {
    await knex.schema.createTable("phase_reports", (t) => {
      t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
      t.uuid("project_id").notNullable().references("id").inTable("projects").onDelete("CASCADE");
      t.string("phase_name").notNullable();
      t.date("report_date").notNullable();
      t.integer("completion_percent").defaultTo(0);
      t.text("summary");
      t.text("accomplishments");
      t.text("upcoming_work");
      t.text("blockers");
      t.string("rag_status").defaultTo("green"); // green | amber | red
      t.integer("open_issues_count").defaultTo(0);
      t.integer("closed_issues_count").defaultTo(0);
      t.decimal("hours_logged", 10, 2).defaultTo(0);
      t.decimal("budget_utilized_percent", 5, 2).defaultTo(0);
      t.string("prepared_by_user_id");
      t.timestamps(true, true);
    });
    console.log("  ✅ Created: phase_reports");
  } else { console.log("  ⏭  Exists: phase_reports"); }

  // ─── 17. Seed rate bands ─────────────────────────────────────
  const bandCount = await knex("employee_rate_bands").count("id as c").first();
  if (parseInt(bandCount.c) === 0) {
    await knex("employee_rate_bands").insert([
      { band_name: "Junior Consultant", level_code: "L1", daily_cost_inr: 3000, daily_billable_rate_inr: 6000, effective_from: "2025-01-01" },
      { band_name: "Consultant", level_code: "L2", daily_cost_inr: 5000, daily_billable_rate_inr: 10000, effective_from: "2025-01-01" },
      { band_name: "Senior Consultant", level_code: "L3", daily_cost_inr: 8000, daily_billable_rate_inr: 15000, effective_from: "2025-01-01" },
      { band_name: "Lead Consultant", level_code: "L4", daily_cost_inr: 12000, daily_billable_rate_inr: 22000, effective_from: "2025-01-01" },
      { band_name: "Principal Consultant", level_code: "L5", daily_cost_inr: 18000, daily_billable_rate_inr: 32000, effective_from: "2025-01-01" },
      { band_name: "Practice Manager", level_code: "L6", daily_cost_inr: 25000, daily_billable_rate_inr: 45000, effective_from: "2025-01-01" },
    ]);
    console.log("  ✅ Seeded: employee_rate_bands (6 bands)");
  }

  console.log("\n✅ project_db migration complete!\n");
}

run().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
})
  .finally(closeAll);
