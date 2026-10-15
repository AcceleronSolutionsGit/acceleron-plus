// ═══════════════════════════════════════════════════════════════
// project_db — Sales Orders & Invoicing Table Migration
// Run: node src/lib/migrations/migrate-sales-orders.js
// ═══════════════════════════════════════════════════════════════

const knex = require("knex");
const fs = require("fs");

try {
  for (const file of [".env", ".env.local", ".env.production"]) {
    if (fs.existsSync(file)) {
      console.log("Loading env from", file);
      const envFile = fs.readFileSync(file, "utf8");
      envFile.split("\n").forEach((line) => {
        const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
        if (match && !process.env[match[1]]) {
          process.env[match[1]] = match[2];
        }
      });
    }
  }
} catch (e) {
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

  // ── 1. Create sales_orders table if not exists ────────────────
  const hasSalesOrders = await projectDb.schema.hasTable("sales_orders");
  if (!hasSalesOrders) {
    console.log("Creating sales_orders table...");
    await projectDb.schema.createTable("sales_orders", (t) => {
      t.uuid("id").primary().defaultTo(projectDb.raw("gen_random_uuid()"));
      t.string("tenant_id").notNullable().defaultTo("acceleron");
      t.string("row_label").nullable(); // e.g. "Group 1", "Group 2"
      t.string("category").nullable(); // AUDIT, INFRA, LICENCE, OTHER, SAP, SOFTWARE, SUPPORT
      t.string("currency", 10).notNullable().defaultTo("INR"); // INR, USD
      t.string("sales_order_number").notNullable(); // e.g. ASO/01-26/0077
      t.text("material_info").nullable(); // Scope / Contract period / Description
      t.string("product_name").nullable(); // Product Name
      t.string("order_status").defaultTo("Confirmed"); // Confirmed, Closed, etc.
      t.date("order_date").nullable();
      t.string("customer_name").notNullable();
      t.string("purchase_order").nullable(); // PO Number / Reference
      t.string("invoiced_status").nullable(); // Invoiced, Partially Invoiced, Not Invoiced
      t.decimal("amount", 15, 2).defaultTo(0); // Sum of Amount
      t.decimal("invoiced_amount", 15, 2).defaultTo(0); // Sum of Invoiced Amount
      t.decimal("balance_amount", 15, 2).defaultTo(0); // Sum of Balance / Remaining Amount
      t.uuid("project_id").nullable().references("id").inTable("projects").onDelete("SET NULL");
      t.string("project_code").nullable(); // ACC-XXX
      t.string("classification").defaultTo("non_group"); // 'group' | 'non_group'
      t.timestamps(true, true);

      t.index(["sales_order_number"]);
      t.index(["customer_name"]);
      t.index(["category"]);
      t.index(["row_label"]);
      t.index(["project_id"]);
      t.index(["classification"]);
    });
    console.log("  ✅ Created: sales_orders");
  } else {
    console.log("  ⏭  Exists: sales_orders");
    const hasClassification = await projectDb.schema.hasColumn("sales_orders", "classification");
    if (!hasClassification) {
      console.log("Adding classification to sales_orders...");
      await projectDb.schema.alterTable("sales_orders", (t) => {
        t.string("classification").defaultTo("non_group");
        t.index(["classification"]);
      });
      console.log("  ✅ Added column: sales_orders.classification");
    }
  }

  // ── 2. Add extra project columns if not present ───────────────
  const hasProjects = await projectDb.schema.hasTable("projects");
  if (hasProjects) {
    const projectColumns = [
      { name: "invoiced_amount", type: "decimal", precision: 15, scale: 2 },
      { name: "balance_amount", type: "decimal", precision: 15, scale: 2 },
      { name: "category", type: "string" },
      { name: "currency", type: "string" },
      { name: "product_name", type: "string" },
      { name: "material_info", type: "text" },
      { name: "group_name", type: "string" },
      { name: "invoiced_status", type: "string" },
    ];

    for (const col of projectColumns) {
      const exists = await projectDb.schema.hasColumn("projects", col.name);
      if (!exists) {
        console.log(`Adding ${col.name} to projects...`);
        await projectDb.schema.alterTable("projects", (t) => {
          if (col.type === "decimal") t.decimal(col.name, col.precision, col.scale).defaultTo(0);
          if (col.type === "string") t.string(col.name).nullable();
          if (col.type === "text") t.text(col.name).nullable();
        });
        console.log(`  ✅ Added column: projects.${col.name}`);
      } else {
        console.log(`  ⏭  Column projects.${col.name} already exists.`);
      }
    }
  }

  console.log("Migration complete.");
  process.exit(0);
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
