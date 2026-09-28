// ═══════════════════════════════════════════════════════════════
// grant-role.js — set a person's global role
//
// Run:
//   node src/lib/seeds/grant-role.js --email you@acceleronsolutions.io --role admin
//   node src/lib/seeds/grant-role.js --list
//
// Creates the user from employee_master if they are not in the users
// table yet, so a fresh Darwinbox sync is enough to get someone in.
// ═══════════════════════════════════════════════════════════════

const crypto = require("crypto");
const { identityDb, closeAll } = require("../db-config");

const ROLES = {
  admin: "Administrator — everything, including the employee master and roles",
  project_manager: "Project Manager — creates and runs projects",
  agent: "Support Agent — works ITSM tickets",
  member: "Team Member — updates their own work, logs time",
  client: "Client — read-only portal access",
};

function parseArgs(argv) {
  const opts = { email: null, role: null, list: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--email") opts.email = (argv[++i] || "").trim().toLowerCase();
    else if (arg.startsWith("--email=")) opts.email = arg.slice(8).trim().toLowerCase();
    else if (arg === "--role") opts.role = (argv[++i] || "").trim().toLowerCase();
    else if (arg.startsWith("--role=")) opts.role = arg.slice(7).trim().toLowerCase();
    else if (arg === "--list") opts.list = true;
    else console.warn(`  ! Ignoring unrecognised argument: ${arg}`);
  }
  return opts;
}

/** Stable uuid from a string, matching seed-comprehensive.js. */
function uuidFromStr(str) {
  const hash = crypto.createHash("md5").update(str).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

async function listUsers() {
  const users = await identityDb("users as u")
    .leftJoin("roles as r", "r.id", "u.role_id")
    .select("u.email", "u.full_name", "u.is_active", identityDb.ref("r.code").as("role"))
    .orderBy("u.email");

  if (users.length === 0) {
    console.log("\n  No users yet. Run the Darwinbox sync, then seed-comprehensive.js.\n");
    return;
  }

  console.log(`\n  ${users.length} user(s):\n`);
  console.log(`  ${"EMAIL".padEnd(44)} ${"NAME".padEnd(26)} ${"ROLE".padEnd(18)} ACTIVE`);
  console.log(`  ${"-".repeat(44)} ${"-".repeat(26)} ${"-".repeat(18)} ------`);
  for (const u of users) {
    console.log(
      `  ${String(u.email ?? "").padEnd(44)} ${String(u.full_name ?? "").slice(0, 26).padEnd(26)} ` +
        `${String(u.role ?? "(none)").padEnd(18)} ${u.is_active ? "yes" : "no"}`
    );
  }
  console.log("");
}

async function run() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.list) return listUsers();

  if (!opts.email || !opts.role) {
    console.error("\n  Usage: node src/lib/seeds/grant-role.js --email <address> --role <role>\n");
    console.error("  Roles:");
    Object.entries(ROLES).forEach(([code, desc]) => console.error(`    ${code.padEnd(18)} ${desc}`));
    console.error("\n  Or list everyone:  node src/lib/seeds/grant-role.js --list\n");
    process.exit(1);
  }

  if (!ROLES[opts.role]) {
    console.error(`\n  ✖ Unknown role "${opts.role}". Choose one of: ${Object.keys(ROLES).join(", ")}\n`);
    process.exit(1);
  }

  console.log(`\n🔑 Setting ${opts.email} to "${opts.role}"\n`);

  if (!(await identityDb.schema.hasTable("roles"))) {
    console.error("  ✖ identity_db.roles does not exist. Run:");
    console.error("      node src/lib/migrations/migrate-auth.js\n");
    process.exit(1);
  }

  const role = await identityDb("roles").where("code", opts.role).first();
  if (!role) {
    console.error(`  ✖ Role "${opts.role}" is not in the roles table. Run migrate-auth.js first.\n`);
    process.exit(1);
  }

  let user = await identityDb("users").whereRaw("lower(email) = ?", [opts.email]).first();

  // Not a user yet — build one from the employee master if we can.
  if (!user) {
    console.log("  → not in users; checking employee_master…");
    const employee = await identityDb("employee_master")
      .whereRaw("lower(company_email_id) = ?", [opts.email])
      .first()
      .catch(() => null);

    if (!employee) {
      console.error(`\n  ✖ No user and no employee record for ${opts.email}.`);
      console.error("    Run the Darwinbox sync first:");
      console.error("      node src/lib/seeds/sync-darwinbox.js\n");
      console.error("    Or check the spelling:  node src/lib/seeds/grant-role.js --list\n");
      process.exit(1);
    }

    const tenantId = process.env.DEFAULT_TENANT_ID || "10000000-0000-0000-0000-000000000001";
    const id = uuidFromStr("user_" + employee.employee_id);

    await identityDb("users").insert({
      id,
      tenant_id: tenantId,
      email: employee.company_email_id,
      full_name: employee.full_name,
      role_id: role.id,
      darwinbox_ref: employee.employee_id,
      is_active: true,
    });

    console.log(`  ✚ created user from employee ${employee.employee_id} (${employee.full_name})`);
    user = await identityDb("users").where("id", id).first();
  } else {
    const previous = await identityDb("roles").where("id", user.role_id).first().catch(() => null);
    await identityDb("users").where("id", user.id).update({ role_id: role.id });
    console.log(`  ✔ ${user.full_name || user.email}: ${previous?.code ?? "(none)"} → ${opts.role}`);
  }

  if (!user.is_active) {
    await identityDb("users").where("id", user.id).update({ is_active: true });
    console.log("  ✔ reactivated the account");
  }

  // A role change should take effect on the next request, not in 8 hours.
  if (await identityDb.schema.hasColumn("users", "sessions_valid_from")) {
    await identityDb("users").where("id", user.id).update({ sessions_valid_from: new Date() });
    console.log("  ✔ existing sessions invalidated — they will sign in again with the new role");
  }

  console.log(`\n✅ ${opts.email} is now "${opts.role}".`);
  if (opts.role === "admin") {
    console.log("   They can now open Master Data, the employee master and role management.");
  }
  console.log("");
}

run()
  .catch((err) => {
    console.error("\n✖ Failed:", err.message);
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closeAll);
