// ═══════════════════════════════════════════════════════════════
// migrate-project-custom-roles.js — table for custom project roles
//
// Run:  node src/lib/migrations/migrate-project-custom-roles.js
// ═══════════════════════════════════════════════════════════════

const { projectDb, closeAll } = require("../db-config");

async function run() {
  console.log("\n🚀 Migrating project_custom_roles table...\n");

  const exists = await projectDb.schema.hasTable("project_custom_roles");
  if (!exists) {
    await projectDb.schema.createTable("project_custom_roles", (t) => {
      t.uuid("id").primary().defaultTo(projectDb.raw("gen_random_uuid()"));
      t.uuid("project_id").nullable().references("id").inTable("projects").onDelete("CASCADE");
      t.string("name", 100).notNullable();
      t.string("code", 100).notNullable();
      t.text("description").nullable();
      t.string("base_role", 50).notNullable().defaultTo("Developer");
      t.boolean("is_active").notNullable().defaultTo(true);
      t.timestamps(true, true);

      t.index(["project_id"]);
      t.index(["is_active"]);
    });
    console.log("  ✅ Created: project_custom_roles");

    // Seed common custom roles as starter roles (global)
    const starterRoles = [
      { name: "Scrum Master", code: "scrum_master", base_role: "Team Lead", description: "Facilitates agile ceremonies, removes blockers, tracks sprint health." },
      { name: "DevOps Engineer", code: "devops_engineer", base_role: "Developer", description: "Builds CI/CD pipelines, manages cloud infrastructure and deployments." },
      { name: "QA Automation Engineer", code: "qa_automation_engineer", base_role: "Developer", description: "Designs and runs automated test suites and quality verification." },
      { name: "UI/UX Designer", code: "ui_ux_designer", base_role: "Developer", description: "Creates wireframes, prototypes, and user interface designs." },
      { name: "Solution Architect", code: "solution_architect", base_role: "Team Lead", description: "Leads technical architecture, integrations, and high-level design." },
      { name: "Business Analyst", code: "business_analyst", base_role: "Developer", description: "Captures business requirements, user stories, and acceptance criteria." },
    ];

    for (const role of starterRoles) {
      await projectDb("project_custom_roles").insert({
        ...role,
        project_id: null,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      });
    }
    console.log(`  🌱 Seeded ${starterRoles.length} starter global custom project roles.`);
  } else {
    console.log("  ⏭  Exists: project_custom_roles");
  }

  console.log("\n✨ Done.\n");
}

run()
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exitCode = 1;
  })
  .finally(closeAll);
