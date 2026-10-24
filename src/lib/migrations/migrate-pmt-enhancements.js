// ═══════════════════════════════════════════════════════════════
// migrate-pmt-enhancements.js — interns, consultants, PO/invoices
//
// Run:  node src/lib/migrations/migrate-pmt-enhancements.js
//
// Idempotent: adds only columns that are absent, never alters data.
//
// Changes:
//
//   project_team_members
//     member_type           employee | intern | consultant
//     custom_daily_cost_inr override cost for consultants (CTC-based)
//
//   project_additional_costs
//     po_number             Subcontractor / Purchase PO reference
//     po_value_inr          PO value — feeds into planned cost
//     invoice_number        Invoice reference
//     invoice_value_inr     Invoice value — feeds into actual cost
//     invoice_date          Date the invoice was raised
//     vendor_name           Subcontractor / vendor name
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
  console.log("\n🚀 Migrating PMT enhancements — interns, consultants, PO/invoices...\n");

  // ── 1. project_team_members — member type and custom cost ──────
  console.log("  → Extending project_team_members");

  await ensureColumn(projectDb, "project_team_members", "member_type", (t) =>
    t.string("member_type", 30).notNullable().defaultTo("employee")
  );

  await ensureColumn(projectDb, "project_team_members", "custom_daily_cost_inr", (t) =>
    t.decimal("custom_daily_cost_inr", 12, 2).nullable()
  );

  // ── 2. project_additional_costs — PO and Invoice fields ────────
  console.log("  → Extending project_additional_costs");

  await ensureColumn(projectDb, "project_additional_costs", "po_number", (t) =>
    t.string("po_number", 100).nullable()
  );

  await ensureColumn(projectDb, "project_additional_costs", "po_value_inr", (t) =>
    t.decimal("po_value_inr", 15, 2).nullable()
  );

  await ensureColumn(projectDb, "project_additional_costs", "invoice_number", (t) =>
    t.string("invoice_number", 100).nullable()
  );

  await ensureColumn(projectDb, "project_additional_costs", "invoice_value_inr", (t) =>
    t.decimal("invoice_value_inr", 15, 2).nullable()
  );

  await ensureColumn(projectDb, "project_additional_costs", "invoice_date", (t) =>
    t.date("invoice_date").nullable()
  );

  await ensureColumn(projectDb, "project_additional_costs", "vendor_name", (t) =>
    t.string("vendor_name", 200).nullable()
  );

  console.log("\n✅ PMT enhancements migration completed.\n");
}

run()
  .catch((err) => {
    console.error("❌ Migration failed:", err);
    process.exit(1);
  })
  .finally(closeAll);
