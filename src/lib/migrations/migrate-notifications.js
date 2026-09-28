// ═══════════════════════════════════════════════════════════════
// migrate-notifications.js — event-driven notifications in project_db
//
// Run:  node src/lib/migrations/migrate-notifications.js
//
// Idempotent: safe to run repeatedly.
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
  console.log("\n🔔 Migrating project_db for event-driven notifications\n");

  if (!(await projectDb.schema.hasTable("project_notifications"))) {
    console.error("  ✖ project_notifications does not exist. Run migrate-project-db.js first.");
    process.exit(1);
  }

  // ─── 1. Columns the notification engine needs ─────────────────
  console.log("  → project_notifications: new columns");
  await ensureColumn("project_notifications", "actor_user_id", (t) => t.string("actor_user_id"));
  await ensureColumn("project_notifications", "severity", (t) =>
    t.string("severity", 16).notNullable().defaultTo("info")
  );
  await ensureColumn("project_notifications", "email_sent_at", (t) =>
    t.timestamp("email_sent_at", { useTz: true })
  );
  await ensureColumn("project_notifications", "dedupe_key", (t) => t.string("dedupe_key", 200));

  // ─── 2. Indexes ───────────────────────────────────────────────
  console.log("  → project_notifications: indexes");

  // The unread-bell query: one recipient's newest unread rows.
  await projectDb.raw(
    `CREATE INDEX IF NOT EXISTS project_notifications_recipient_idx
       ON project_notifications (recipient_user_id, is_read, created_at DESC)`
  );
  console.log("    ✚ project_notifications_recipient_idx");

  // The project Notifications tab.
  await projectDb.raw(
    `CREATE INDEX IF NOT EXISTS project_notifications_project_idx
       ON project_notifications (project_id, created_at DESC)`
  );
  console.log("    ✚ project_notifications_project_idx");

  // Enforces "at most once" for events that carry a dedupe key.
  // Partial, so the many NULL rows don't collide.
  const dupes = await projectDb("project_notifications")
    .select("dedupe_key")
    .whereNotNull("dedupe_key")
    .groupBy("dedupe_key")
    .havingRaw("count(*) > 1");

  if (dupes.length > 0) {
    console.warn(`    ! ${dupes.length} duplicate dedupe_key value(s) found — clearing the older rows`);
    for (const { dedupe_key: key } of dupes) {
      const rows = await projectDb("project_notifications")
        .where("dedupe_key", key)
        .orderBy("created_at", "asc")
        .select("id");
      const keep = rows[0].id;
      await projectDb("project_notifications")
        .where("dedupe_key", key)
        .whereNot("id", keep)
        .update({ dedupe_key: null });
    }
  }

  await projectDb.raw(
    `CREATE UNIQUE INDEX IF NOT EXISTS project_notifications_dedupe_key_unique
       ON project_notifications (dedupe_key) WHERE dedupe_key IS NOT NULL`
  );
  console.log("    ✚ project_notifications_dedupe_key_unique");

  // ─── 3. Widen event_type if it was created narrow ─────────────
  // Older rows used a short varchar; the new event names are longer.
  await projectDb.raw(
    `ALTER TABLE project_notifications ALTER COLUMN event_type TYPE varchar(64)`
  ).catch(() => console.log("    · event_type width unchanged"));

  console.log("\n✅ Notification migration complete.\n");
  console.log("   Notifications now fire automatically on project, plan, risk and ticket events.");
  console.log("   Email delivery activates once SMTP_* is set in .env.local.\n");
}

run()
  .catch((err) => {
    console.error("\n✖ Migration failed:", err.message);
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closeAll);
