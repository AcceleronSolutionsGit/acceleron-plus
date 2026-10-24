// ═══════════════════════════════════════════════════════════════
// migrate-allocation-periods.js — add allocation_periods JSONB
//
// Run:  node src/lib/migrations/migrate-allocation-periods.js
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
  console.log("\n🚀 Migrating allocation periods on project_team_members...\n");

  await ensureColumn(projectDb, "project_team_members", "allocation_periods", (t) =>
    t.jsonb("allocation_periods").nullable()
  );

  console.log("\n✨ Done.\n");
}

run()
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exitCode = 1;
  })
  .finally(closeAll);
