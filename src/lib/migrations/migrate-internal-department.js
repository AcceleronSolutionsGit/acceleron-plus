// ═══════════════════════════════════════════════════════════════
// migrate-internal-department.js — adds internal_department to
// employee_master so admins can tag employees with Acceleron's
// own department taxonomy without Darwinbox sync overwriting it.
//
// Run:  node src/lib/migrations/migrate-internal-department.js
// Idempotent: safe to run repeatedly.
// ═══════════════════════════════════════════════════════════════

const { identityDb, closeAll } = require("../db-config");

const INTERNAL_DEPARTMENTS = [
  "SAP",
  "Non-SAP",
  "Director",
  "Account",
  "HR",
  "Operations",
  "IT Infra",
  "Sales",
  "Zoho",
];

async function run() {
  console.log("\n🏢 Migrating identity_db.employee_master — internal_department\n");

  if (!(await identityDb.schema.hasTable("employee_master"))) {
    console.error("  ✖ employee_master table does not exist. Run migrate-employee-master.js first.");
    process.exit(1);
  }

  // Add internal_department column (nullable — never populated by the sync)
  if (await identityDb.schema.hasColumn("employee_master", "internal_department")) {
    console.log("  · employee_master.internal_department already present");
  } else {
    await identityDb.schema.alterTable("employee_master", (t) => {
      t.string("internal_department", 64).nullable();
    });
    console.log("  ✚ employee_master.internal_department added");
  }

  // Helpful index so filtering by department is fast
  await identityDb
    .raw(
      `CREATE INDEX IF NOT EXISTS employee_master_internal_dept_idx
         ON employee_master (internal_department)`
    )
    .then(() => console.log("  ✚ employee_master_internal_dept_idx"))
    .catch((err) =>
      console.log(`  · index skipped (${err.message.split("\n")[0]})`)
    );

  // Show a breakdown of how many employees are already tagged
  const rows = await identityDb("employee_master")
    .select("internal_department")
    .count("* as n")
    .groupBy("internal_department")
    .catch(() => []);

  const tagged = rows.filter((r) => r.internal_department);
  const untagged = rows.find((r) => !r.internal_department);

  if (tagged.length > 0) {
    console.log("\n  Current internal_department breakdown:");
    tagged.forEach((r) =>
      console.log(`    ${String(r.internal_department).padEnd(16)} ${r.n}`)
    );
  }
  if (untagged) {
    console.log(`\n  ${untagged.n} employee(s) not yet assigned an internal department.`);
  }

  console.log("\n  Valid departments:", INTERNAL_DEPARTMENTS.join(", "));
  console.log("\n✅ internal_department migration complete.\n");
}

run()
  .catch((err) => {
    console.error("\n✖ Migration failed:", err.message);
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closeAll);
