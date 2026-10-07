const { projectDb, closeAll } = require("../db-config");

async function run() {
  console.log("\n🚀 Migrating solutioning sessions for overhead, margin, and allocations...\n");

  const hasTableSessions = await projectDb.schema.hasTable("solutioning_sessions");
  if (!hasTableSessions) {
    throw new Error("solutioning_sessions table does not exist. Please run earlier migrations first.");
  }

  // 1. Add overhead_margin_percent and actual_margin_percent to solutioning_sessions
  await ensureColumn(projectDb, "solutioning_sessions", "overhead_margin_percent", (t) => t.decimal("overhead_margin_percent", 5, 2).defaultTo(0));
  await ensureColumn(projectDb, "solutioning_sessions", "actual_margin_percent", (t) => t.decimal("actual_margin_percent", 5, 2).defaultTo(0));

  // 2. Add allocated_user_id to solutioning_line_items
  const hasTableLineItems = await projectDb.schema.hasTable("solutioning_line_items");
  if (hasTableLineItems) {
    await ensureColumn(projectDb, "solutioning_line_items", "allocated_user_id", (t) => t.string("allocated_user_id", 64).nullable());
  }

  console.log("\n✅ Migration completed successfully.\n");
}

async function ensureColumn(db, table, column, build) {
  if (await db.schema.hasColumn(table, column)) {
    console.log(`    · ${table}.${column} already present`);
    return;
  }
  await db.schema.alterTable(table, build);
  console.log(`    ✚ ${table}.${column} added`);
}

run()
  .catch((err) => {
    console.error("❌ Migration failed:", err);
    process.exit(1);
  })
  .finally(closeAll);
