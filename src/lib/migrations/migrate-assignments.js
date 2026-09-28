// ═══════════════════════════════════════════════════════════════
// migrate-assignments.js — allotting work packages to people
//
// Run:  node src/lib/migrations/migrate-assignments.js
//
// Idempotent: creates what is absent, adds only missing columns, and
// never touches an existing row.
//
// `wbs_items.owner_user_id` already existed, but one free-text id
// cannot say who is actually doing a package that three people share,
// how much of it each has, or how far along each of them is. It stays
// as the single accountable owner; this table carries the work.
//
// Each row is one person's share of one work package: their planned
// hours, their own status and progress. The package's own progress
// rolls up from these rather than being typed over the top, so "60%
// done" means something you can point at.
// ═══════════════════════════════════════════════════════════════

const { projectDb, closeAll } = require("../db-config");

async function ensureColumn(table, column, build) {
  if (await projectDb.schema.hasColumn(table, column)) {
    console.log(`    · ${table}.${column} already present`);
    return;
  }
  await projectDb.schema.alterTable(table, build);
  console.log(`    ✚ ${table}.${column} added`);
}

async function run() {
  console.log("\n📋 Migrating project_db for task assignment\n");

  if (!(await projectDb.schema.hasTable("wbs_items"))) {
    throw new Error("project_db.wbs_items is missing. Run migrate-project-db.js first.");
  }

  // ─── wbs_assignments ────────────────────────────────────────
  if (!(await projectDb.schema.hasTable("wbs_assignments"))) {
    console.log("  → creating wbs_assignments");
    await projectDb.schema.createTable("wbs_assignments", (t) => {
      t.uuid("id").primary().defaultTo(projectDb.raw("gen_random_uuid()"));
      t.uuid("project_id").notNullable().references("id").inTable("projects").onDelete("CASCADE");
      t.uuid("wbs_item_id").notNullable().references("id").inTable("wbs_items").onDelete("CASCADE");

      // Both, deliberately. user_id is how permissions and timesheets
      // find somebody; employee_id is how the employee master and the
      // skills do. Somebody staffed but never signed in has only one.
      t.string("user_id", 64).notNullable();
      t.string("employee_id", 64);
      t.string("user_name", 200); // denormalised, so a list needs no join

      t.decimal("planned_hours", 10, 2);
      t.decimal("logged_hours", 10, 2).notNullable().defaultTo(0);
      t.integer("progress_percent").notNullable().defaultTo(0);
      t.string("status", 24).notNullable().defaultTo("not_started");

      t.date("start_date");
      t.date("due_date");
      t.text("notes");

      t.string("assigned_by_user_id", 64);
      t.timestamp("completed_at");
      t.timestamps(true, true);

      // One share per person per package; changing it is an edit.
      t.unique(["wbs_item_id", "user_id"]);
    });

    await projectDb.schema.alterTable("wbs_assignments", (t) => {
      // "What is allotted to me" spans every project, so this index
      // matters more than the per-project one.
      t.index(["user_id"], "wbs_assignments_user_idx");
      t.index(["project_id"], "wbs_assignments_project_idx");
      t.index(["wbs_item_id"], "wbs_assignments_item_idx");
    });

    await projectDb.raw(`
      ALTER TABLE wbs_assignments
      ADD CONSTRAINT wbs_assignments_progress_range
      CHECK (progress_percent >= 0 AND progress_percent <= 100)
    `);

    await projectDb.raw(`
      ALTER TABLE wbs_assignments
      ADD CONSTRAINT wbs_assignments_date_order
      CHECK (start_date IS NULL OR due_date IS NULL OR due_date >= start_date)
    `);

    console.log("  ✅ Created: wbs_assignments");
  } else {
    console.log("  ⏭  Exists: wbs_assignments");
    await ensureColumn("wbs_assignments", "employee_id", (t) => t.string("employee_id", 64));
    await ensureColumn("wbs_assignments", "planned_hours", (t) => t.decimal("planned_hours", 10, 2));
    await ensureColumn("wbs_assignments", "logged_hours", (t) =>
      t.decimal("logged_hours", 10, 2).notNullable().defaultTo(0)
    );
    await ensureColumn("wbs_assignments", "notes", (t) => t.text("notes"));
    await ensureColumn("wbs_assignments", "completed_at", (t) => t.timestamp("completed_at"));
  }

  // ─── wbs_items: where the roll-up lands ─────────────────────
  console.log("  → extending wbs_items");
  await ensureColumn("wbs_items", "assigned_count", (t) =>
    t.integer("assigned_count").notNullable().defaultTo(0)
  );
  await ensureColumn("wbs_items", "assigned_hours", (t) =>
    t.decimal("assigned_hours", 10, 2).notNullable().defaultTo(0)
  );

  const [{ count }] = await projectDb("wbs_assignments").count("* as count");
  console.log(`\n✅ Assignment ready — ${count} assignment(s) on file.\n`);
}

run()
  .then(closeAll)
  .catch(async (err) => {
    console.error("\n✖", err.message, "\n");
    await closeAll();
    process.exit(1);
  });
