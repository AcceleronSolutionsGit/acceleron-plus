// ═══════════════════════════════════════════════════════════════
// migrate-margin-and-skills.js
//
// Run:  node src/lib/migrations/migrate-margin-and-skills.js
//
// Two unrelated-looking things that arrived together:
//
//   1. a target margin on each project, set by its PM
//   2. the skill catalogue the practice actually staffs from — the SAP
//      modules, and the development stack across backend, frontend,
//      mobile, data, cloud, quality, security and platforms
//
// Idempotent: adds what is missing, never touches an existing row.
// ═══════════════════════════════════════════════════════════════

const { identityDb, projectDb, closeAll } = require("../db-config");

async function ensureColumn(db, table, column, build) {
  if (await db.schema.hasColumn(table, column)) {
    console.log(`    · ${table}.${column} already present`);
    return;
  }
  await db.schema.alterTable(table, build);
  console.log(`    ✚ ${table}.${column} added`);
}

// The catalogue the practice actually staffs from.
//
// Two rules held throughout: a skill is something you would filter a
// bench by, and the category is how a PM thinks about the work rather
// than how a vendor markets it. Anything already present keeps its
// holders and is only moved into the right group.
const CATALOGUE = [
  // ── SAP ───────────────────────────────────────────────────
  ["SAP S/4HANA", "SAP"],
  ["SAP FICO", "SAP"],
  ["SAP MM", "SAP"],
  ["SAP SD", "SAP"],
  ["SAP PP", "SAP"],
  ["SAP QM", "SAP"],
  ["SAP PM (Plant Maintenance)", "SAP"],
  ["SAP WM / EWM", "SAP"],
  ["SAP HCM", "SAP"],
  ["SAP SuccessFactors", "SAP"],
  ["SAP Ariba", "SAP"],
  ["SAP ABAP", "SAP"],
  ["SAP Fiori / UI5", "SAP"],
  ["SAP BASIS", "SAP"],
  ["SAP BW / BI", "SAP"],
  ["SAP CPI / Integration Suite", "SAP"],
  ["SAP Solution Manager", "SAP"],
  ["SAP GRC", "SAP"],
  ["SAP Security & Authorisations", "SAP"],
  ["SAP Data Migration (LSMW / LTMC)", "SAP"],
  ["SAP Analytics Cloud", "SAP"],
  ["SAP CS (Customer Service)", "SAP"],

  // ── Backend ───────────────────────────────────────────────
  ["PHP", "Backend"],
  ["Laravel", "Backend"],
  ["Symfony", "Backend"],
  ["CodeIgniter", "Backend"],
  ["WordPress", "Backend"],
  ["Node.js", "Backend"],
  ["NestJS", "Backend"],
  ["Express.js", "Backend"],
  ["Python", "Backend"],
  ["Django", "Backend"],
  ["FastAPI", "Backend"],
  ["Flask", "Backend"],
  ["Java", "Backend"],
  ["Spring Boot", "Backend"],
  ["C# / .NET", "Backend"],
  ["ASP.NET Core", "Backend"],
  ["Go", "Backend"],
  ["Rust", "Backend"],
  ["Ruby on Rails", "Backend"],
  ["GraphQL", "Backend"],
  ["REST API design", "Backend"],
  ["gRPC", "Backend"],
  ["Microservices", "Backend"],

  // ── Frontend ──────────────────────────────────────────────
  ["JavaScript", "Frontend"],
  ["TypeScript", "Frontend"],
  ["React", "Frontend"],
  ["Next.js", "Frontend"],
  ["Vue.js", "Frontend"],
  ["Nuxt", "Frontend"],
  ["Angular", "Frontend"],
  ["Svelte / SvelteKit", "Frontend"],
  ["Tailwind CSS", "Frontend"],
  ["HTML & CSS", "Frontend"],
  ["Redux", "Frontend"],
  ["Accessibility (WCAG)", "Frontend"],

  // ── Mobile ────────────────────────────────────────────────
  ["React Native", "Mobile"],
  ["Flutter", "Mobile"],
  ["Swift / iOS", "Mobile"],
  ["Kotlin / Android", "Mobile"],

  // ── Data ──────────────────────────────────────────────────
  ["PostgreSQL", "Data"],
  ["MySQL", "Data"],
  ["MongoDB", "Data"],
  ["Microsoft SQL Server", "Data"],
  ["Oracle Database", "Data"],
  ["Redis", "Data"],
  ["Elasticsearch", "Data"],
  ["Apache Kafka", "Data"],
  ["Apache Airflow", "Data"],
  ["Apache Spark", "Data"],
  ["Data Migration", "Data"],
  ["Data Modelling", "Data"],
  ["Power BI", "Data"],
  ["Tableau", "Data"],

  // ── Cloud & DevOps ────────────────────────────────────────
  ["AWS", "Cloud & DevOps"],
  ["Azure", "Cloud & DevOps"],
  ["Google Cloud", "Cloud & DevOps"],
  ["Docker", "Cloud & DevOps"],
  ["Kubernetes", "Cloud & DevOps"],
  ["Terraform", "Cloud & DevOps"],
  ["Ansible", "Cloud & DevOps"],
  ["Jenkins", "Cloud & DevOps"],
  ["GitHub Actions", "Cloud & DevOps"],
  ["GitLab CI", "Cloud & DevOps"],
  ["Linux administration", "Cloud & DevOps"],
  ["Nginx", "Cloud & DevOps"],
  ["Observability (Grafana / ELK)", "Cloud & DevOps"],

  // ── Quality ───────────────────────────────────────────────
  ["Test Automation", "Quality"],
  ["Manual QA", "Quality"],
  ["Selenium", "Quality"],
  ["Cypress", "Quality"],
  ["Playwright", "Quality"],
  ["Jest", "Quality"],
  ["JUnit", "Quality"],
  ["API testing (Postman)", "Quality"],
  ["Performance testing (JMeter)", "Quality"],

  // ── Security ──────────────────────────────────────────────
  ["Cybersecurity", "Security"],
  ["Application security", "Security"],
  ["Penetration testing", "Security"],
  ["Identity & Access", "Security"],
  ["ISO 27001", "Security"],

  // ── Platforms ─────────────────────────────────────────────
  ["Oracle Fusion", "Platforms"],
  ["Salesforce", "Platforms"],
  ["ServiceNow", "Platforms"],
  ["Microsoft Power Platform", "Platforms"],
  ["Dynamics 365", "Platforms"],
  ["Shopify", "Platforms"],
  ["Magento", "Platforms"],

  // ── Advisory ──────────────────────────────────────────────
  ["Solution Architecture", "Advisory"],
  ["Business Analysis", "Advisory"],
  ["Change Management", "Advisory"],
  ["Project Management", "Advisory"],
  ["Agile / Scrum", "Advisory"],
  ["Pre-sales & Estimation", "Advisory"],
];

