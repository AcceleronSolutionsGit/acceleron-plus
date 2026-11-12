// ═══════════════════════════════════════════════════════════════
// migrate-project-target-margins.js
// Idempotently populates baseline target_margin_percent for projects
// where target_margin_percent is currently null, using Acceleron's
// category benchmarks (SAP 30%, Software 25%, Support/Infra 20%, Licence 10%, etc.).
//
// Run:  node src/lib/migrations/migrate-project-target-margins.js
// ═══════════════════════════════════════════════════════════════

const { projectDb, closeAll } = require("../db-config");

const CATEGORY_MARGINS = {
  SAP: 30.0,
  SOFTWARE: 25.0,
  INFRA: 20.0,
  SUPPORT: 20.0,
  ZOHO: 25.0,
  LICENCE: 10.0,
  LICENSE: 10.0,
  AUDIT: 30.0,
  OTHER: 25.0,
};

function getBenchmarkMargin(category) {
  const cat = (category || "").toUpperCase();
  if (cat.includes("SAP")) return CATEGORY_MARGINS.SAP;
  if (cat.includes("SOFT")) return CATEGORY_MARGINS.SOFTWARE;
  if (cat.includes("INFRA")) return CATEGORY_MARGINS.INFRA;
  if (cat.includes("SUPP") || cat.includes("MANAG")) return CATEGORY_MARGINS.SUPPORT;
  if (cat.includes("ZOHO")) return CATEGORY_MARGINS.ZOHO;
  if (cat.includes("LICEN")) return CATEGORY_MARGINS.LICENCE;
  if (cat.includes("AUDIT")) return CATEGORY_MARGINS.AUDIT;
  return CATEGORY_MARGINS.OTHER;
}

async function run() {
  console.log("\n🚀 Populating Baseline Project Target Margins...\n");

  const unconfigured = await projectDb("projects")
    .select("id", "code", "category", "budget_inr")
    .whereNull("target_margin_percent");

  console.log(`Found ${unconfigured.length} projects without target_margin_percent.`);

  let updatedCount = 0;
  for (const p of unconfigured) {
    const margin = getBenchmarkMargin(p.category);
    await projectDb("projects")
      .where("id", p.id)
      .update({
        target_margin_percent: margin,
        margin_notes: `Initial baseline set from ${p.category || 'General'} benchmark (${margin}%)`,
        updated_at: new Date(),
      });
    updatedCount++;
  }

  console.log(`✅ Successfully set baseline target margins for ${updatedCount} projects.`);
  await closeAll();
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});

