#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// Darwinbox auto-sync knock. Run by pm2 every 15 minutes (see
// ecosystem.config.js), or by hand:  node scripts/darwinbox-autosync.js
//
// Calls POST /api/integrations/darwinbox/autosync. The app decides
// whether a sync is due (auto-sync on, schedule reached) — most knocks
// just log "not due" and exit. Uses the shared scheduler token
// NOTIFICATION_SWEEP_TOKEN, read the same way as notification-sweep.js.
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

const url = process.env.AUTOSYNC_URL || "http://127.0.0.1:8099/api/integrations/darwinbox/autosync";
const token = process.env.NOTIFICATION_SWEEP_TOKEN;
const ATTEMPTS = 3;
const WAIT_MS = 10_000; // the app may still be booting when pm2 starts us

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!token) {
    console.error("[autosync] NOTIFICATION_SWEEP_TOKEN is not set — nothing to authenticate with. Skipping.");
    process.exit(1);
  }

  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, { method: "POST", headers: { "x-sweep-token": token } });
      const text = await res.text();
      let body = null;
      try { body = JSON.parse(text); } catch {}

      if (res.status === 401 || res.status === 403) {
        console.error(`[autosync] ${res.status} — token rejected. Check NOTIFICATION_SWEEP_TOKEN. ${text}`);
        process.exit(1);
      }
      if (body && body.ran === false) {
        // The usual case — quiet one-liner.
        const next = body.nextRunAt ? `, next ${body.nextRunAt}` : "";
        console.log(`[autosync] not run (${body.reason}${next})`);
        return;
      }
      if (res.ok) {
        console.log(`[autosync] synced: ${body && body.message ? body.message : text}`);
        return;
      }
      console.error(`[autosync] attempt ${attempt}: ${res.status} ${text}`);
      // A sync that ran and failed is recorded in the app; don't hammer Darwinbox.
      if (body && body.ran === true) process.exit(1);
    } catch (err) {
      console.error(`[autosync] attempt ${attempt}: ${err.message}`);
    }
    if (attempt < ATTEMPTS) await sleep(WAIT_MS);
  }
  console.error(`[autosync] gave up after ${ATTEMPTS} attempts.`);
  process.exit(1);
}

main();
