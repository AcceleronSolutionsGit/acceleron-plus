// ═══════════════════════════════════════════════════════════════
// migrate-scrap.js
//
// Run:  node src/lib/migrations/migrate-scrap.js
//
// Scrapping a project: taking it out of circulation without destroying
// what it carries.
//
// A project is not just a row. Hanging off it are timesheets somebody
// approved, invoices that have been sent, and tickets a client raised.
// Deleting the row would orphan every one of them, so scrapping is a
// state the project enters rather than a row that disappears — with the
// reason, the person and the moment recorded against it.
//
// A PM cannot scrap on their own. They record a request, an admin
// actions it, and both halves are kept so it is clear afterwards who
// asked and who agreed.
//
// Idempotent: adds what is missing, never touches an existing row.
// ═══════════════════════════════════════════════════════════════

const { projectDb, closeAll } = require("../db-config");

async function ensureColumn(table, column, build) {
  if (await projectDb.schema.hasColumn(table, column)) {
    console.log(`    · ${table}.${column} already present`);
    return;
  }
  await projectDb.schema.alterTable(table, build);
  console.log(`    ✚ ${table}.${column} added`);
}

async function run() {
  console.log("\n🗑  Scrapping a project\n");

  if (!(await projectDb.schema.hasTable("projects"))) {
    console.log("  ✖ No `projects` table — run migrate-project-db.js first.\n");
    return;
  }

  console.log("  Scrapped state");
  // Null means live. One nullable timestamp is the whole flag, so there
  // is no way for a boolean and a date to disagree about it.
  await ensureColumn("projects", "scrapped_at", (t) => t.timestamp("scrapped_at"));
  await ensureColumn("projects", "scrapped_by_user_id", (t) => t.string("scrapped_by_user_id", 64));
  await ensureColumn("projects", "scrapped_by_name", (t) => t.string("scrapped_by_name", 200));
  await ensureColumn("projects", "scrap_reason", (t) => t.text("scrap_reason"));

  console.log("\n  A PM's request, pending an admin");
  await ensureColumn("projects", "scrap_requested_at", (t) => t.timestamp("scrap_requested_at"));
  await ensureColumn("projects", "scrap_requested_by_user_id", (t) =>
    t.string("scrap_requested_by_user_id", 64)
  );
  await ensureColumn("projects", "scrap_requested_by_name", (t) =>
    t.string("scrap_requested_by_name", 200)
  );
  await ensureColumn("projects", "scrap_request_reason", (t) => t.text("scrap_request_reason"));

  // Every list in the app now filters on `scrapped_at is null`. Without
  // this index that predicate is a sequential scan on every project
  // query in the product.
  const indexName = "projects_scrapped_at_idx";
  const [{ exists }] = (
    await projectDb.raw(
      "select exists (select 1 from pg_indexes where indexname = ?) as exists",
      [indexName]
    )
  ).rows;

  if (exists) {
    console.log(`\n    · ${indexName} already present`);
  } else {
    await projectDb.raw(
      `create index ${indexName} on projects (scrapped_at) where scrapped_at is null`
    );
    console.log(`\n    ✚ ${indexName} added (partial, on the live rows)`);
  }

  const live = await projectDb("projects").whereNull("scrapped_at").count("* as n").first();
  const scrapped = await projectDb("projects").whereNotNull("scrapped_at").count("* as n").first();

  console.log("\n" + "─".repeat(62));
  console.log(`  ${live?.n ?? 0} live project(s), ${scrapped?.n ?? 0} scrapped`);
  console.log("  Administration → Projects → Scrapped is where they go.");
  console.log("─".repeat(62) + "\n");
}

run()
  .then(closeAll)
  .catch(async (err) => {
    console.error("\n✖", err.message, "\n");
    await closeAll();
    process.exit(1);
  });
