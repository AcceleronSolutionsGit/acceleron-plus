// ═══════════════════════════════════════════════════════════════
// project_db — project_documents migration
// Run: node src/lib/migrations/migrate-documents.js
// ═══════════════════════════════════════════════════════════════

const { projectDb, closeAll } = require("../db-config");
const knex = projectDb;
async function run() {
  console.log("🚀 Running documents migration...\n");

  if (!(await knex.schema.hasTable("project_documents"))) {
    await knex.schema.createTable("project_documents", (t) => {
      t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
      t.string("tenant_id").notNullable().defaultTo("acceleron");
      t.uuid("project_id").notNullable().references("id").inTable("projects").onDelete("CASCADE");

      // Classification
      t.string("document_type").notNullable();
      // scope | sop | proposal | po | contract | sow | test_plan
      // meeting_minutes | phase_report | risk_register | other

      t.string("category").defaultTo("general");
      // general | presales | delivery | legal | finance | governance

      t.string("title").notNullable();
      t.text("description");
      t.string("version").defaultTo("1.0");
      t.string("tags"); // comma-separated

      // Storage
      t.string("file_name").notNullable();         // original file name
      t.string("stored_file_name").notNullable();  // uuid-prefixed stored name
      t.string("file_path").notNullable();         // relative path on disk
      t.string("mime_type").notNullable();
      t.bigInteger("file_size_bytes").notNullable();
      t.string("checksum_sha256");                 // for integrity verification

      // Access control
      t.string("access_level").defaultTo("team");
      // team = PM + team members | pm_only | client_visible

      // Lifecycle
      t.boolean("is_active").defaultTo(true);
      t.boolean("is_latest_version").defaultTo(true);
      t.uuid("supersedes_document_id");            // points to previous version

      // Audit
      t.string("uploaded_by_user_id").notNullable();
      t.string("uploaded_by_name");
      t.timestamp("last_accessed_at");
      t.integer("download_count").defaultTo(0);

      t.timestamps(true, true);
    });
    console.log("  ✅ Created: project_documents");
  } else {
    console.log("  ⏭  Exists: project_documents");
  }

  // Document access log
  if (!(await knex.schema.hasTable("document_access_logs"))) {
    await knex.schema.createTable("document_access_logs", (t) => {
      t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
      t.uuid("document_id").notNullable().references("id").inTable("project_documents").onDelete("CASCADE");
      t.uuid("project_id").notNullable();
      t.string("user_id").notNullable();
      t.string("user_name");
      t.string("action").notNullable(); // view | download | upload | delete
      t.string("ip_address");
      t.timestamps(true, true);
    });
    console.log("  ✅ Created: document_access_logs");
  } else {
    console.log("  ⏭  Exists: document_access_logs");
  }

  console.log("\n✅ Documents migration complete!\n");
}

run().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
})
  .finally(closeAll);
