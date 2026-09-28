// ═══════════════════════════════════════════════════════════════
// seed-auth-passwords.js — issue initial passwords for identity_db.users
//
// Run:
//   node src/lib/seeds/seed-auth-passwords.js --admin you@acceleronsolutions.com
//
// Options:
//   --admin <email>     Grant this user the `admin` role (repeatable).
//   --password <value>  Use this password for everyone (dev only).
//                       Omitted → a unique strong password per user.
//   --only <email>      Only touch this user (repeatable).
//   --force             Re-issue passwords for users that already have one.
//   --out <file>        Where to write the credential CSV.
//                       Default: auth-credentials.csv (git-ignored).
//
// Every issued password is marked must_change_password = true.
// ═══════════════════════════════════════════════════════════════

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { promisify } = require("util");
const { identityDb, closeAll } = require("../db-config");

// ─── scrypt hashing — must stay byte-compatible with src/lib/password.ts ──

const scrypt = promisify(crypto.scrypt);
const N = 65536;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const MAXMEM = 256 * N * R;

async function hashPassword(plain) {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(plain.normalize("NFKC"), salt, KEY_LENGTH, {
    N,
    r: R,
    p: P,
    maxmem: MAXMEM,
  });
  return `scrypt$${N}$${R}$${P}$${salt.toString("hex")}$${derived.toString("hex")}`;
}

function generatePassword(length = 16) {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!@#$%^&*";
  const limit = Math.floor(256 / alphabet.length) * alphabet.length;
  let out = "";
  while (out.length < length) {
    const bytes = crypto.randomBytes(length * 2);
    for (const b of bytes) {
      if (b >= limit) continue;
      out += alphabet[b % alphabet.length];
      if (out.length === length) break;
    }
  }
  // Ensure it satisfies the app's strength rules (3 of 4 character classes).
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(out)).length;
  return classes >= 3 ? out : generatePassword(length);
}

// ─── Arguments ────────────────────────────────────────────────────

function parseArgs(argv) {
  const opts = { admins: [], only: [], password: null, force: false, out: "auth-credentials.csv" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const take = () => argv[++i];
    if (arg === "--admin") opts.admins.push((take() || "").toLowerCase());
    else if (arg === "--only") opts.only.push((take() || "").toLowerCase());
    else if (arg === "--password") opts.password = take();
    else if (arg === "--out") opts.out = take();
    else if (arg === "--force") opts.force = true;
    else if (arg.startsWith("--admin=")) opts.admins.push(arg.slice(8).toLowerCase());
    else if (arg.startsWith("--only=")) opts.only.push(arg.slice(7).toLowerCase());
    else if (arg.startsWith("--password=")) opts.password = arg.slice(11);
    else if (arg.startsWith("--out=")) opts.out = arg.slice(6);
    else console.warn(`  ! Ignoring unrecognised argument: ${arg}`);
  }
  opts.admins = opts.admins.filter(Boolean);
  opts.only = opts.only.filter(Boolean);
  return opts;
}

function csvEscape(value) {
  const s = String(value ?? "");
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// ─── Main ─────────────────────────────────────────────────────────

async function run() {
  const opts = parseArgs(process.argv.slice(2));

  console.log("\n🔑 Issuing passwords for identity_db.users\n");

  if (!(await identityDb.schema.hasColumn("users", "password_hash"))) {
    console.error("  ✖ users.password_hash is missing. Run this first:");
    console.error("      node src/lib/migrations/migrate-auth.js\n");
    process.exit(1);
  }

  if (opts.password) {
    console.log("  ⚠ Using one shared password for every user — development only.\n");
  }

  // ─── Promote admins ─────────────────────────────────────────────
  if (opts.admins.length > 0) {
    const adminRole = await identityDb("roles").where("code", "admin").first();
    if (!adminRole) {
      console.error("  ✖ No `admin` role found. Run migrate-auth.js first.\n");
      process.exit(1);
    }
    for (const email of opts.admins) {
      const updated = await identityDb("users")
        .whereRaw("lower(email) = ?", [email])
        .update({ role_id: adminRole.id });
      console.log(updated ? `  👑 ${email} → admin` : `  ! No user found for --admin ${email}`);
    }
    console.log("");
  }

  // ─── Select targets ─────────────────────────────────────────────
  let query = identityDb("users").select("id", "email", "full_name", "password_hash").orderBy("email");
  if (opts.only.length > 0) {
    query = query.whereRaw(
      `lower(email) in (${opts.only.map(() => "?").join(",")})`,
      opts.only
    );
  }
  if (!opts.force) query = query.whereNull("password_hash");

  const users = await query;

  if (users.length === 0) {
    console.log("  Nothing to do — every selected user already has a password.");
    console.log("  Use --force to re-issue, or --only <email> to target one account.\n");
    return;
  }

  console.log(`  Issuing passwords for ${users.length} user(s)…\n`);

  const rows = [["email", "full_name", "temporary_password"]];
  const now = new Date();
  let done = 0;

  for (const user of users) {
    if (!user.email) {
      console.warn(`  ! Skipping user ${user.id} — no email address`);
      continue;
    }

    const plain = opts.password || generatePassword(16);
    await identityDb("users").where("id", user.id).update({
      password_hash: await hashPassword(plain),
      password_updated_at: now,
      must_change_password: true,
      failed_login_count: 0,
      locked_until: null,
      sessions_valid_from: now,
    });

    rows.push([user.email, user.full_name, plain]);
    done++;
    if (done % 25 === 0) console.log(`    … ${done}/${users.length}`);
  }

  // Revoke any sessions that predate the new passwords.
  if (await identityDb.schema.hasTable("user_sessions")) {
    await identityDb("user_sessions").whereNull("revoked_at").update({ revoked_at: now });
  }

  const outPath = path.isAbsolute(opts.out) ? opts.out : path.join(process.cwd(), opts.out);
  fs.writeFileSync(outPath, rows.map((r) => r.map(csvEscape).join(",")).join("\r\n") + "\r\n", {
    encoding: "utf8",
    mode: 0o600,
  });

  console.log(`\n✅ ${done} password(s) issued.`);
  console.log(`   Credentials written to: ${outPath}`);
  console.log("   This file contains plaintext passwords — distribute it, then delete it.");
  console.log("   Every user is prompted to change their password at first sign-in.\n");
}

run()
  .catch((err) => {
    console.error("\n✖ Seeding failed:", err.message);
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closeAll);
