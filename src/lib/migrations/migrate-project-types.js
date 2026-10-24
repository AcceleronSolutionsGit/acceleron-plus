// ═══════════════════════════════════════════════════════════════
// migrate-project-types.js — Adds project_type column to projects
//
// Run:  node src/lib/migrations/migrate-project-types.js
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
  console.log("\n🚀 Migrating project_type column on projects...\n");

  await ensureColumn(projectDb, "projects", "project_type", (t) => {
    t.string("project_type", 100).nullable();
  });

  console.log("\n✔ Project types migration complete.\n");
  await closeAll();
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
