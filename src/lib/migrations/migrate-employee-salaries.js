// ═══════════════════════════════════════════════════════════════
// migrate-employee-salaries.js — creates employee_salaries table
// and adds cost_rate_inr column to employee_master.
//
// Run:  node src/lib/migrations/migrate-employee-salaries.js
// Idempotent: safe to run repeatedly.
// ═══════════════════════════════════════════════════════════════

const { identityDb, closeAll } = require("../db-config");

async function run() {
  console.log("\n💰 Migrating identity_db — employee_salaries & employee_master.cost_rate_inr\n");

  if (!(await identityDb.schema.hasTable("employee_master"))) {
    console.error("  ✖ employee_master table does not exist. Run migrate-employee-master.js first.");
    process.exit(1);
  }

  // 1. Add cost_rate_inr column to employee_master
  if (await identityDb.schema.hasColumn("employee_master", "cost_rate_inr")) {
    console.log("  · employee_master.cost_rate_inr already present");
  } else {
    await identityDb.schema.alterTable("employee_master", (t) => {
      t.decimal("cost_rate_inr", 12, 2).nullable();
    });
    console.log("  ✚ employee_master.cost_rate_inr added");
  }

  // 2. Create employee_salaries table
  if (await identityDb.schema.hasTable("employee_salaries")) {
    console.log("  · employee_salaries table already exists");
  } else {
    await identityDb.schema.createTable("employee_salaries", (t) => {
      t.uuid("id").primary().defaultTo(identityDb.raw("gen_random_uuid()"));
      t.string("employee_id", 64).notNullable().unique();
      t.string("employee_name", 255).nullable();
      t.decimal("cost_per_day", 12, 2).notNullable();
      t.string("currency", 10).notNullable().defaultTo("INR");
      t.string("updated_by_email", 255).nullable();
      t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(identityDb.fn.now());
      t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(identityDb.fn.now());
    });
    console.log("  ✚ employee_salaries table created");

    await identityDb.raw(`
      CREATE INDEX IF NOT EXISTS idx_employee_salaries_emp_id ON employee_salaries (employee_id)
    `);
    console.log("  ✚ idx_employee_salaries_emp_id created");
  }

  console.log("\n✅ Migration complete.\n");
}

run()
  .catch((err) => {
    console.error("  ✖ Migration failed:", err.message);
    process.exitCode = 1;
  })
  .finally(closeAll);

