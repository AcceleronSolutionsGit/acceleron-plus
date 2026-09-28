// ═══════════════════════════════════════════════════════════════
// migrate-phase1.js — Employee self-service project allocation requests
//                     and timesheet approval tracking
// Run: node src/lib/migrations/migrate-phase1.js
// ═══════════════════════════════════════════════════════════════

const { identityDb, projectDb, closeAll } = require("../db-config");

async function ensureColumn(db, table, column, build) {
  if (await db.schema.hasColumn(table, column)) {
    console.log(`    · ${table}.${column} already present`);
    return;
  }
  await db.schema.alterTable(table, build);
  console.log(`    ✚ ${table}.${column} added`);
}

async function run() {
  console.log("\n🚀 Running Phase 1 migrations…\n");

  // ─── 1. project_allocation_requests ────────────────────────────
  if (!(await projectDb.schema.hasTable("project_allocation_requests"))) {
    await projectDb.schema.createTable("project_allocation_requests", (t) => {
      t.uuid("id").primary().defaultTo(projectDb.raw("gen_random_uuid()"));
      t.uuid("project_id").notNullable().references("id").inTable("projects").onDelete("CASCADE");
      t.string("user_id").notNullable();
      t.string("user_name");
      t.string("employee_id");
      t.string("requested_role").notNullable();
      t.integer("requested_allocation_percent").defaultTo(100);
      t.date("requested_start_date");
      t.date("requested_end_date");
      t.text("notes");
      t.string("status").notNullable().defaultTo("pending");
      t.string("reviewed_by_user_id");
      t.timestamp("reviewed_at");
      t.text("review_notes");
      t.timestamps(true, true);
      t.index(["project_id", "user_id", "status"], "par_project_user_status_idx");
    });
    console.log("  ✅ Created: project_allocation_requests");
  } else {
    console.log("  ⏭  Exists: project_allocation_requests");
  }

  // ─── 2. Extend project_timesheets ──────────────────────────────
  console.log("  → extending project_timesheets");
  await ensureColumn(projectDb, "project_timesheets", "reviewed_by_user_id", (t) =>
    t.string("reviewed_by_user_id")
  );
  await ensureColumn(projectDb, "project_timesheets", "reviewed_at", (t) =>
    t.timestamp("reviewed_at")
  );
  await ensureColumn(projectDb, "project_timesheets", "rejection_reason", (t) =>
    t.text("rejection_reason")
  );
  await ensureColumn(projectDb, "project_timesheets", "submitted_at", (t) =>
    t.timestamp("submitted_at")
  );

  // ─── 3. Extend employee_master ──────────────────────────────────
  console.log("  → extending employee_master");
  await ensureColumn(identityDb, "employee_master", "reporting_manager_user_id", (t) =>
    t.string("reporting_manager_user_id")
  );

  const hasIndex = await identityDb.raw(
    `SELECT 1 FROM pg_indexes WHERE tablename = 'employee_master' AND indexname = 'em_reporting_manager_idx'`
  );
  if (hasIndex.rows.length === 0) {
    await identityDb.schema.alterTable("employee_master", (t) => {
      t.index(["reporting_manager_user_id"], "em_reporting_manager_idx");
    });
    console.log("    ✚ em_reporting_manager_idx added");
  } else {
    console.log("    · em_reporting_manager_idx already present");
  }

  console.log("\n✅ Phase 1 migration complete!\n");
}

run()
  .then(closeAll)
  .catch(async (err) => {
    console.error("\n✖", err.message, "\n", err);
    await closeAll();
    process.exit(1);
  });
