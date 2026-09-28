// ═══════════════════════════════════════════════════════════════
// Shared database config for standalone Node scripts
// (migrations and seeds). Next.js loads .env.local automatically;
// plain `node script.js` does not, so we parse it here.
//
// Usage:
//   const { identityDb, projectDb, itsmDb, closeAll } = require("../db-config");
// ═══════════════════════════════════════════════════════════════

const fs = require("fs");
const path = require("path");
const knex = require("knex");

// ─── Load .env.local / .env without adding a dotenv dependency ────

function loadEnvFile(filename) {
  const filePath = path.join(process.cwd(), filename);
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eq = line.indexOf("=");
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    if (!key || key in process.env) continue; // real env wins

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

// ─── Connection ───────────────────────────────────────────────────

if (!process.env.DATABASE_PASSWORD) {
  console.error(
    "\n  ✖ DATABASE_PASSWORD is not set.\n" +
      "    Copy .env.example to .env.local and fill in your Postgres credentials,\n" +
      "    or export DATABASE_PASSWORD before running this script.\n"
  );
  process.exit(1);
}

const connection = {
  host: process.env.DATABASE_HOST || "127.0.0.1",
  port: Number(process.env.DATABASE_PORT || 5432),
  user: process.env.DATABASE_USER || "postgres",
  password: process.env.DATABASE_PASSWORD,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
};

function connect(database) {
  return knex({ client: "pg", connection: { ...connection, database } });
}

const identityDb = connect(process.env.DATABASE_IDENTITY_NAME || "identity_db");
const projectDb = connect(process.env.DATABASE_PROJECT_NAME || "project_db");
const itsmDb = connect(process.env.DATABASE_ITSM_NAME || "itsm_db");
const executionDb = connect(process.env.DATABASE_EXECUTION_NAME || "execution_db");

async function closeAll() {
  await Promise.allSettled([
    identityDb.destroy(),
    projectDb.destroy(),
    itsmDb.destroy(),
    executionDb.destroy(),
  ]);
}

module.exports = { identityDb, projectDb, itsmDb, executionDb, connect, connection, closeAll };
