import knex from "knex";
import pgTypes from "pg";

// ═══════════════════════════════════════════════════════════════
// A `date` column is a calendar date: no time, no zone. The pg driver
// decodes it into a JS Date at LOCAL midnight, and everything after
// that — JSON serialisation, an export, a browser in another zone —
// is then free to shift it by a day. In IST it consistently lost one:
// 2026-11-22 reached the browser as 2026-11-21, and saving the form
// wrote that back, so a row moved a day earlier every time somebody
// opened the editor.
//
// Handing DATE (oid 1082) back as the untouched "YYYY-MM-DD" string
// removes the whole class of bug: there is no Date to convert, so
// there is nothing to convert wrongly. Timestamps are left alone —
// those really are instants and belong in UTC.
// ═══════════════════════════════════════════════════════════════
const PG_DATE_OID = 1082;
pgTypes.types.setTypeParser(PG_DATE_OID, (value: string) => value);

// ═══════════════════════════════════════════════════════════════
// Database connections.
//
// Credentials come from the environment. Copy .env.example to
// .env.local and fill it in — nothing sensitive belongs in this file.
// ═══════════════════════════════════════════════════════════════

// Global instance to prevent multiple connections in dev (Next.js hot reloading)
const globalForKnex = globalThis as unknown as {
  knexItsm: ReturnType<typeof knex> | undefined;
  knexProject: ReturnType<typeof knex> | undefined;
  knexExecution: ReturnType<typeof knex> | undefined;
  knexIdentity: ReturnType<typeof knex> | undefined;
};

// `next build` imports every route to collect its config, which pulls in this
// module. A build machine legitimately has no database credentials, so the
// check below must not fire during the build phase — only in a running server.
const IS_BUILD_PHASE = process.env.NEXT_PHASE === "phase-production-build";

function readPassword(): string {
  const password = process.env.DATABASE_PASSWORD;
  if (password !== undefined && password !== "") return password;

  if (process.env.NODE_ENV === "production" && !IS_BUILD_PHASE) {
    throw new Error(
      "DATABASE_PASSWORD is not set. Copy .env.example to .env.local (or set it in your deployment environment) before starting the server."
    );
  }

  if (!IS_BUILD_PHASE) {
    console.warn(
      "[db] DATABASE_PASSWORD is not set — falling back to an empty password. Create .env.local from .env.example."
    );
  }
  return "";
}

const commonConfig = {
  client: "pg" as const,
  pool: {
    min: Number(process.env.DATABASE_POOL_MIN ?? 2),
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
  },
  acquireConnectionTimeout: Number(process.env.DATABASE_ACQUIRE_TIMEOUT_MS ?? 30000),
};

const commonConnection = {
  host: process.env.DATABASE_HOST ?? "127.0.0.1",
  port: Number(process.env.DATABASE_PORT ?? 5432),
  user: process.env.DATABASE_USER ?? "postgres",
  password: readPassword(),
  // Managed Postgres (Neon, RDS, Azure) needs TLS; local dev does not.
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
};

export const itsmDb =
  globalForKnex.knexItsm ||
  knex({
    ...commonConfig,
    connection: { ...commonConnection, database: process.env.DATABASE_ITSM_NAME ?? "itsm_db" },
  });

export const projectDb =
  globalForKnex.knexProject ||
  knex({
    ...commonConfig,
    connection: { ...commonConnection, database: process.env.DATABASE_PROJECT_NAME ?? "project_db" },
  });

export const executionDb =
  globalForKnex.knexExecution ||
  knex({
    ...commonConfig,
    connection: { ...commonConnection, database: process.env.DATABASE_EXECUTION_NAME ?? "execution_db" },
  });

export const identityDb =
  globalForKnex.knexIdentity ||
  knex({
    ...commonConfig,
    connection: { ...commonConnection, database: process.env.DATABASE_IDENTITY_NAME ?? "identity_db" },
  });

if (process.env.NODE_ENV !== "production") {
  globalForKnex.knexItsm = itsmDb;
  globalForKnex.knexProject = projectDb;
  globalForKnex.knexExecution = executionDb;
  globalForKnex.knexIdentity = identityDb;
}

// ─── Diagnosing setup problems ─────────────────────────────────────

/**
 * Turn a Postgres error into an actionable message when it is really a
 * "you haven't run the migrations" problem.
 *
 * A missing table surfaced as a bare 500 and left no clue what to do,
 * which cost a debugging cycle. Naming the missing relation gives away
 * nothing useful to an attacker and saves the next person the same hunt.
 */
