#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// Check the SMTP settings in .env.local, and send one test email.
//
//   node scripts/test-smtp.js                       sign in only
//   node scripts/test-smtp.js you@acceleronsolutions.io   …and send a test
//
// Uses the same settings and rules as the app (src/lib/mailer.ts), so if
// this works, sign-in codes will be delivered. Prints the password's
// length only, never the password.
// ═══════════════════════════════════════════════════════════════

const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");

// Read .env.local exactly the way `next start` does (@next/env), so this
// test sees the same values the running app sees. A hand-rolled reader
// once disagreed with Next about a password containing "#".
const { loadEnvConfig } = require("@next/env");
loadEnvConfig(process.cwd(), false, { info() {}, error: console.error });

// An unquoted value is cut at "#" — SMTP_PASS=abc#12 is read as "abc".
try {
  const raw = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*(SMTP_[A-Z_]+|DATABASE_PASSWORD|NOTIFICATION_SWEEP_TOKEN)\s*=\s*([^"'].*#.*)$/);
    if (m) {
      console.warn(`  ⚠ ${m[1]} contains "#" and is not in quotes — the app reads only the part before "#".`);
      console.warn(`    Put the value in double quotes:  ${m[1]}="…"\n`);
    }
  }
} catch {}

const host = process.env.SMTP_HOST;
const port = Number(process.env.SMTP_PORT || 587);
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;
const from = process.env.SMTP_FROM || user;
const to = process.argv[2];

console.log("");
console.log(`  SMTP_HOST  ${host || "(missing)"}`);
console.log(`  SMTP_PORT  ${port}`);
console.log(`  SMTP_USER  ${user || "(missing)"}`);
console.log(`  SMTP_PASS  ${pass ? `set, ${pass.length} characters` : "(missing)"}`);
console.log(`  SMTP_FROM  ${from || "(missing)"}`);
console.log("");

if (!host || !user || !pass) {
  console.error("  ✖ Set SMTP_HOST, SMTP_USER and SMTP_PASS in .env.local first.");
  process.exit(1);
}

const fromAddress = (from.match(/<([^>]+)>/) || [null, from])[1].trim().toLowerCase();
if (/office365|outlook/i.test(host) && fromAddress !== user.toLowerCase()) {
  console.warn(`  ⚠ SMTP_FROM (${fromAddress}) differs from SMTP_USER — Microsoft 365 rejects that unless ${user} has "Send As" on it.\n`);
}

const transport = nodemailer.createTransport({
  host,
  port,
  secure: process.env.SMTP_SECURE === "true" || port === 465,
  requireTLS: port === 587,
  tls: { minVersion: "TLSv1.2" },
  auth: { user, pass },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 20000,
});

(async () => {
  try {
    await transport.verify();
    console.log("  ✓ Signed in to the mail server.");
    if (to) {
      const info = await transport.sendMail({
        from,
        to,
        subject: "Acceleron Plus — test email",
        text: "If you can read this, Acceleron Plus can send sign-in codes.",
      });
      console.log(`  ✓ Test email sent to ${to} (${info.messageId}).`);
    } else {
      console.log("  Add an address to also send a test email: node scripts/test-smtp.js you@acceleronsolutions.io");
    }
    console.log("");
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    console.error(`  ✖ ${msg}\n`);
    if (/5\.7\.139|SmtpClientAuthentication is disabled/i.test(msg)) {
      console.error("  → Microsoft 365 has SMTP AUTH switched off for this mailbox or tenant. An Exchange admin must enable");
      console.error('    "Authenticated SMTP" (Microsoft 365 admin → Users → the mailbox → Mail → Manage email apps).');
    } else if (/SendAsDenied|5\.2\.252/i.test(msg)) {
      console.error("  → Set SMTP_FROM to the same address as SMTP_USER.");
    } else if (/5\.7\.3|5\.7\.8|535|Invalid login|Authentication unsuccessful/i.test(msg)) {
      console.error("  → Wrong username or password, or the account needs an app password (MFA).");
      console.error("    SMTP_USER must be the full mailbox address.");
    } else if (/ETIMEDOUT|ECONNREFUSED|ENOTFOUND|ECONNRESET/i.test(msg)) {
      console.error("  → Can't reach the mail server — check SMTP_HOST/SMTP_PORT and outbound access on that port.");
    }
    console.error("");
    process.exit(1);
  }
})();
