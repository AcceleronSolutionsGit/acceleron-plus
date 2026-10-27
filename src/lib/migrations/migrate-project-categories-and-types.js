// ═══════════════════════════════════════════════════════════════
// migrate-project-categories-and-types.js
// Master tables for Project Categories and Project Types
//
// Run:  node src/lib/migrations/migrate-project-categories-and-types.js
// ═══════════════════════════════════════════════════════════════

const { projectDb, closeAll } = require("../db-config");

const INITIAL_TAXONOMY = [
  {
    code: "SAP",
    name: "SAP",
    label: "SAP",
    description: "SAP ERP, S/4HANA migrations, AMS, Basis, ABAP and functional consulting",
    display_order: 1,
    types: [
      { name: "SAP Implementation", code: "SAP_IMPL", description: "Greenfield or brownfield SAP deployment" },
      { name: "SAP AMS", code: "SAP_AMS", description: "Application management support for SAP" },
      { name: "SAP Development", code: "SAP_DEV", description: "Custom ABAP/Fiori/BTP development" },
      { name: "SAP Support", code: "SAP_SUPP", description: "L1/L2/L3 support and ticket resolution" },
      { name: "SAP S/4HANA Migration", code: "SAP_S4_MIG", description: "ECC to S/4HANA conversion and upgrade" },
    ],
  },
  {
    code: "SOFTWARE",
    name: "Software",
    label: "Software",
    description: "Bespoke web, mobile, API, and cloud application engineering",
    display_order: 2,
    types: [
      { name: "Software Development", code: "SW_DEV", description: "Custom software architecture & engineering" },
      { name: "Software AMS", code: "SW_AMS", description: "Maintenance, bug fixes & continuous delivery" },
      { name: "Custom Software", code: "SW_CUSTOM", description: "Specialized enterprise software solutions" },
      { name: "Web & Mobile App", code: "SW_WEB_MOB", description: "Responsive web apps and native/cross-platform mobile" },
      { name: "Integration & Portal", code: "SW_INT_PORTAL", description: "Enterprise portals, middleware & integrations" },
    ],
  },
  {
    code: "INFRA",
    name: "IT Infrastructure",
    label: "IT Infrastructure",
    description: "Cloud, server, network, datacenter, and hardware infrastructure",
    display_order: 3,
    types: [
      { name: "IT Infra Project", code: "INFRA_PRJ", description: "Datacenter or on-prem IT infrastructure setup" },
      { name: "IT Infra AMS", code: "INFRA_AMS", description: "Managed infrastructure maintenance & monitoring" },
      { name: "Network & Security", code: "INFRA_NET_SEC", description: "Firewalls, switches, SD-WAN, and security appliances" },
      { name: "Cloud Infrastructure", code: "INFRA_CLOUD", description: "AWS, Azure, GCP provisioning and management" },
      { name: "Hardware / Server Setup", code: "INFRA_HW", description: "Physical server, rack and peripheral installation" },
    ],
  },
  {
    code: "SUPPORT",
    name: "Support & AMS",
    label: "Support & AMS",
    description: "Managed IT services, helpdesk, AMC, and manpower deployments",
    display_order: 4,
    types: [
      { name: "IT Managed Services", code: "SUPP_IT_MANAGED", description: "End-to-end managed IT operations" },
      { name: "AMS Support", code: "SUPP_AMS", description: "Application maintenance and SLA support" },
      { name: "End User Support", code: "SUPP_END_USER", description: "Desktop, helpdesk, and local technical support" },
      { name: "Manpower Support", code: "SUPP_MANPOWER", description: "Dedicated on-site or remote staff augmentation" },
    ],
  },
  {
    code: "ZOHO",
    name: "Zoho",
    label: "Zoho",
    description: "Zoho CRM, Creator, Books, and ecosystem implementations",
    display_order: 5,
    types: [
      { name: "ZOHO Implementation", code: "ZOHO_IMPL", description: "Setup and configuration of Zoho suite" },
      { name: "ZOHO AMS", code: "ZOHO_AMS", description: "Ongoing customization and support for Zoho" },
      { name: "ZOHO Creator / CRM", code: "ZOHO_CRM", description: "Custom workflows and CRM pipeline automation" },
    ],
  },
  {
    code: "LICENCE",
    name: "Licence & Subscriptions",
    label: "Licence & Subscriptions",
    description: "OEM software licensing, SaaS subscriptions, Microsoft 365, and cloud seats",
    display_order: 6,
    types: [
      { name: "Software License", code: "LIC_SW", description: "Perpetual or subscription commercial licenses" },
      { name: "Microsoft 365", code: "LIC_M365", description: "Microsoft 365 / Office 365 licenses and provisioning" },
      { name: "Cloud Subscription", code: "LIC_CLOUD", description: "Recurring SaaS or cloud tier subscriptions" },
      { name: "Security License", code: "LIC_SEC", description: "Endpoint security, antivirus, and VPN licenses" },
    ],
  },
  {
    code: "AUDIT",
    name: "Audit & Security",
    label: "Audit & Security",
    description: "Vulnerability assessment, penetration testing, compliance, and process audits",
    display_order: 7,
    types: [
      { name: "Security Audit / VAPT", code: "AUDIT_VAPT", description: "Vulnerability Assessment and Penetration Testing" },
      { name: "ISMS / Compliance", code: "AUDIT_ISMS", description: "ISO 27001, GDPR, and data protection compliance" },
      { name: "SoD Review", code: "AUDIT_SOD", description: "Segregation of Duties and authorization reviews" },
      { name: "Process Audit", code: "AUDIT_PROCESS", description: "ITIL, change management, and governance audits" },
    ],
  },
  {
    code: "OTHER",
    name: "Other",
    label: "Other",
    description: "General consulting, client workshops, training, and miscellaneous IT services",
    display_order: 8,
    types: [
      { name: "Consulting", code: "OTHER_CONSULT", description: "Advisory, roadmap planning, and technology strategy" },
      { name: "Training", code: "OTHER_TRAINING", description: "Corporate tech enablement and user training" },
      { name: "General IT Services", code: "OTHER_GENERAL", description: "Ad-hoc technical and delivery engagements" },
    ],
  },
];