async function run() {
  console.log("\n💰 Migrating project margin and the skill catalogue\n");

  // ─── project_db.projects: the margin a PM commits to ────────
  if (!(await projectDb.schema.hasTable("projects"))) {
    throw new Error("project_db.projects is missing. Run migrate-project-db.js first.");
  }

  console.log("  → projects");
  await ensureColumn(projectDb, "projects", "target_margin_percent", (t) =>
    t.decimal("target_margin_percent", 5, 2)
  );
  // Who set it and when — a margin is a commercial commitment, and
  // "who agreed to 18%?" is a question that gets asked.
  await ensureColumn(projectDb, "projects", "margin_set_by_user_id", (t) =>
    t.string("margin_set_by_user_id", 64)
  );
  await ensureColumn(projectDb, "projects", "margin_set_at", (t) => t.timestamp("margin_set_at"));
  await ensureColumn(projectDb, "projects", "margin_notes", (t) => t.text("margin_notes"));

  const hasRange = await projectDb.raw(`
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_target_margin_range'
  `);
  if (hasRange.rows.length === 0) {
    // A margin over 100% is arithmetically impossible; a negative one
    // is a loss the PM should be stating deliberately, so -100 is the
    // floor rather than 0.
    await projectDb.raw(`
      ALTER TABLE projects
      ADD CONSTRAINT projects_target_margin_range
      CHECK (target_margin_percent IS NULL
             OR (target_margin_percent > -100 AND target_margin_percent < 100))
    `);
    console.log("    ✚ projects_target_margin_range added");
  } else {
    console.log("    · projects_target_margin_range already present");
  }

  // ─── identity_db.skills: the catalogue ──────────────────────
  if (!(await identityDb.schema.hasTable("skills"))) {
    throw new Error("identity_db.skills is missing. Run migrate-resourcing.js first.");
  }

  console.log("\n  → skills");
  let added = 0;
  let recategorised = 0;

  for (const [name, category] of CATALOGUE) {
    const existing = await identityDb("skills")
      .whereRaw("lower(name) = ?", [name.toLowerCase()])
      .first();

    if (!existing) {
      await identityDb("skills").insert({ name, category, is_active: true });
      added += 1;
      continue;
    }

    // Skills seeded earlier under looser groups ("ERP", "Engineering")
    // are moved into the right one. Who holds them is untouched.
    if (existing.category !== category) {
      await identityDb("skills")
        .where("id", existing.id)
        .update({ category, updated_at: new Date() });
      recategorised += 1;
    }
  }

  console.log(`    ✚ ${added} skill(s) added`);
  if (recategorised > 0) {
    console.log(`    ↻ ${recategorised} existing skill(s) moved into a clearer group`);
  }

  const groups = await identityDb("skills")
    .where("is_active", true)
    .groupBy("category")
    .select("category")
    .count("* as n")
    .orderBy("category");

  console.log("");
  for (const g of groups) {
    console.log(`    ${String(g.category ?? "Uncategorised").padEnd(18)} ${g.n}`);
  }

  const [{ count }] = await identityDb("skills").where("is_active", true).count("* as count");
  console.log(`\n✅ Ready — ${count} skills in the catalogue, margin fields on projects.\n`);
}

run()
  .then(closeAll)
  .catch(async (err) => {
    console.error("\n✖", err.message, "\n");
    await closeAll();
    process.exit(1);
  });
