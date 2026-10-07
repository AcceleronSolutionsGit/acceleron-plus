const { projectDb } = require("../db-config");
const knex = projectDb;

async function run() {
  console.log("🚀 Running project_db migrations for Solution Approach...\n");

  const hasSolutionApproach = await knex.schema.hasColumn("projects", "solution_approach");
  if (!hasSolutionApproach) {
    await knex.schema.alterTable("projects", (t) => {
      t.text("solution_approach");
      t.text("scope_baseline");
    });
    console.log("  ✅ Altered: projects (added solution_approach, scope_baseline)");
  } else {
    console.log("  ⏭  Exists: projects.solution_approach");
  }

  console.log("\nDone.");
  process.exit(0);
}

run().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
