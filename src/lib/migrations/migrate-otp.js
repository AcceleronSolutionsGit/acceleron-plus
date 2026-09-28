// ═══════════════════════════════════════════════════════════════
// migrate-otp.js — one-time sign-in codes in identity_db
//
// Run:  node src/lib/migrations/migrate-otp.js
// Idempotent: safe to run repeatedly.
// ═══════════════════════════════════════════════════════════════

const { identityDb, closeAll } = require("../db-config");

async function run() {
  console.log("\n🔑 Migrating identity_db for one-time sign-in codes\n");

  if (!(await identityDb.schema.hasTable("users"))) {
    console.error("  ✖ identity_db.users does not exist. Run migrate-auth.js first.");
    process.exit(1);
  }

  if (!(await identityDb.schema.hasTable("login_otp_challenges"))) {
    console.log("  → creating login_otp_challenges");
    await identityDb.schema.createTable("login_otp_challenges", (t) => {
      // A 256-bit random id, handed to the browser in an httpOnly cookie.
      t.string("id", 64).primary();
      t.uuid("user_id").notNullable().index();
      t.string("email", 320).notNullable();
      // HMAC of the code, keyed by SESSION_SECRET — never the code itself.
      t.string("code_hash", 128).notNullable();
      t.timestamp("expires_at", { useTz: true }).notNullable();
      t.integer("attempts").notNullable().defaultTo(0);
      t.timestamp("consumed_at", { useTz: true });
      t.timestamp("last_sent_at", { useTz: true });
      t.string("ip_address", 64);
      t.string("user_agent", 500);
      t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(identityDb.fn.now());
    });
    console.log("    ✚ login_otp_challenges");
  } else {
    console.log("    · login_otp_challenges already present");
  }

  console.log("  → indexes");

  // Rate-limit lookup: how many codes has this account asked for lately?
  await identityDb.raw(
    `CREATE INDEX IF NOT EXISTS login_otp_user_created_idx
       ON login_otp_challenges (user_id, created_at DESC)`
  );
  console.log("    ✚ login_otp_user_created_idx");

  // Housekeeping sweep.
  await identityDb.raw(
    `CREATE INDEX IF NOT EXISTS login_otp_expires_idx
       ON login_otp_challenges (expires_at)`
  );
  console.log("    ✚ login_otp_expires_idx");

  // Clear out anything stale from a previous run.
  const purged = await identityDb("login_otp_challenges")
    .where("created_at", "<", new Date(Date.now() - 24 * 60 * 60 * 1000))
    .del();
  if (purged) console.log(`  → purged ${purged} stale challenge(s)`);

  console.log("\n✅ One-time code migration complete.\n");
  console.log("   Sign-in is now: enter your email → receive a 6-digit code → enter it.");
  console.log("   In development the code is also shown on screen and printed to this console.");
  console.log("   Set AUTH_REQUIRE_PASSWORD=true later to ask for the password as well.\n");
}

run()
  .catch((err) => {
    console.error("\n✖ Migration failed:", err.message);
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closeAll);
