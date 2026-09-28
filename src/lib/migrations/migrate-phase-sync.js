// ═══════════════════════════════════════════════════════════════
// migrate-phase-sync.js — Add current_phase to project_contexts
// Run: node src/lib/migrations/migrate-phase-sync.js
// ═══════════════════════════════════════════════════════════════

const { itsmDb, closeAll } = require("../db-config");
const knex = itsmDb;
async function run() {
  console.log("🚀 Running phase-sync migration on itsm_db...\n");

  // 1. Add current_phase to project_contexts
  const hasPhase = await knex.schema.hasColumn("project_contexts", "current_phase");
  if (!hasPhase) {
    await knex.schema.alterTable("project_contexts", (t) => {
      t.string("current_phase").defaultTo("Discovery");
    });
    console.log("  ✅ Added: project_contexts.current_phase");
  } else {
    console.log("  ⏭  Exists: project_contexts.current_phase");
  }

  // 2. Add index on tickets.project_context_id for efficient filtering
  try {
    await knex.schema.alterTable("tickets", (t) => {
      t.index("project_context_id", "idx_tickets_project_context_id");
    });
    console.log("  ✅ Added: index idx_tickets_project_context_id");
  } catch (e) {
    if (e.message.includes("already exists")) {
      console.log("  ⏭  Exists: index idx_tickets_project_context_id");
    } else {
      console.warn("  ⚠  Index creation warning:", e.message);
    }
  }

  // 3. Update existing project_contexts with a phase if null
  const updated = await knex("project_contexts")
    .whereNull("current_phase")
    .update({ current_phase: "Execution" });
  if (updated > 0) {
    console.log(`  ✅ Updated ${updated} existing project_contexts with default phase`);
  }

  console.log("\n✅ Phase-sync migration complete!");
  process.exit(0);
}

run().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
})
  .finally(closeAll);