async function run() {
  console.log("\n🚀 Migrating project_categories and project_types tables...\n");

  // 1. Create project_categories table
  const catExists = await projectDb.schema.hasTable("project_categories");
  if (!catExists) {
    await projectDb.schema.createTable("project_categories", (t) => {
      t.uuid("id").primary().defaultTo(projectDb.raw("gen_random_uuid()"));
      t.string("tenant_id", 50).notNullable().defaultTo("acceleron");
      t.string("code", 50).notNullable().unique();
      t.string("name", 100).notNullable();
      t.string("label", 100).nullable();
      t.text("description").nullable();
      t.integer("display_order").notNullable().defaultTo(0);
      t.boolean("is_active").notNullable().defaultTo(true);
      t.timestamps(true, true);

      t.index(["code"]);
      t.index(["is_active"]);
      t.index(["display_order"]);
    });
    console.log("  ✅ Created: project_categories");
  } else {
    console.log("  ⏭  Exists: project_categories");
  }

  // 2. Create project_types table
  const typeExists = await projectDb.schema.hasTable("project_types");
  if (!typeExists) {
    await projectDb.schema.createTable("project_types", (t) => {
      t.uuid("id").primary().defaultTo(projectDb.raw("gen_random_uuid()"));
      t.string("tenant_id", 50).notNullable().defaultTo("acceleron");
      t.uuid("category_id").nullable().references("id").inTable("project_categories").onDelete("CASCADE");
      t.string("category_code", 50).nullable();
      t.string("name", 100).notNullable();
      t.string("code", 100).nullable();
      t.text("description").nullable();
      t.integer("display_order").notNullable().defaultTo(0);
      t.boolean("is_active").notNullable().defaultTo(true);
      t.timestamps(true, true);

      t.index(["category_id"]);
      t.index(["category_code"]);
      t.index(["is_active"]);
      t.index(["display_order"]);
    });
    console.log("  ✅ Created: project_types");
  } else {
    console.log("  ⏭  Exists: project_types");
  }

  // 3. Seed initial taxonomy if empty
  const countRes = await projectDb("project_categories").count("* as count").first();
  const currentCount = parseInt(countRes?.count || countRes?.["count(*)"] || "0", 10);

  if (currentCount === 0) {
    console.log("  🌱 Seeding default project categories and types...");
    for (const cat of INITIAL_TAXONOMY) {
      const [insertedCat] = await projectDb("project_categories")
        .insert({
          tenant_id: "acceleron",
          code: cat.code,
          name: cat.name,
          label: cat.label,
          description: cat.description,
          display_order: cat.display_order,
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning("*");

      const catId = insertedCat?.id;

      if (cat.types && cat.types.length > 0) {
        let order = 1;
        for (const pt of cat.types) {
          await projectDb("project_types").insert({
            tenant_id: "acceleron",
            category_id: catId,
            category_code: cat.code,
            name: pt.name,
            code: pt.code,
            description: pt.description,
            display_order: order++,
            is_active: true,
            created_at: new Date(),
            updated_at: new Date(),
          });
        }
      }
    }
    console.log(`  ✅ Successfully seeded ${INITIAL_TAXONOMY.length} categories with project types.`);
  } else {
    console.log(`  ⏭  Found existing ${currentCount} categories; skipping seed.`);
  }

  console.log("\n✨ Migration complete.\n");
}

run()
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeAll();
  });
