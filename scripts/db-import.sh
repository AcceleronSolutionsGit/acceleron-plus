#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# db-import.sh — load the dumps from scripts/db-export.ps1 into the
# server's PostgreSQL
#
#   ./scripts/db-import.sh /tmp/acceleron-db            first load
#   ./scripts/db-import.sh /tmp/acceleron-db --replace  wipe and reload
#
# Expects the four databases to exist already and be owned by the login
# in .env.local (DEPLOY.md step 1). Restores into them as that login, so
# every table ends up owned by it — the laptop's `postgres` user never
# comes across. Refuses to load over a database that already has tables
# unless --replace is given. Unpacks uploads.tgz into the app folder if
# the export included it.
#
# Afterwards run ./scripts/deploy.sh --migrate: the migrations are
# idempotent and bring the schema up to this build (including the
# Developer / Team Lead / PM role migration).
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DUMP_DIR="${1:-}"
REPLACE=false
for arg in "${@:2}"; do
  case "$arg" in
    --replace) REPLACE=true ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

die() { echo "  ✖ $*" >&2; exit 1; }

[[ -n "$DUMP_DIR" && -d "$DUMP_DIR" ]] || die "Usage: $0 <folder with the .dump files> [--replace]"
command -v pg_restore >/dev/null || die "pg_restore not found — sudo apt install -y postgresql-client"
command -v psql >/dev/null || die "psql not found — sudo apt install -y postgresql-client"

# ── Connection settings from .env.local ────────────────────────────
ENV_FILE="$APP_DIR/.env.local"
[[ -f "$ENV_FILE" ]] || die ".env.local not found in $APP_DIR (DEPLOY.md step 3)"
env_value() {
  # First occurrence wins, the same as the app's own .env loader.
  grep -E "^$1=" "$ENV_FILE" | head -n1 | cut -d= -f2- | tr -d '\r' | sed -e 's/^["'"'"']//' -e 's/["'"'"']$//' || true
}
export PGHOST="$(env_value DATABASE_HOST)";  PGHOST="${PGHOST:-127.0.0.1}"
export PGPORT="$(env_value DATABASE_PORT)";  PGPORT="${PGPORT:-5432}"
export PGUSER="$(env_value DATABASE_USER)";  PGUSER="${PGUSER:-postgres}"
export PGPASSWORD="$(env_value DATABASE_PASSWORD)"
[[ -n "$PGPASSWORD" ]] || die "DATABASE_PASSWORD is not set in .env.local"

ident="$(env_value DATABASE_IDENTITY_NAME)"
proj="$(env_value DATABASE_PROJECT_NAME)"
itsm="$(env_value DATABASE_ITSM_NAME)"
exec_db="$(env_value DATABASE_EXECUTION_NAME)"
DATABASES=("${ident:-identity_db}" "${proj:-project_db}" "${itsm:-itsm_db}" "${exec_db:-execution_db}")

RESTORE_MAJOR="$(pg_restore --version | grep -oE '[0-9]+' | head -n1)"

echo ""
echo "  Loading into $PGUSER@$PGHOST:$PGPORT with pg_restore $RESTORE_MAJOR"
echo ""

# ── Check everything before touching anything ──────────────────────
for db in "${DATABASES[@]}"; do
  file="$DUMP_DIR/$db.dump"
  [[ -f "$file" ]] || die "$file is missing"

  dumped="$(pg_restore -l "$file" | sed -n 's/.*Dumped by pg_dump version: \([0-9]*\).*/\1/p' | head -n1)"
  [[ -n "$dumped" ]] || die "$file is not a pg_dump custom-format file (export with scripts/db-export.ps1)"
  if (( dumped > RESTORE_MAJOR )); then
    die "$db was dumped with pg_dump $dumped but this server has pg_restore $RESTORE_MAJOR. Install the PostgreSQL $dumped client (apt.postgresql.org) or use a PostgreSQL $dumped+ server."
  fi

  psql -d "$db" -Atqc "select 1" >/dev/null 2>&1 \
    || die "Cannot connect to $db as $PGUSER. Create it first: sudo -u postgres psql -c \"CREATE DATABASE $db OWNER $PGUSER;\""

  tables="$(psql -d "$db" -Atqc "select count(*) from pg_tables where schemaname = 'public'")"
  if (( tables > 0 )) && [[ "$REPLACE" != true ]]; then
    die "$db already has $tables tables. Re-run with --replace to wipe and reload it."
  fi

  # Extensions need a superuser to create; say which, rather than fail halfway.
  while read -r ext; do
    [[ -z "$ext" ]] && continue
    have="$(psql -d "$db" -Atqc "select 1 from pg_extension where extname = '$ext'")"
    [[ "$have" == 1 ]] || die "$db uses the $ext extension. Create it once: sudo -u postgres psql -d $db -c 'CREATE EXTENSION IF NOT EXISTS \"$ext\";'"
  done < <(pg_restore -l "$file" | sed -n 's/.* EXTENSION - \([^ ]*\).*/\1/p' | sort -u)
done

# ── Load ───────────────────────────────────────────────────────────
for db in "${DATABASES[@]}"; do
  file="$DUMP_DIR/$db.dump"

  if [[ "$REPLACE" == true ]]; then
    # Everything in these databases belongs to the app login, so this
    # removes exactly the app's tables and nothing else.
    psql -d "$db" -qv ON_ERROR_STOP=1 -c "DROP OWNED BY CURRENT_USER CASCADE;" >/dev/null
  fi

  # Leave out what a non-superuser may not (re)create: the public schema
  # itself, its comment, and extensions (checked above).
  list="$(mktemp)"
  pg_restore -l "$file" | grep -vE ' SCHEMA - public | COMMENT - SCHEMA public | EXTENSION - | COMMENT - EXTENSION ' > "$list"

  pg_restore -d "$db" -L "$list" --no-owner --no-privileges --exit-on-error --single-transaction "$file"
  rm -f "$list"

  psql -d "$db" -qc "SET client_min_messages = error; ANALYZE;" >/dev/null
  count="$(psql -d "$db" -Atqc "select count(*) from pg_tables where schemaname = 'public'")"
  printf "  ✓ %-14s %s tables\n" "$db" "$count"
done

# ── Project documents ──────────────────────────────────────────────
if [[ -f "$DUMP_DIR/uploads.tgz" ]]; then
  tar -xzf "$DUMP_DIR/uploads.tgz" -C "$APP_DIR"
  echo "  ✓ uploads        unpacked into $APP_DIR/uploads"
fi

unset PGPASSWORD
echo ""
echo "  Done. Now bring the schema up to this build:"
echo "    ./scripts/deploy.sh --migrate"
echo ""
