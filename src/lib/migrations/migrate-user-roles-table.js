const { identityDb, closeAll } = require("../db-config");

async function run() {
  console.log("Migrating to multiple roles per user...");

  if (!(await identityDb.schema.hasTable("user_roles"))) {
    await identityDb.schema.createTable("user_roles", (t) => {
      t.uuid("user_id").notNullable();
      t.uuid("role_id").notNullable();
      t.primary(["user_id", "role_id"]);
      t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(identityDb.fn.now());
    });
    console.log("✚ Created user_roles table.");
  }

  // Migrate existing role_id to user_roles
  const users = await identityDb("users").whereNotNull("role_id");
  let count = 0;
  for (const user of users) {
    const exists = await identityDb("user_roles").where({ user_id: user.id, role_id: user.role_id }).first();
    if (!exists) {
      await identityDb("user_roles").insert({ user_id: user.id, role_id: user.role_id });
      count++;
    }
  }
  console.log(`Migrated ${count} existing roles.`);
}

run().catch(console.error).finally(closeAll);
