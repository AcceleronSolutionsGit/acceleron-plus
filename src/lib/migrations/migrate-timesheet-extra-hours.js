// ═══════════════════════════════════════════════════════════════
// migrate-timesheet-extra-hours.js — Add extra_hours_reason to project_timesheets
//
// Run:  node src/lib/migrations/migrate-timesheet-extra-hours.js
//
// Idempotent: adds only columns that are absent, never alters data.
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
  console.log("\n🚀 Migrating project_timesheets — adding extra_hours_reason...\n");

  try {
    await ensureColumn(projectDb, "project_timesheets", "extra_hours_reason", (t) =>
      t.text("extra_hours_reason").nullable()
    );
    console.log("\n✅ Migration complete.\n");
  } catch (err) {
    console.error("Migration failed:", err);
    process.exitCode = 1;
  } finally {
    await closeAll();
  }
}

run();
