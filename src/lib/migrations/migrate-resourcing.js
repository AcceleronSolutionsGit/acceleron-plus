// ═══════════════════════════════════════════════════════════════
// migrate-resourcing.js — skills, and what staffing a project needs
//
// Run:  node src/lib/migrations/migrate-resourcing.js
//
// Idempotent: creates what is absent, adds only the missing columns,
// and never touches an existing row.
//
// Two databases are involved, which is why this is one script rather
// than an addition to either existing migration:
//
//   identity_db   skills, employee_skills    — who can do what
//   project_db    project_team_members       — who is on what, at what cost
//
// Skills live beside the employee master because they describe a
// person, not a project. If Darwinbox ever exposes them, the sync can
// fill the same table; until then they are maintained in the app.
// ═══════════════════════════════════════════════════════════════

const { identityDb, projectDb, closeAll } = require("../db-config");

async function ensureColumn(db, table, column, build) {
  if (await db.schema.hasColumn(table, column)) {
    console.log(`    · ${table}.${column} already present`);
    return;
  }
  await db.schema.alterTable(table, build);
  console.log(`    ✚ ${table}.${column} added`);
}

// A starter catalogue, so the first person to open the screen is not
// staring at an empty list. Inserted only when the table is new.
const SEED_SKILLS = [
  ["SAP FICO", "ERP"],
  ["SAP MM", "ERP"],
  ["SAP SD", "ERP"],
  ["Oracle Fusion", "ERP"],
  ["Data Migration", "Data"],
  ["Data Modelling", "Data"],
  ["Power BI", "Data"],
  ["React", "Engineering"],
  ["Next.js", "Engineering"],
  ["Node.js", "Engineering"],
  ["Java", "Engineering"],
  ["Python", "Engineering"],
  ["PostgreSQL", "Engineering"],
  ["Azure", "Cloud"],
  ["AWS", "Cloud"],
  ["Kubernetes", "Cloud"],
  ["Solution Architecture", "Advisory"],
  ["Business Analysis", "Advisory"],
  ["Change Management", "Advisory"],
  ["Project Management", "Advisory"],
  ["Test Automation", "Quality"],
  ["Manual QA", "Quality"],
  ["Cybersecurity", "Security"],
  ["Identity & Access", "Security"],
];

