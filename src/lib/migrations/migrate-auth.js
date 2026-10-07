// ═══════════════════════════════════════════════════════════════
// migrate-auth.js — real authentication schema for identity_db
//
// Run:  node src/lib/migrations/migrate-auth.js
//
// Idempotent: safe to run repeatedly. Adds only what is missing.
// ═══════════════════════════════════════════════════════════════

const { identityDb, closeAll } = require("../db-config");

async function ensureColumn(table, column, build) {
  const exists = await identityDb.schema.hasColumn(table, column);
  if (exists) {
    console.log(`    · ${table}.${column} already present`);
    return;
  }
  await identityDb.schema.alterTable(table, build);
  console.log(`    ✚ ${table}.${column} added`);
}

async function run() {
  console.log("\n🔐 Migrating identity_db for real authentication\n");

  // ─── Preconditions ────────────────────────────────────────────
  if (!(await identityDb.schema.hasTable("users"))) {
    console.error("  ✖ identity_db.users does not exist. Run the identity/project migrations first.");
    process.exit(1);
  }

  if (!(await identityDb.schema.hasTable("roles"))) {
    console.log("  → creating roles table");
    await identityDb.schema.createTable("roles", (t) => {
      t.uuid("id").primary().defaultTo(identityDb.raw("gen_random_uuid()"));
      t.uuid("tenant_id");
      t.string("code", 64).notNullable();
      t.string("name", 128).notNullable();
      t.text("description");
      t.boolean("is_active").notNullable().defaultTo(true);
      t.timestamps(true, true);
      t.unique(["tenant_id", "code"]);
    });
  }

  // ─── 1. Auth columns on users ─────────────────────────────────
  console.log("  → users: auth columns");
  await ensureColumn("users", "password_hash", (t) => t.text("password_hash"));
  await ensureColumn("users", "password_updated_at", (t) => t.timestamp("password_updated_at", { useTz: true }));
  await ensureColumn("users", "must_change_password", (t) =>
    t.boolean("must_change_password").notNullable().defaultTo(true)
  );
  await ensureColumn("users", "last_login_at", (t) => t.timestamp("last_login_at", { useTz: true }));
  await ensureColumn("users", "failed_login_count", (t) =>
    t.integer("failed_login_count").notNullable().defaultTo(0)
  );
  await ensureColumn("users", "locked_until", (t) => t.timestamp("locked_until", { useTz: true }));
  await ensureColumn("users", "sessions_valid_from", (t) =>
    t.timestamp("sessions_valid_from", { useTz: true })
  );

  // Case-insensitive unique email — two accounts differing only by case
  // would otherwise both match at login.
  console.log("  → users: case-insensitive unique email index");
  const duplicates = await identityDb("users")
    .select(identityDb.raw("lower(email) as email"))
    .count("* as n")
    .whereNotNull("email")
    .groupByRaw("lower(email)")
    .havingRaw("count(*) > 1");

  if (duplicates.length > 0) {
    console.warn("    ! Skipping unique index — these emails appear more than once (fix them, then re-run):");
    duplicates.forEach((d) => console.warn(`      · ${d.email} (${d.n})`));
  } else {
    await identityDb.raw(
      "CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique ON users (lower(email))"
    );
    console.log("    ✚ users_email_lower_unique");
  }

  // ─── 2. Session bookkeeping ───────────────────────────────────
  if (!(await identityDb.schema.hasTable("user_sessions"))) {
    console.log("  → creating user_sessions");
    await identityDb.schema.createTable("user_sessions", (t) => {
      t.uuid("id").primary().defaultTo(identityDb.raw("gen_random_uuid()"));
      t.uuid("user_id").notNullable().index();
      t.string("jti", 64).notNullable().unique();
      t.timestamp("issued_at", { useTz: true }).notNullable().defaultTo(identityDb.fn.now());
      t.timestamp("expires_at", { useTz: true }).notNullable();
      t.timestamp("revoked_at", { useTz: true });
      t.string("ip_address", 64);
      t.string("user_agent", 500);
    });
    console.log("    ✚ user_sessions");
  } else {
    console.log("    · user_sessions already present");
  }

  // ─── 3. Login audit trail ─────────────────────────────────────
  if (!(await identityDb.schema.hasTable("login_audit"))) {
    console.log("  → creating login_audit");
    await identityDb.schema.createTable("login_audit", (t) => {
      t.bigIncrements("id").primary();
      t.uuid("user_id").index();
      t.string("email", 320).notNullable().index();
      t.boolean("success").notNullable();
      t.string("reason", 128);
      t.string("ip_address", 64);
      t.string("user_agent", 500);
      t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(identityDb.fn.now());
    });
    console.log("    ✚ login_audit");
  } else {
    console.log("    · login_audit already present");
  }

  // ─── 4. Baseline roles ────────────────────────────────────────
  console.log("  → baseline roles");
  const tenantId = process.env.DEFAULT_TENANT_ID || "10000000-0000-0000-0000-000000000001";
  const baseline = [
    { code: "admin", name: "Administrator", description: "Full access, including masters and integrations" },
    { code: "project_manager", name: "Project Manager", description: "Owns projects, approves timesheets" },
    { code: "agent", name: "Support Agent", description: "Works ITSM tickets" },
    { code: "member", name: "Team Member", description: "Standard delivery team access" },
    { code: "client", name: "Client", description: "Read-only client portal access" },
    { code: "sales", name: "Sales / Pre-Sales", description: "Access to leads, solutioning, and ITSM" },
    { code: "ticket_handler", name: "Ticket Handler", description: "Incident tickets handling and reporting" },
    { code: "functional_consultant", name: "Functional Consultant", description: "Functional expertise" },
    { code: "technical_consultant", name: "Technical Consultant", description: "Technical expertise" },
  ];

  for (const role of baseline) {
    const existing = await identityDb("roles").where("code", role.code).first();
    if (existing) {
      console.log(`    · role ${role.code} already present`);
      continue;
    }
    await identityDb("roles").insert({ ...role, tenant_id: tenantId, is_active: true });
    console.log(`    ✚ role ${role.code}`);
  }

  console.log("\n✅ Auth migration complete.\n");
  console.log("   Next: node src/lib/seeds/seed-auth-passwords.js --admin you@acceleronsolutions.com\n");
}

run()
  .catch((err) => {
    console.error("\n✖ Migration failed:", err.message);
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closeAll);
