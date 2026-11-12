// ═══════════════════════════════════════════════════════════════
// migrate-project-change-requests.js
// Creates project_change_requests table and adds initial_order_value_inr
// and cr_value_inr columns to projects table.
//
// Run:  node src/lib/migrations/migrate-project-change-requests.js
// Idempotent: safe to run repeatedly.
// ═══════════════════════════════════════════════════════════════

const { projectDb, closeAll } = require("../db-config");

async function ensureColumn(db, table, column, build) {
  if (await db.schema.hasColumn(table, column)) {
    console.log(`    · ${table}.${column} already present`);
    return;
  }
  await db.schema.alterTable(table, build);
  console.log(`    ✚ ${table}.${column} added`);
}

async function run() {
  console.log("\n🚀 Migrating project_db for Change Requests & Order Value Reconciliation...\n");

  if (!(await projectDb.schema.hasTable("projects"))) {
    console.error("  ✖ projects table does not exist. Run migrate-project-db.js first.");
    process.exit(1);
  }

  // 1. Add initial_order_value_inr column to projects
  await ensureColumn(projectDb, "projects", "initial_order_value_inr", (t) => {
    t.decimal("initial_order_value_inr", 15, 2).nullable();
  });

  // Backfill initial baseline from existing budget_inr if null
  const backfilled = await projectDb.raw(
    "UPDATE projects SET initial_order_value_inr = budget_inr WHERE initial_order_value_inr IS NULL AND budget_inr IS NOT NULL"
  );
  console.log("    · Backfilled initial_order_value_inr from budget_inr where needed");

  // 2. Add cr_value_inr column to projects
  await ensureColumn(projectDb, "projects", "cr_value_inr", (t) => {
    t.decimal("cr_value_inr", 15, 2).notNullable().defaultTo(0);
  });

  // 3. Create project_change_requests table
  if (await projectDb.schema.hasTable("project_change_requests")) {
    console.log("    · project_change_requests table already exists");
  } else {
    await projectDb.schema.createTable("project_change_requests", (t) => {
      t.uuid("id").primary().defaultTo(projectDb.raw("gen_random_uuid()"));
      t.string("tenant_id", 255).notNullable().defaultTo("acceleron");
      t.uuid("project_id").notNullable().index();
      t.string("cr_number", 50).notNullable();
      t.string("title", 500).notNullable();
      t.text("description");
      t.string("status", 50).notNullable().defaultTo("approved");
      t.decimal("order_value_inr", 15, 2).notNullable().defaultTo(0);
      t.decimal("planned_hours", 10, 2).notNullable().defaultTo(0);
      t.decimal("actual_hours", 10, 2).notNullable().defaultTo(0);
      t.string("po_number", 255);
      t.uuid("document_id");
      t.string("document_name", 255);
      t.string("document_url", 1000);
      t.string("document_stored_name", 255);
      t.bigInteger("document_size_bytes");
      t.string("document_mime_type", 255);
      t.string("created_by_user_id", 255);
      t.string("created_by_name", 255);
      t.string("approved_by_user_id", 255);
      t.timestamp("approved_at");
      t.uuid("itsm_change_id");
      t.timestamps(true, true);
    });
    console.log("    ✚ project_change_requests table created");
  }

  // 4. Ensure index on project_change_requests (project_id, status)
  await projectDb.raw(`
    CREATE INDEX IF NOT EXISTS idx_project_cr_project_id_status 
    ON project_change_requests (project_id, status)
  `);
  console.log("    ✚ idx_project_cr_project_id_status verified");

  console.log("\n✅ Migration complete.\n");
}

run()
  .catch((err) => {
    console.error("  ✖ Migration failed:", err.message);
    process.exitCode = 1;
  })
  .finally(closeAll);