export function describeSetupError(err: unknown): string | null {
  const error = err as { code?: string; message?: string } | null;
  if (!error?.code) return null;

  switch (error.code) {
    // undefined_table
    case "42P01": {
      const table = /relation "([^"]+)" does not exist/.exec(error.message ?? "")?.[1];
      const migration = table && MIGRATION_FOR[table];
      return migration
        ? `The "${table}" table is missing. Run:  node ${migration}`
        : "A required database table is missing. Run the migrations in src/lib/migrations.";
    }
    // undefined_column
    case "42703": {
      const column = /column "([^"]+)"/.exec(error.message ?? "")?.[1];
      // Postgres reports these as "table.column" or just "column".
      const bare = column?.includes(".") ? column.split(".").pop()! : column;
      const migration = bare && MIGRATION_FOR_COLUMN[bare];
      if (migration) {
        return `The database is out of date (missing column "${column}"). Run:  node ${migration}`;
      }
      return `The database is out of date${column ? ` (missing column "${column}")` : ""}. Run the migrations in src/lib/migrations.`;
    }
    // invalid_password / invalid_authorization_specification
    case "28P01":
    case "28000":
      return "The database rejected our credentials. Check DATABASE_USER and DATABASE_PASSWORD in .env.local.";
    // invalid_catalog_name
    case "3D000":
      return "That database does not exist. Check the DATABASE_*_NAME values in .env.local.";
    default:
      return null;
  }
}

/** Which script creates which table, for the hint above. */
const MIGRATION_FOR: Record<string, string> = {
  login_otp_challenges: "src/lib/migrations/migrate-otp.js",
  user_sessions: "src/lib/migrations/migrate-auth.js",
  login_audit: "src/lib/migrations/migrate-auth.js",
  roles: "src/lib/migrations/migrate-auth.js",
  project_notifications: "src/lib/migrations/migrate-project-db.js",
  wbs_items: "src/lib/migrations/migrate-planning.js",
  sprints: "src/lib/migrations/migrate-sprints.js",
  requirements: "src/lib/migrations/migrate-quality.js",
  test_cases: "src/lib/migrations/migrate-quality.js",
  app_settings: "src/lib/migrations/migrate-settings.js",
  project_contexts: "src/lib/migrations/migrate-itsm-db.js",
  skills: "src/lib/migrations/migrate-resourcing.js",
  employee_skills: "src/lib/migrations/migrate-resourcing.js",
  employee_master: "src/lib/migrations/migrate-employee-master.js",
  employee_rate_bands: "src/lib/migrations/migrate-project-db.js",
  project_team_members: "src/lib/migrations/migrate-project-db.js",
  darwinbox_sync_settings: "src/lib/migrations/migrate-darwinbox-autosync.js",
  darwinbox_sync_runs: "src/lib/migrations/migrate-darwinbox-autosync.js",
  wbs_assignments: "src/lib/migrations/migrate-assignments.js",
};

/**
 * Which script *adds* which column.
 *
 * A table can predate the column a newer feature needs, and by then
 * "run the migrations" means reading eleven scripts to work out which.
 * Named per column, the message is something to act on.
 */
const MIGRATION_FOR_COLUMN: Record<string, string> = {
  // migrate-resourcing
  employee_id: "src/lib/migrations/migrate-resourcing.js",
  daily_cost_inr: "src/lib/migrations/migrate-resourcing.js",
  daily_billable_rate_inr: "src/lib/migrations/migrate-resourcing.js",
  planned_days: "src/lib/migrations/migrate-resourcing.js",
  planned_cost_inr: "src/lib/migrations/migrate-resourcing.js",
  planned_billable_inr: "src/lib/migrations/migrate-resourcing.js",
  // migrate-assignments
  assigned_count: "src/lib/migrations/migrate-assignments.js",
  assigned_hours: "src/lib/migrations/migrate-assignments.js",
  // migrate-planning
  progress_percent: "src/lib/migrations/migrate-planning.js",
  estimated_hours: "src/lib/migrations/migrate-planning.js",
  owner_user_id: "src/lib/migrations/migrate-planning.js",
  // migrate-auth
  failed_login_count: "src/lib/migrations/migrate-auth.js",
  locked_until: "src/lib/migrations/migrate-auth.js",
  sessions_valid_from: "src/lib/migrations/migrate-auth.js",
  password_hash: "src/lib/migrations/migrate-auth.js",
  must_change_password: "src/lib/migrations/migrate-auth.js",
  // migrate-employee-master
  raw_payload: "src/lib/migrations/migrate-employee-master.js",
  group_company_code: "src/lib/migrations/migrate-employee-master.js",
  date_of_exit: "src/lib/migrations/migrate-employee-master.js",
};
