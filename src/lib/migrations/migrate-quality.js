/**
 * Migration: Add Requirements and Test Cases modules
 */

const { projectDb } = require("../db-config");

async function migrateQuality() {
  console.log("Checking quality modules (requirements & tests) in project_db...");
  try {
    const hasReqFolders = await projectDb.schema.hasTable("requirement_folders");
    if (!hasReqFolders) {
      console.log("  → creating requirement_folders");
      await projectDb.schema.createTable("requirement_folders", (t) => {
        t.uuid("id").primary().defaultTo(projectDb.fn.uuid());
        t.uuid("project_id").notNullable().references("id").inTable("projects").onDelete("CASCADE");
        t.uuid("parent_id").references("id").inTable("requirement_folders").onDelete("CASCADE");
        t.string("name", 100).notNullable();
        t.timestamp("created_at", { useTz: true }).defaultTo(projectDb.fn.now());
        t.timestamp("updated_at", { useTz: true }).defaultTo(projectDb.fn.now());
      });
      console.log("    ✚ requirement_folders");
    }

    const hasRequirements = await projectDb.schema.hasTable("requirements");
    if (!hasRequirements) {
      console.log("  → creating requirements");
      await projectDb.schema.createTable("requirements", (t) => {
        t.uuid("id").primary().defaultTo(projectDb.fn.uuid());
        t.uuid("project_id").notNullable().references("id").inTable("projects").onDelete("CASCADE");
        t.uuid("folder_id").references("id").inTable("requirement_folders").onDelete("SET NULL");
        t.string("title", 300).notNullable();
        t.text("description");
        t.string("state", 20).defaultTo("draft"); // draft, in_review, approved, rejected
        t.string("priority", 20).defaultTo("medium"); // low, medium, high, critical
        t.string("type", 30).defaultTo("functional"); // functional, non_functional, business, technical
        t.string("owner_user_id", 64);
        t.timestamp("created_at", { useTz: true }).defaultTo(projectDb.fn.now());
        t.timestamp("updated_at", { useTz: true }).defaultTo(projectDb.fn.now());
      });
      console.log("    ✚ requirements");
    }

    const hasTestSuites = await projectDb.schema.hasTable("test_suites");
    if (!hasTestSuites) {
      console.log("  → creating test_suites");
      await projectDb.schema.createTable("test_suites", (t) => {
        t.uuid("id").primary().defaultTo(projectDb.fn.uuid());
        t.uuid("project_id").notNullable().references("id").inTable("projects").onDelete("CASCADE");
        t.uuid("parent_id").references("id").inTable("test_suites").onDelete("CASCADE");
        t.string("name", 100).notNullable();
        t.timestamp("created_at", { useTz: true }).defaultTo(projectDb.fn.now());
        t.timestamp("updated_at", { useTz: true }).defaultTo(projectDb.fn.now());
      });
      console.log("    ✚ test_suites");
    }

    const hasTestCases = await projectDb.schema.hasTable("test_cases");
    if (!hasTestCases) {
      console.log("  → creating test_cases");
      await projectDb.schema.createTable("test_cases", (t) => {
        t.uuid("id").primary().defaultTo(projectDb.fn.uuid());
        t.uuid("project_id").notNullable().references("id").inTable("projects").onDelete("CASCADE");
        t.uuid("suite_id").references("id").inTable("test_suites").onDelete("SET NULL");
        t.uuid("requirement_id").references("id").inTable("requirements").onDelete("SET NULL");
        t.uuid("wbs_id").references("id").inTable("wbs_items").onDelete("SET NULL");
        t.string("title", 300).notNullable();
        t.text("steps");
        t.text("expected_result");
        t.string("type", 20).defaultTo("manual"); // manual, api, automated
        t.string("status", 20).defaultTo("not_run"); // not_run, passed, failed, blocked, skipped
        t.string("owner_user_id", 64);
        t.timestamp("created_at", { useTz: true }).defaultTo(projectDb.fn.now());
        t.timestamp("updated_at", { useTz: true }).defaultTo(projectDb.fn.now());
      });
      console.log("    ✚ test_cases");
    }

    console.log("Quality migration complete.");
  } catch (err) {
    console.error("Failed to migrate quality modules:", err);
    process.exit(1);
  }
}

migrateQuality().then(() => process.exit(0));
