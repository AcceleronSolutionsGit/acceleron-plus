// ═══════════════════════════════════════════════════════════════
// itsm_db — PMT integration migration
// Run: node src/lib/migrations/migrate-itsm-db.js
// ═══════════════════════════════════════════════════════════════

const { itsmDb, closeAll } = require("../db-config");
const knex = itsmDb;
async function run() {
  console.log("🚀 Running itsm_db migrations...\n");

  // ─── 1. project_contexts ────────────────────────────────────
  // Auto-created when a project is registered in PMT
  if (!(await knex.schema.hasTable("project_contexts"))) {
    await knex.schema.createTable("project_contexts", (t) => {
      t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
      t.string("tenant_id").notNullable().defaultTo("acceleron");
      t.uuid("project_db_id").notNullable().unique(); // project_db.projects.id
      t.string("project_code").notNullable();
      t.string("project_name").notNullable();
      t.string("client_company_name");
      t.string("pm_user_id");
      t.string("pm_user_name");
      t.string("status").defaultTo("active"); // mirrors project status
      t.boolean("is_active").defaultTo(true);
      t.timestamps(true, true);
    });
    console.log("  ✅ Created: project_contexts");
  } else { console.log("  ⏭  Exists: project_contexts"); }

  // ─── 2. Add project_id to tickets ───────────────────────────
  const ticketHasProjectId = await knex.schema.hasColumn("tickets", "project_id");
  if (!ticketHasProjectId) {
    await knex.schema.alterTable("tickets", (t) => {
      t.uuid("project_id"); // references project_contexts.project_db_id
      t.string("project_code"); // denormalized for quick display
    });
    console.log("  ✅ Altered: tickets (added project_id, project_code)");
  } else { console.log("  ⏭  Exists: tickets.project_id"); }

  // ─── 3. Add project_id to change_requests ───────────────────
  const crHasProjectId = await knex.schema.hasColumn("change_requests", "project_id");
  if (!crHasProjectId) {
    await knex.schema.alterTable("change_requests", (t) => {
      t.uuid("project_id");
      t.string("project_code");
    });
    console.log("  ✅ Altered: change_requests (added project_id, project_code)");
  } else { console.log("  ⏭  Exists: change_requests.project_id"); }

  // ─── 4. time_logs ───────────────────────────────────────────
  // Agents log hours on tickets/CRs — feeds into project cost analysis
  if (!(await knex.schema.hasTable("time_logs"))) {
    await knex.schema.createTable("time_logs", (t) => {
      t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
      t.string("tenant_id").notNullable().defaultTo("acceleron");
      t.uuid("ticket_id"); // optional — link to ticket
      t.string("ticket_number"); // denormalized
      t.uuid("change_request_id"); // optional — link to CR
      t.string("change_number"); // denormalized
      t.uuid("project_id"); // project this time feeds into (cross-DB ref)
      t.string("project_code"); // denormalized
      t.string("user_id").notNullable(); // the agent/consultant logging time
      t.string("user_name"); // denormalized
      t.date("log_date").notNullable();
      t.decimal("hours_logged", 6, 2).notNullable();
      t.string("activity_type").defaultTo("resolution"); // investigation|triage|resolution|testing|documentation|meeting|travel
      t.text("notes");
      t.string("status").defaultTo("logged"); // logged | approved | rejected
      t.string("approved_by_user_id");
      t.timestamps(true, true);
    });
    console.log("  ✅ Created: time_logs");
  } else { console.log("  ⏭  Exists: time_logs"); }

  console.log("\n✅ itsm_db migration complete!\n");
}

run().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
})
  .finally(closeAll);
