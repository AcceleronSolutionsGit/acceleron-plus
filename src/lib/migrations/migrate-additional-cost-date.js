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
  console.log("\n🚀 Migrating additional costs for cost_date field...\n");

  const hasSolutioningCosts = await projectDb.schema.hasTable("solutioning_additional_costs");
  if (hasSolutioningCosts) {
    await ensureColumn(projectDb, "solutioning_additional_costs", "cost_date", (t) =>
      t.date("cost_date").nullable()
    );
  }

  const hasProjectCosts = await projectDb.schema.hasTable("project_additional_costs");
  if (hasProjectCosts) {
    await ensureColumn(projectDb, "project_additional_costs", "cost_date", (t) =>
      t.date("cost_date").nullable()
    );
  }

  console.log("\n✅ Migration completed successfully.\n");
}

run()
  .catch((err) => {
    console.error("❌ Migration failed:", err);
    process.exit(1);
  })
  .finally(closeAll);