async function run() {
  console.log("\n🧑‍💼 Migrating resourcing — skills and project staffing\n");

  // ─── identity_db.skills ─────────────────────────────────────
  if (!(await identityDb.schema.hasTable("skills"))) {
    console.log("  → creating skills");
    await identityDb.schema.createTable("skills", (t) => {
      t.uuid("id").primary().defaultTo(identityDb.raw("gen_random_uuid()"));
      t.string("tenant_id", 64).notNullable().defaultTo("acceleron");
      t.string("name", 120).notNullable();
      t.string("category", 80); // ERP, Engineering, Cloud, Advisory…
      t.text("description");
      t.boolean("is_active").notNullable().defaultTo(true);
      t.timestamps(true, true);
      // Two skills called "React" would split the same people into two
      // buckets, so the name is unique per tenant.
      t.unique(["tenant_id", "name"]);
    });
    console.log("  ✅ Created: skills");

    await identityDb("skills").insert(
      SEED_SKILLS.map(([name, category]) => ({ name, category }))
    );
    console.log(`  🌱 Seeded ${SEED_SKILLS.length} starter skills`);
  } else {
    console.log("  ⏭  Exists: skills");
    await ensureColumn(identityDb, "skills", "category", (t) => t.string("category", 80));
    await ensureColumn(identityDb, "skills", "description", (t) => t.text("description"));
    await ensureColumn(identityDb, "skills", "is_active", (t) =>
      t.boolean("is_active").notNullable().defaultTo(true)
    );
  }

  // ─── identity_db.employee_skills ────────────────────────────
  if (!(await identityDb.schema.hasTable("employee_skills"))) {
    console.log("  → creating employee_skills");
    await identityDb.schema.createTable("employee_skills", (t) => {
      t.uuid("id").primary().defaultTo(identityDb.raw("gen_random_uuid()"));
      t.string("employee_id", 64).notNullable(); // employee_master.employee_id
      t.uuid("skill_id").notNullable().references("id").inTable("skills").onDelete("CASCADE");
      // 1 Aware · 2 Working · 3 Proficient · 4 Advanced · 5 Expert.
      // A number rather than a label so "at least proficient" is a
      // comparison rather than a list of accepted strings.
      t.integer("proficiency").notNullable().defaultTo(3);
      t.decimal("years_experience", 4, 1);
      t.boolean("is_primary").notNullable().defaultTo(false);
      t.string("last_used_on_project", 120);
      t.timestamps(true, true);
      t.unique(["employee_id", "skill_id"]);
    });
    await identityDb.schema.alterTable("employee_skills", (t) => {
      t.index(["skill_id"], "employee_skills_skill_idx");
      t.index(["employee_id"], "employee_skills_employee_idx");
    });
    console.log("  ✅ Created: employee_skills");
  } else {
    console.log("  ⏭  Exists: employee_skills");
    await ensureColumn(identityDb, "employee_skills", "years_experience", (t) =>
      t.decimal("years_experience", 4, 1)
    );
    await ensureColumn(identityDb, "employee_skills", "is_primary", (t) =>
      t.boolean("is_primary").notNullable().defaultTo(false)
    );
    await ensureColumn(identityDb, "employee_skills", "last_used_on_project", (t) =>
      t.string("last_used_on_project", 120)
    );
  }

  // ─── project_db.project_team_members ────────────────────────
  //
  // The table already exists and already carries the rate band, the
  // allocation and the dates. What it lacks is somewhere to keep the
  // cost that was agreed when the person was staffed: a band's rate
  // changes over time, so recomputing an old assignment from today's
  // rate would quietly rewrite history.
  if (!(await projectDb.schema.hasTable("project_team_members"))) {
    throw new Error(
      "project_db.project_team_members is missing. Run migrate-project-db.js first."
    );
  }

  console.log("  → extending project_team_members");
  await ensureColumn(projectDb, "project_team_members", "employee_id", (t) =>
    t.string("employee_id", 64)
  );
  await ensureColumn(projectDb, "project_team_members", "daily_cost_inr", (t) =>
    t.decimal("daily_cost_inr", 12, 2)
  );
  await ensureColumn(projectDb, "project_team_members", "daily_billable_rate_inr", (t) =>
    t.decimal("daily_billable_rate_inr", 12, 2)
  );
  await ensureColumn(projectDb, "project_team_members", "planned_days", (t) =>
    t.decimal("planned_days", 8, 2)
  );
  await ensureColumn(projectDb, "project_team_members", "planned_cost_inr", (t) =>
    t.decimal("planned_cost_inr", 14, 2)
  );
  await ensureColumn(projectDb, "project_team_members", "planned_billable_inr", (t) =>
    t.decimal("planned_billable_inr", 14, 2)
  );
  await ensureColumn(projectDb, "project_team_members", "notes", (t) => t.text("notes"));

  // Looking up "who is on this project" happens on every page load.
  const hasIndex = await projectDb.raw(
    `SELECT 1 FROM pg_indexes WHERE tablename = 'project_team_members' AND indexname = 'ptm_project_idx'`
  );
  if (hasIndex.rows.length === 0) {
    await projectDb.schema.alterTable("project_team_members", (t) => {
      t.index(["project_id"], "ptm_project_idx");
    });
    console.log("    ✚ ptm_project_idx added");
  } else {
    console.log("    · ptm_project_idx already present");
  }

  const [{ count: skillCount }] = await identityDb("skills").count("* as count");
  console.log(`\n✅ Resourcing ready — ${skillCount} skills in the catalogue.\n`);
}

run()
  .then(closeAll)
  .catch(async (err) => {
    console.error("\n✖", err.message, "\n");
    await closeAll();
    process.exit(1);
  });
