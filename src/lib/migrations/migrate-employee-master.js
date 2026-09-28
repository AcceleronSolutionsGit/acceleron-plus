// ═══════════════════════════════════════════════════════════════
// migrate-employee-master.js — the Darwinbox-backed employee master
//
// Run:  node src/lib/migrations/migrate-employee-master.js
// Idempotent: creates the table if absent, otherwise only adds what
// is missing. Existing rows are never touched.
// ═══════════════════════════════════════════════════════════════

const { identityDb, closeAll } = require("../db-config");

async function ensureColumn(column, build) {
  if (await identityDb.schema.hasColumn("employee_master", column)) {
    console.log(`    · employee_master.${column} already present`);
    return;
  }
  await identityDb.schema.alterTable("employee_master", build);
  console.log(`    ✚ employee_master.${column} added`);
}

async function run() {
  console.log("\n👥 Migrating identity_db.employee_master\n");

  if (!(await identityDb.schema.hasTable("employee_master"))) {
    console.log("  → creating employee_master");
    await identityDb.schema.createTable("employee_master", (t) => {
      // The Darwinbox employee id is the natural key — it is what every
      // other table references as darwinbox_ref.
      t.string("employee_id", 64).primary();
      t.string("full_name", 200);
      t.string("company_email_id", 320);
      t.string("job_level", 32);
      t.string("office_location", 160);
      t.string("group_company_code", 32);
      t.date("date_of_joining");
      t.string("employee_type", 64);
      t.string("direct_manager_employee_id", 64);
      t.string("reporting_manager_name", 200);
      t.string("designation", 200);
      t.string("department", 160);
      t.string("department_id", 64);
      t.string("business_unit", 160);
      t.string("cost_center", 120);
      t.string("employee_status", 64);
      t.date("date_of_exit");
      t.string("mobile_number", 40);
      t.string("avatar_url", 500);
      t.boolean("is_active").notNullable().defaultTo(true);
      // Darwinbox returns far more than we model. Keeping the whole record
      // means a field we did not anticipate is still recoverable without
      // another round trip to the HR system.
      t.jsonb("raw_payload");
      t.timestamp("last_synced_at", { useTz: true });
      t.timestamps(true, true);
    });
    console.log("    ✚ employee_master");
  } else {
    console.log("  → employee_master exists — checking columns");
    await ensureColumn("full_name", (t) => t.string("full_name", 200));
    await ensureColumn("company_email_id", (t) => t.string("company_email_id", 320));
    await ensureColumn("job_level", (t) => t.string("job_level", 32));
    await ensureColumn("office_location", (t) => t.string("office_location", 160));
    await ensureColumn("group_company_code", (t) => t.string("group_company_code", 32));
    await ensureColumn("date_of_joining", (t) => t.date("date_of_joining"));
    await ensureColumn("employee_type", (t) => t.string("employee_type", 64));
    await ensureColumn("direct_manager_employee_id", (t) => t.string("direct_manager_employee_id", 64));
    await ensureColumn("reporting_manager_name", (t) => t.string("reporting_manager_name", 200));
    await ensureColumn("designation", (t) => t.string("designation", 200));
    await ensureColumn("department", (t) => t.string("department", 160));
    await ensureColumn("department_id", (t) => t.string("department_id", 64));
    await ensureColumn("business_unit", (t) => t.string("business_unit", 160));
    await ensureColumn("cost_center", (t) => t.string("cost_center", 120));
    await ensureColumn("employee_status", (t) => t.string("employee_status", 64));
    await ensureColumn("date_of_exit", (t) => t.date("date_of_exit"));
    await ensureColumn("mobile_number", (t) => t.string("mobile_number", 40));
    await ensureColumn("avatar_url", (t) => t.string("avatar_url", 500));
    await ensureColumn("is_active", (t) => t.boolean("is_active").notNullable().defaultTo(true));
    await ensureColumn("raw_payload", (t) => t.jsonb("raw_payload"));
    await ensureColumn("last_synced_at", (t) => t.timestamp("last_synced_at", { useTz: true }));
    await ensureColumn("created_at", (t) => t.timestamp("created_at", { useTz: true }).defaultTo(identityDb.fn.now()));
    await ensureColumn("updated_at", (t) => t.timestamp("updated_at", { useTz: true }).defaultTo(identityDb.fn.now()));
  }

  console.log("  → indexes");
  for (const [name, sql] of [
    [
      "employee_master_company_idx",
      `CREATE INDEX IF NOT EXISTS employee_master_company_idx
         ON employee_master (group_company_code, is_active)`,
    ],
    [
      "employee_master_email_idx",
      `CREATE INDEX IF NOT EXISTS employee_master_email_idx
         ON employee_master (lower(company_email_id))`,
    ],
    [
      "employee_master_manager_idx",
      `CREATE INDEX IF NOT EXISTS employee_master_manager_idx
         ON employee_master (direct_manager_employee_id)`,
    ],
  ]) {
    await identityDb
      .raw(sql)
      .then(() => console.log(`    ✚ ${name}`))
      .catch((err) => console.log(`    · ${name} skipped (${err.message.split("\n")[0]})`));
  }

  // Rows that predate the is_active column should not be treated as leavers.
  const backfilled = await identityDb("employee_master")
    .whereNull("is_active")
    .update({ is_active: true })
    .catch(() => 0);
  if (backfilled) console.log(`  → backfilled is_active on ${backfilled} existing row(s)`);

  const stats = await identityDb("employee_master")
    .select("group_company_code")
    .count("* as n")
    .groupBy("group_company_code")
    .catch(() => []);

  if (stats.length > 0) {
    console.log("\n  Current contents by company code:");
    stats.forEach((row) => {
      console.log(`    ${String(row.group_company_code ?? "(none)").padEnd(12)} ${row.n}`);
    });
  } else {
    console.log("\n  The master is empty.");
  }

  console.log("\n✅ employee_master migration complete.\n");
  console.log("   Populate it with:  node src/lib/seeds/sync-darwinbox.js --dry-run");
  console.log("   then drop --dry-run once the company code looks right.\n");
}

run()
  .catch((err) => {
    console.error("\n✖ Migration failed:", err.message);
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closeAll);
