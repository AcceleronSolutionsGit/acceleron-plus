// ═══════════════════════════════════════════════════════════════
// migrate-darwinbox-autosync.js
//
// Run:  node src/lib/migrations/migrate-darwinbox-autosync.js
//
// Two tables in identity_db for the Darwinbox employee auto-sync:
//
//   darwinbox_sync_settings  one row: on/off, how often, what time, and
//                            a "running since" stamp that stops two
//                            syncs (a click and the schedule) overlapping
//   darwinbox_sync_runs      every sync, manual or automatic, with its
//                            counts and message — the history the admin
//                            screen shows
//
// Idempotent. Auto-sync starts ON — once every 24 hours, at 02:00 India
// time — and an admin can change or switch it off under Master Data →
// Auto-sync. The first run is the next 02:00 after this migration.
// ═══════════════════════════════════════════════════════════════

const { identityDb, closeAll } = require("../db-config");

async function main() {
  console.log("\n▶ Darwinbox auto-sync tables\n");

  if (!(await identityDb.schema.hasTable("darwinbox_sync_settings"))) {
    await identityDb.schema.createTable("darwinbox_sync_settings", (t) => {
      t.integer("id").primary(); // always 1
      t.boolean("enabled").notNullable().defaultTo(true);
      // hourly | every_6h | every_12h | daily
      t.string("frequency", 20).notNullable().defaultTo("daily");
      // Hour of day (0–23, Asia/Kolkata) for the daily run.
      t.integer("daily_hour").notNullable().defaultTo(2);
      t.timestamp("running_since", { useTz: true }).nullable();
      // When it was last switched on — the schedule counts from here, so
      // switching it on never fires a surprise sync the same minute.
      t.timestamp("enabled_at", { useTz: true }).nullable();
      t.string("updated_by_user_id");
      t.timestamp("updated_at", { useTz: true }).defaultTo(identityDb.fn.now());
    });
    console.log("  ✚ darwinbox_sync_settings created");
  } else {
    console.log("  · darwinbox_sync_settings already present");
  }

  const row = await identityDb("darwinbox_sync_settings").where("id", 1).first();
  if (!row) {
    await identityDb("darwinbox_sync_settings").insert({
      id: 1,
      enabled: true,
      frequency: "daily",
      daily_hour: 2,
      enabled_at: new Date(),
    });
    console.log("  ✚ auto-sync ON: every 24 hours at 02:00 India time (change it under Master Data → Auto-sync)");
  }

  if (!(await identityDb.schema.hasTable("darwinbox_sync_runs"))) {
    await identityDb.schema.createTable("darwinbox_sync_runs", (t) => {
      t.uuid("id").primary().defaultTo(identityDb.raw("gen_random_uuid()"));
      t.string("trigger", 10).notNullable(); // manual | auto
      t.string("triggered_by_user_id");
      t.timestamp("started_at", { useTz: true }).notNullable().defaultTo(identityDb.fn.now());
      t.timestamp("finished_at", { useTz: true });
      t.boolean("success");
      t.text("message");
      t.integer("total_processed");
      t.integer("created_count");
      t.integer("updated_count");
      t.integer("deactivated_count");
      t.index(["trigger", "started_at"]);
    });
    console.log("  ✚ darwinbox_sync_runs created");
  } else {
    console.log("  · darwinbox_sync_runs already present");
  }

  console.log("\n  ✅ Done.\n");
}

main()
  .catch((err) => {
    console.error("❌ migrate-darwinbox-autosync failed:", err);
    process.exitCode = 1;
  })
  .finally(() => closeAll());
