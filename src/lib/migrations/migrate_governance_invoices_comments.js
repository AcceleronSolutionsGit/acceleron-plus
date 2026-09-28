// ═══════════════════════════════════════════════════════════════════
// Migration: Create wbs_client_comments and invoices tables in project_db
// ═══════════════════════════════════════════════════════════════════

const { projectDb, closeAll } = require("../db-config");
const knex = projectDb;
async function run() {
  console.log("🚀 Running migration for wbs_client_comments and invoices...\n");

  // 1. wbs_client_comments
  const hasComments = await knex.schema.hasTable("wbs_client_comments");
  if (!hasComments) {
    await knex.schema.createTable("wbs_client_comments", (t) => {
      t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
      t.uuid("project_id").notNullable().references("id").inTable("projects").onDelete("CASCADE");
      t.uuid("wbs_item_id").references("id").inTable("wbs_items").onDelete("CASCADE");
      t.string("author_name").notNullable();
      t.string("author_role").defaultTo("client"); // client | pm | consultant | sponsor
      t.text("comment_text").notNullable();
      t.string("status").defaultTo("open"); // open | under_review | resolved
      t.timestamps(true, true);
    });
    console.log("  ✅ Created: wbs_client_comments");
  } else {
    console.log("  ⏭  Exists: wbs_client_comments");
  }

  // 2. invoices
  const hasInvoices = await knex.schema.hasTable("invoices");
  if (!hasInvoices) {
    await knex.schema.createTable("invoices", (t) => {
      t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
      t.uuid("project_id").notNullable().references("id").inTable("projects").onDelete("CASCADE");
      t.string("invoice_number").notNullable().unique(); // e.g. INV-2026-001
      t.string("client_name").notNullable();
      t.decimal("amount_inr", 15, 2).notNullable();
      t.decimal("tax_amount_inr", 15, 2).defaultTo(0);
      t.decimal("total_amount_inr", 15, 2).notNullable();
      t.string("currency").defaultTo("INR");
      t.string("status").defaultTo("sent"); // draft | sent | paid | overdue | cancelled
      t.date("issue_date").notNullable();
      t.date("due_date").notNullable();
      t.timestamp("paid_at");
      t.uuid("billing_milestone_id").references("id").inTable("billing_milestones");
      t.text("notes");
      t.timestamps(true, true);
    });
    console.log("  ✅ Created: invoices");
  } else {
    console.log("  ⏭  Exists: invoices");
  }

  // Seed sample initial comments if empty
  const commentCount = await knex("wbs_client_comments").count("id as c").first();
  if (parseInt(commentCount.c) === 0) {
    const sampleWbs = await knex("wbs_items").first();
    const sampleProject = await knex("projects").first();
    if (sampleProject) {
      await knex("wbs_client_comments").insert([
        {
          project_id: sampleProject.id,
          wbs_item_id: sampleWbs ? sampleWbs.id : null,
          author_name: "Rajesh Sharma (Client Lead, Gainwell)",
          author_role: "client",
          comment_text: "Please prioritize ERP API endpoint documentation and integration schema verification for the phase 1 rollout.",
          status: "open",
        },
        {
          project_id: sampleProject.id,
          wbs_item_id: sampleWbs ? sampleWbs.id : null,
          author_name: "Amit Patel (Project Manager, Acceleron)",
          author_role: "pm",
          comment_text: "Acknowledged. Technical architecture team has updated the interface contracts and scheduled test review.",
          status: "under_review",
        },
      ]);
      console.log("  🌱 Seeded initial WBS client comments");
    }
  }

  // Seed sample invoices if empty
  const invoiceCount = await knex("invoices").count("id as c").first();
  if (parseInt(invoiceCount.c) === 0) {
    const sampleProject = await knex("projects").first();
    if (sampleProject) {
      await knex("invoices").insert([
        {
          project_id: sampleProject.id,
          invoice_number: "INV-2026-001",
          client_name: sampleProject.client_company_name || "Gainwell Commosales Pvt Ltd",
          amount_inr: 450000.00,
          tax_amount_inr: 81000.00,
          total_amount_inr: 531000.00,
          status: "paid",
          issue_date: "2026-08-15",
          due_date: "2026-09-15",
          paid_at: "2026-09-02T11:20:00Z",
          notes: "Initial Project Kickoff & Discovery Milestone Payment (18% GST included).",
        },
        {
          project_id: sampleProject.id,
          invoice_number: "INV-2026-002",
          client_name: sampleProject.client_company_name || "Gainwell Commosales Pvt Ltd",
          amount_inr: 800000.00,
          tax_amount_inr: 144000.00,
          total_amount_inr: 944000.00,
          status: "sent",
          issue_date: "2026-09-01",
          due_date: "2026-09-30",
          notes: "Core Implementation Phase Milestone 1 (18% GST included).",
        },
      ]);
      console.log("  🌱 Seeded initial invoices");
    }
  }

  console.log("\n✅ Migration complete!\n");
}

run().catch((err) => {
  console.error("❌ Migration error:", err);
  process.exit(1);
})
  .finally(closeAll);
