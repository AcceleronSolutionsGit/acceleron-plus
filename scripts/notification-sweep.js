#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// Calls POST /api/notifications/sweep once and exits.
// Run by pm2 on a cron (see ecosystem.config.js), or by hand:
//   node scripts/notification-sweep.js
//
// Reads NOTIFICATION_SWEEP_TOKEN from the environment, falling back to
// .env.local / .env in the working directory (same rule as db-config.js:
// a real environment variable always wins).
// ═══════════════════════════════════════════════════════════════

const fs = require("fs");
const path = require("path");

function loadEnvFile(filename) {
  const filePath = path.join(process.cwd(), filename);
  if (!fs.existsSync(filePath)) return;
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!key || key in process.env) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const url = process.env.SWEEP_URL || "http://127.0.0.1:8099/api/notifications/sweep";
const token = process.env.NOTIFICATION_SWEEP_TOKEN;
const ATTEMPTS = 6;
const WAIT_MS = 10_000; // the app may still be booting when pm2 starts us

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!token) {
    console.error("[sweep] NOTIFICATION_SWEEP_TOKEN is not set — nothing to authenticate with. Skipping.");
    process.exit(1);
  }

  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "x-sweep-token": token },
      });
      const body = await res.text();
      if (res.ok) {
        console.log(`[sweep] ${res.status} ${body}`);
        return;
      }
      // 401/403 means the token is wrong — retrying will not help.
      if (res.status === 401 || res.status === 403) {
        console.error(`[sweep] ${res.status} — token rejected. Check NOTIFICATION_SWEEP_TOKEN. ${body}`);
        process.exit(1);
      }
      console.error(`[sweep] attempt ${attempt}: ${res.status} ${body}`);
    } catch (err) {
      console.error(`[sweep] attempt ${attempt}: ${err.message}`);
    }
    if (attempt < ATTEMPTS) await sleep(WAIT_MS);
  }
  console.error(`[sweep] gave up after ${ATTEMPTS} attempts.`);
  process.exit(1);
}

main();
