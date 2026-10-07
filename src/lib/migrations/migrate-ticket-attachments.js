const { itsmDb, closeAll } = require("../db-config");
const knex = itsmDb;

async function run() {
  console.log("Migrating ticket_attachments in itsm_db...");

  if (!(await knex.schema.hasTable("ticket_attachments"))) {
    await knex.schema.createTable("ticket_attachments", (t) => {
      t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
      t.uuid("ticket_id").notNullable().references("id").inTable("tickets").onDelete("CASCADE");
      t.string("file_name").notNullable();
      t.string("stored_file_name").notNullable();
      t.string("file_path").notNullable();
      t.string("mime_type").notNullable();
      t.bigInteger("file_size_bytes").notNullable();
      t.string("uploaded_by_name");
      t.timestamps(true, true);
    });
    console.log("✅ Created ticket_attachments table");
  } else {
    console.log("✅ ticket_attachments table already exists");
  }

  console.log("Done.");
  await closeAll();
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
