const { projectDb, closeAll } = require("../db-config");

async function run() {
  console.log("\n🚀 Migrating projectDb for project overhead & additional costs...\n");

  // 1. Add overhead_percent to projects
  await ensureColumn(projectDb, "projects", "overhead_percent", (t) =>
    t.decimal("overhead_percent", 5, 2).defaultTo(0)
  );

  // 2. Create project_additional_costs table
  const hasAdditionalCostsTable = await projectDb.schema.hasTable("project_additional_costs");
  if (!hasAdditionalCostsTable) {
    await projectDb.schema.createTable("project_additional_costs", (t) => {
      t.uuid("id").primary().defaultTo(projectDb.raw("gen_random_uuid()"));
      t.uuid("project_id").notNullable().references("id").inTable("projects").onDelete("CASCADE");
      t.string("category", 50).notNullable().defaultTo("other"); // software | cloud_infra | travel | hardware | contractor | other
      t.string("description", 255).notNullable();
      t.decimal("planned_amount_inr", 15, 2).notNullable().defaultTo(0);
      t.decimal("actual_amount_inr", 15, 2).notNullable().defaultTo(0);
      t.string("status", 30).notNullable().defaultTo("planned"); // planned | incurred | approved | settled
      t.text("notes").nullable();
      t.timestamps(true, true);
    });
    console.log("    ✚ Created table: project_additional_costs");
  } else {
    console.log("    · Table project_additional_costs already exists");
  }

  // 3. Backfill overhead_percent and solutioning_additional_costs for projects with leads
  try {
    const projectsWithLeads = await projectDb("projects")
      .whereNotNull("lead_id")
      .select("id", "lead_id", "overhead_percent");

    for (const proj of projectsWithLeads) {
      const session = await projectDb("solutioning_sessions")
        .where("lead_id", proj.lead_id)
        .where("status", "finalized")
        .first();

      if (session) {
        if (!proj.overhead_percent && session.overhead_margin_percent) {
          await projectDb("projects")
            .where("id", proj.id)
            .update({ overhead_percent: session.overhead_margin_percent });
          console.log(`    ↳ Set overhead_percent for project ${proj.id} to ${session.overhead_margin_percent}%`);
        }

        // Check if project already has additional costs
        const existingCount = await projectDb("project_additional_costs")
          .where("project_id", proj.id)
          .count("* as cnt")
          .first();

        if (Number(existingCount?.cnt || 0) === 0) {
          const sessionCosts = await projectDb("solutioning_additional_costs")
            .where("session_id", session.id)
            .select("*");

          if (sessionCosts.length > 0) {
            const rowsToInsert = sessionCosts.map((sc) => ({
              project_id: proj.id,
              category: sc.category || "other",
              description: sc.description || "Additional cost",
              planned_amount_inr: sc.amount_inr || 0,
              actual_amount_inr: 0,
              status: "planned",
              notes: "Imported from Solutioning Session",
            }));
            await projectDb("project_additional_costs").insert(rowsToInsert);
            console.log(`    ↳ Seeded ${rowsToInsert.length} additional costs for project ${proj.id}`);
          }
        }
      }
    }
  } catch (err) {
    console.warn("    ⚠ Backfill notice:", err.message);
  }

  console.log("\n✅ Migration completed successfully.\n");
}

async function ensureColumn(db, table, column, build) {
  if (await db.schema.hasColumn(table, column)) {
    console.log(`    · ${table}.${column} already present`);
    return;
  }
  await db.schema.alterTable(table, build);
  console.log(`    ✚ ${table}.${column} added`);
}

run()
  .catch((err) => {
    console.error("❌ Migration failed:", err);
    process.exit(1);
  })
  .finally(closeAll);
