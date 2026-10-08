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

  const hasPoDetails = await projectDb.schema.hasColumn("projects", "po_details");
  if (!hasPoDetails) {
    console.log("Adding po_details to projects...");
    await projectDb.schema.alterTable("projects", (t) => {
      t.text("po_details").nullable();
    });
    console.log("Done.");
  } else {
    console.log("Column po_details already exists.");
  }

  process.exit(0);
}

migrate().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
