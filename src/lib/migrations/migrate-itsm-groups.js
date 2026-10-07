const { itsmDb, closeAll } = require("../db-config");

async function run() {
  console.log("Migrating ITSM Groups...");
  
  if (!(await itsmDb.schema.hasTable("service_group_members"))) {
    await itsmDb.schema.createTable("service_group_members", (t) => {
      t.uuid("group_id").notNullable().references("id").inTable("service_groups").onDelete("CASCADE");
      t.uuid("user_id").notNullable();
      t.primary(["group_id", "user_id"]);
      t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(itsmDb.fn.now());
    });
    console.log("✚ Created service_group_members table.");
  }
}
run().catch(console.error).finally(closeAll);
