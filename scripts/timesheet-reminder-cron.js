#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// Calls POST /api/cron/timesheet-reminders once and exits.
// Scheduled by pm2 daily at 5:30 PM (17:30 IST):
//   cron_restart: "30 17 * * *" (see ecosystem.config.js)
// Or run manually:
//   node scripts/timesheet-reminder-cron.js
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

const url =
  process.env.REMINDER_URL ||
  `http://127.0.0.1:${process.env.APP_PORT || "8099"}${process.env.NEXT_PUBLIC_BASE_PATH || ""}/api/cron/timesheet-reminders`;

const token = process.env.CRON_SECRET || process.env.NOTIFICATION_SWEEP_TOKEN || "";
const ATTEMPTS = 6;
const WAIT_MS = 10_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(`[timesheet-reminder] Invoking reminder endpoint at: ${url}`);

  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const headers = {};
      if (token) {
        headers["authorization"] = `Bearer ${token}`;
        headers["x-sweep-token"] = token;
      }

      const res = await fetch(url, {
        method: "POST",
        headers,
      });

      const body = await res.text();
      if (res.ok) {
        console.log(`[timesheet-reminder] Success (${res.status}): ${body}`);
        return;
      }

      if (res.status === 401 || res.status === 403) {
        console.error(
          `[timesheet-reminder] ${res.status} — token rejected. Check CRON_SECRET or NOTIFICATION_SWEEP_TOKEN. ${body}`
        );
        process.exit(1);
      }

      console.error(`[timesheet-reminder] Attempt ${attempt}: ${res.status} ${body}`);
    } catch (err) {
      console.error(`[timesheet-reminder] Attempt ${attempt}: ${err.message}`);
    }

    if (attempt < ATTEMPTS) await sleep(WAIT_MS);
  }

  console.error(`[timesheet-reminder] Gave up after ${ATTEMPTS} attempts.`);
  process.exit(1);
}

main();

