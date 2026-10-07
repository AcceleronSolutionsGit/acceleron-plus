const { projectDb, closeAll } = require("../db-config");
const knex = projectDb;

async function run() {
  console.log("Running delivery_manager migration...");
  
  const hasCol = await knex.schema.hasColumn("projects", "delivery_manager_user_id");
  if (!hasCol) {
    await knex.schema.alterTable("projects", (t) => {
      t.string("delivery_manager_user_id");
    });
    console.log("Added delivery_manager_user_id to projects");
  } else {
    console.log("delivery_manager_user_id already exists");
  }
}
run().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
}).finally(closeAll);
