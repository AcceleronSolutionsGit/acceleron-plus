// ═══════════════════════════════════════════════════════════════
// migrate-planning.js — real scheduling data for WBS & milestones
//
// The Gantt chart previously simulated its timeline (each work package
// was placed seven days after the previous one). These columns let a
// project manager set actual dates, progress and ownership, so the
// chart reflects the plan instead of inventing it.
//
// Run:  node src/lib/migrations/migrate-planning.js
// Idempotent: safe to run repeatedly.
// ═══════════════════════════════════════════════════════════════

const { projectDb, closeAll } = require("../db-config");

async function ensureColumn(table, column, build) {
  if (!(await projectDb.schema.hasTable(table))) {
    console.warn(`    ! table ${table} does not exist — skipping ${column}`);
    return;
  }
  if (await projectDb.schema.hasColumn(table, column)) {
    console.log(`    · ${table}.${column} already present`);
    return;
  }
  await projectDb.schema.alterTable(table, build);
  console.log(`    ✚ ${table}.${column} added`);
}

async function run() {
  console.log("\n📐 Migrating project_db for editable plans & charts\n");

  // ─── 1. wbs_items: scheduling ─────────────────────────────────
  console.log("  → wbs_items: scheduling columns");
  await ensureColumn("wbs_items", "description", (t) => t.text("description"));
  await ensureColumn("wbs_items", "status", (t) =>
    t.string("status", 24).notNullable().defaultTo("not_started")
  );
  await ensureColumn("wbs_items", "start_date", (t) => t.date("start_date"));
  await ensureColumn("wbs_items", "end_date", (t) => t.date("end_date"));
  await ensureColumn("wbs_items", "progress_percent", (t) =>
    t.integer("progress_percent").notNullable().defaultTo(0)
  );
  await ensureColumn("wbs_items", "estimated_hours", (t) => t.decimal("estimated_hours", 10, 2));
  await ensureColumn("wbs_items", "owner_user_id", (t) => t.string("owner_user_id"));

  // ─── 2. milestones: ownership & detail ────────────────────────
  console.log("  → milestones: detail columns");
  await ensureColumn("milestones", "description", (t) => t.text("description"));
  await ensureColumn("milestones", "owner_user_id", (t) => t.string("owner_user_id"));
  await ensureColumn("milestones", "is_billing_milestone", (t) =>
    t.boolean("is_billing_milestone").notNullable().defaultTo(false)
  );

  // ─── 3. Constraints ───────────────────────────────────────────
  console.log("  → constraints");

  // Clamp any pre-existing nonsense before adding the check.
  await projectDb("wbs_items")
    .whereNotNull("progress_percent")
    .andWhere((q) => q.where("progress_percent", "<", 0).orWhere("progress_percent", ">", 100))
    .update({ progress_percent: projectDb.raw("least(greatest(progress_percent, 0), 100)") })
    .catch(() => undefined);

  await projectDb
    .raw(
      `ALTER TABLE wbs_items ADD CONSTRAINT wbs_items_progress_range
         CHECK (progress_percent >= 0 AND progress_percent <= 100)`
    )
    .then(() => console.log("    ✚ wbs_items_progress_range"))
    .catch(() => console.log("    · wbs_items_progress_range already present"));

  // A work package that ends before it starts is always a data entry error.
  await projectDb
    .raw(
      `ALTER TABLE wbs_items ADD CONSTRAINT wbs_items_date_order
         CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date)`
    )
    .then(() => console.log("    ✚ wbs_items_date_order"))
    .catch(() => console.log("    · wbs_items_date_order already present"));

  // ─── 4. Indexes ───────────────────────────────────────────────
  console.log("  → indexes");
  for (const [name, sql] of [
    ["wbs_items_project_idx", `CREATE INDEX IF NOT EXISTS wbs_items_project_idx ON wbs_items (project_id, sequence)`],
    ["milestones_project_idx", `CREATE INDEX IF NOT EXISTS milestones_project_idx ON milestones (project_id, due_date)`],
    ["risks_project_idx", `CREATE INDEX IF NOT EXISTS risks_project_idx ON risks (project_id, created_at DESC)`],
    [
      "governance_reviews_project_idx",
      `CREATE INDEX IF NOT EXISTS governance_reviews_project_idx ON governance_reviews (project_id, review_date DESC)`,
    ],
  ]) {
    await projectDb
      .raw(sql)
      .then(() => console.log(`    ✚ ${name}`))
      .catch((err) => console.log(`    · ${name} skipped (${err.message.split("\n")[0]})`));
  }

  // ─── 5. Backfill ──────────────────────────────────────────────
  // Give existing work packages a sane status so the board isn't blank.
  const backfilled = await projectDb("wbs_items")
    .whereNull("status")
    .update({ status: "not_started" })
    .catch(() => 0);
  if (backfilled) console.log(`  → backfilled status on ${backfilled} existing work package(s)`);

  console.log("\n✅ Planning migration complete.\n");
  console.log("   WBS items now carry real dates, progress and ownership — the Gantt");
  console.log("   chart reads them instead of simulating a timeline.\n");
}

run()
  .catch((err) => {
    console.error("\n✖ Migration failed:", err.message);
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closeAll);
