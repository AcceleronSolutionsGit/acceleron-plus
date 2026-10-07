#!/usr/bin/env node
/**
 * scripts/email-ingest.js
 * ────────────────────────────────────────────────────────────────────
 * Standalone scheduler that polls the ITSM email ingest endpoint
 * every N minutes and converts unseen emails into tickets.
 *
 * Usage:
 *   node scripts/email-ingest.js          # runs every 5 min (default)
 *   node scripts/email-ingest.js --once   # single run then exit
 *
 * Or via pm2 (recommended for production):
 *   pm2 start scripts/email-ingest.js --name email-ingest --cron "*/5 * * * *"
 *
 * Requires .env.local to have:
 *   NOTIFICATION_SWEEP_TOKEN=<token>
 *   NEXT_PUBLIC_APP_URL=http://localhost:3000   (or your prod URL)
 *   IMAP_HOST, IMAP_USER, IMAP_PASS
 */

const path = require("path");
const fs = require("fs");

// Load .env.local manually (Next.js doesn't load it for plain node scripts)
function loadEnv() {
  const envPath = path.resolve(__dirname, "../.env.local");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf-8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (key && !process.env[key]) {
      process.env[key] = val;
    }
  }
}
loadEnv();

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const TOKEN = process.env.NOTIFICATION_SWEEP_TOKEN;
const INTERVAL_MS = parseInt(process.env.IMAP_POLL_INTERVAL_MINUTES || "5", 10) * 60 * 1000;

if (!TOKEN) {
  console.error("[email-ingest] NOTIFICATION_SWEEP_TOKEN is not set — aborting.");
  process.exit(1);
}

async function sweep() {
  const url = `${BASE_URL}/api/itsm/email-ingest/sweep`;
  const now = new Date().toISOString();
  console.log(`[email-ingest] ${now} — sweeping ${url} ...`);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "x-sweep-token": TOKEN,
        "Content-Type": "application/json",
      },
    });

    const data = await res.json().catch(() => ({}));

    if (res.ok && data.ok) {
      const s = data.summary || {};
      console.log(
        `[email-ingest] ✓ processed=${s.processed ?? 0}  created=${s.created ?? 0}  appended=${s.appended ?? 0}  skipped=${s.skipped ?? 0}  errors=${s.errors ?? 0}`
      );
      if (s.created > 0) {
        for (const d of data.details || []) {
          if (d.action === "created") {
            console.log(`  → Ticket ${d.ticketNumber}: ${d.subject}`);
          }
        }
      }
    } else {
      console.error(`[email-ingest] ✗ HTTP ${res.status} — ${data.error || JSON.stringify(data)}`);
    }
  } catch (err) {
    console.error(`[email-ingest] ✗ Network error: ${err.message}`);
  }
}

// Main
const args = process.argv.slice(2);
if (args.includes("--once")) {
  sweep().then(() => process.exit(0));
} else {
  console.log(`[email-ingest] Starting — polling every ${INTERVAL_MS / 60000} minute(s).`);
  console.log(`[email-ingest] Mailbox: ${process.env.IMAP_USER || "(not set)"}@${process.env.IMAP_HOST || "(not set)"}`);
  sweep(); // run immediately on start
  setInterval(sweep, INTERVAL_MS);
}