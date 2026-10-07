const { projectDb, closeAll } = require("../db-config");
const knex = projectDb;

async function run() {
  console.log("🚀 Running migrations for Lead Scope, Solution Approach, and Documents...\n");

  // 1. Add scope_baseline and solution_approach to leads table
  const hasScope = await knex.schema.hasColumn("leads", "scope_baseline");
  if (!hasScope) {
    await knex.schema.alterTable("leads", (t) => {
      t.text("scope_baseline");
      t.text("solution_approach");
    });
    console.log("  ✅ Altered: leads (added scope_baseline, solution_approach)");
  } else {
    console.log("  ⏭  Exists: leads.scope_baseline");
  }

  // 2. Update project_documents table to support leads
  if (await knex.schema.hasTable("project_documents")) {
    const hasLeadId = await knex.schema.hasColumn("project_documents", "lead_id");
    if (!hasLeadId) {
      await knex.schema.alterTable("project_documents", (t) => {
        t.uuid("lead_id").references("id").inTable("leads").onDelete("CASCADE");
      });
      console.log("  ✅ Altered: project_documents (added lead_id)");
    } else {
      console.log("  ⏭  Exists: project_documents.lead_id");
    }

    // Make project_id nullable so documents can be attached to leads before converting to a project
    try {
      await knex.raw("ALTER TABLE project_documents ALTER COLUMN project_id DROP NOT NULL;");
      console.log("  ✅ Altered: project_documents.project_id is now nullable");
    } catch (e) {
      console.log("  ℹ️ project_id already nullable or error:", e.message);
    }
  }

  console.log("\nMigration completed successfully.");
}

run()
  .catch((err) => {
    console.error("❌ Migration failed:", err);
    process.exit(1);
  })
  .finally(closeAll);
