/**
 * Migration: Add Sprints table and link WBS items to sprints
 */

const { projectDb, closeAll } = require("../db-config");

async function migrateSprints() {
  console.log("Checking sprints table in project_db...");
  try {
    const hasSprints = await projectDb.schema.hasTable("sprints");
    if (!hasSprints) {
      console.log("  → creating sprints");
      await projectDb.schema.createTable("sprints", (t) => {
        t.uuid("id").primary().defaultTo(projectDb.fn.uuid());
        t.uuid("project_id").notNullable().references("id").inTable("projects").onDelete("CASCADE");
        t.string("name", 100).notNullable();
        t.string("goal", 500);
        t.date("start_date");
        t.date("end_date");
        t.string("status", 20).defaultTo("planned"); // planned, active, completed, cancelled
        t.timestamp("created_at", { useTz: true }).defaultTo(projectDb.fn.now());
        t.timestamp("updated_at", { useTz: true }).defaultTo(projectDb.fn.now());
      });
      console.log("    ✚ sprints");
    }

    const hasSprintId = await projectDb.schema.hasColumn("wbs_items", "sprint_id");
    if (!hasSprintId) {
      console.log("  → adding sprint_id to wbs_items");
      await projectDb.schema.alterTable("wbs_items", (t) => {
        t.uuid("sprint_id").references("id").inTable("sprints").onDelete("SET NULL");
      });
      console.log("    ✚ sprint_id in wbs_items");
    }

    console.log("Sprints migration complete.");
  } catch (err) {
    console.error("Failed to migrate sprints:", err);
    process.exit(1);
  }
}

migrateSprints().then(() => process.exit(0));
