const knex = require("knex");
const fs = require("fs");

try {
  for (const file of [".env", ".env.local", ".env.production"]) {
    if (fs.existsSync(file)) {
      console.log("Loading env from", file);
      const envFile = fs.readFileSync(file, "utf8");
      envFile.split("\n").forEach(line => {
        const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
        if (match && !process.env[match[1]]) {
          process.env[match[1]] = match[2];
        }
      });
    }
  }
} catch(e) {
  console.error("Error loading env files:", e);
}

const projectDb = knex({
  client: "pg",
  connection: {
    host: process.env.DATABASE_HOST || "127.0.0.1",
    port: Number(process.env.DATABASE_PORT || 5432),
    user: process.env.DATABASE_USER || "postgres",
    password: process.env.DATABASE_PASSWORD || "",
    database: process.env.DATABASE_PROJECT_NAME || "project_db",
  },
});

async function migrate() {
  console.log("Connecting to", process.env.DATABASE_HOST, "as", process.env.DATABASE_USER);
  const hasTable = await projectDb.schema.hasTable("projects");
  if (!hasTable) {
    console.error("No projects table found.");
    process.exit(1);
  }

  const columnsToAdd = [
    { name: "po_details", type: "text" },
    { name: "delivery_manager_user_id", type: "string" },
    { name: "sponsor_user_id", type: "string" },
    { name: "classification", type: "string" },
    { name: "zoho_sales_order_ref", type: "string" },
    { name: "solution_approach", type: "text" },
    { name: "scope_baseline", type: "text" }
  ];

  await projectDb.schema.alterTable("projects", (t) => {
    // We add them if they don't exist
  });

  for (const col of columnsToAdd) {
    const exists = await projectDb.schema.hasColumn("projects", col.name);
    if (!exists) {
      console.log(`Adding ${col.name} to projects...`);
      await projectDb.schema.alterTable("projects", (t) => {
        if (col.type === "text") t.text(col.name).nullable();
        if (col.type === "string") t.string(col.name).nullable();
      });
    } else {
      console.log(`Column ${col.name} already exists.`);
    }
  }

  console.log("Done.");
  process.exit(0);
}

migrate().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
