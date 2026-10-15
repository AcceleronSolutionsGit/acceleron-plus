#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# db-import.sh — load the dumps from scripts/db-export.ps1 into the
# server's PostgreSQL
#
#   ./scripts/db-import.sh /tmp/acceleron-db            first load
#   ./scripts/db-import.sh /tmp/acceleron-db --replace  wipe and reload
#
# Takes <db>.sql (plain SQL — the export default, loads into the same
# or an OLDER PostgreSQL) or <db>.dump (archive — same or newer only).
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
command -v pg_restore >/dev/null || die "pg_restore not found — install the PostgreSQL client (SUSE: zypper install postgresql; Ubuntu: apt install postgresql-client)"
command -v psql >/dev/null || die "psql not found — install the PostgreSQL client (SUSE: zypper install postgresql; Ubuntu: apt install postgresql-client)"

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
echo "  Loading into $PGUSER@$PGHOST:$PGPORT (PostgreSQL client $RESTORE_MAJOR)"
echo ""

# Plain SQL (<db>.sql, the export's default) or pg_dump's archive
# (<db>.dump). SQL loads into the same PostgreSQL version or an older one;
# the archive only into the same version or a newer one.
dump_file() {
  if [[ -f "$DUMP_DIR/$1.sql" ]]; then echo "$DUMP_DIR/$1.sql"
  elif [[ -f "$DUMP_DIR/$1.dump" ]]; then echo "$DUMP_DIR/$1.dump"
  fi
}

# The lines of a plain dump a non-superuser — or an older psql — cannot
# run: pg_dump 17's transaction_timeout (unknown to 16), the \restrict
# guard newer pg_dump releases add (unknown to older psql), extensions
# (checked separately) and the public schema itself. Windows line endings
# are dropped first; COPY data escapes real carriage returns as \r.
clean_sql() {
  sed 's/\r$//' "$1" | grep -vE '^(\\restrict |\\unrestrict |SET transaction_timeout|CREATE EXTENSION |COMMENT ON EXTENSION |CREATE SCHEMA public;|COMMENT ON SCHEMA public |ALTER SCHEMA public OWNER )'
}

extensions_in() {
  if [[ "$1" == *.sql ]]; then
    sed -n 's/^CREATE EXTENSION IF NOT EXISTS \([^ ;]*\).*/\1/p' "$1" | tr -d '"' | sort -u
  else
    pg_restore -l "$1" | sed -n 's/.* EXTENSION - \([^ ]*\).*/\1/p' | sort -u
  fi
}

# ── Check everything before touching anything ──────────────────────
for db in "${DATABASES[@]}"; do
  file="$(dump_file "$db")"
  [[ -n "$file" ]] || die "Neither $DUMP_DIR/$db.sql nor $DUMP_DIR/$db.dump is there"

  if [[ "$file" == *.sql ]]; then
    grep -q "PostgreSQL database dump" "$file" || die "$file does not look like a pg_dump SQL file"
    dumped="$(sed -n 's/.*Dumped by pg_dump version \([0-9.]*\).*/\1/p' "$file" | head -n1)"
    echo "  · $db: SQL from pg_dump ${dumped:-?}"
  else
    # A dump from a newer PostgreSQL cannot even be listed by an older
    # pg_restore ("unsupported version (1.16) in file header"), so read
    # the table of contents without letting set -e end the script first.
    if ! toc="$(pg_restore -l "$file" 2>&1)"; then
      if grep -q "unsupported version" <<<"$toc"; then
        die "$db.dump comes from a newer PostgreSQL than this server's pg_restore $RESTORE_MAJOR can read. Export again in SQL format (the default: scripts\\db-export.ps1 with no -Format) and copy the .sql files instead."
      fi
      die "$file could not be read: $toc"
    fi
    dumped="$(sed -n 's/.*Dumped by pg_dump version: \([0-9]*\).*/\1/p' <<<"$toc" | head -n1)"
    [[ -n "$dumped" ]] || die "$file is not a pg_dump archive (export with scripts/db-export.ps1)"
    if (( dumped > RESTORE_MAJOR )); then
      die "$db.dump was made by pg_dump $dumped; this server has pg_restore $RESTORE_MAJOR. Export again in SQL format (the default) and copy the .sql files instead."
    fi
  fi

  # Show PostgreSQL's own reason — "does not exist", "password
  # authentication failed" and "Ident/peer authentication failed" each
  # need a different fix (DEPLOY.md → Moving the data).
  if ! conn_err="$(psql -d "$db" -Atqc "select 1" 2>&1 >/dev/null)"; then
    echo "  ✖ Cannot connect to $db as $PGUSER@$PGHOST:" >&2
    echo "      ${conn_err//$'\n'/$'\n'      }" >&2
    if grep -q "does not exist" <<<"$conn_err"; then
      echo "    → create it: su - postgres -c \"psql -c 'CREATE DATABASE $db OWNER $PGUSER;'\"" >&2
    elif grep -qiE "ident|peer|pg_hba|no password supplied" <<<"$conn_err"; then
      echo "    → PostgreSQL does not accept a password login for $PGUSER from $PGHOST yet: add a scram-sha-256 line for it to pg_hba.conf and reload" >&2
    elif grep -qi "password authentication failed" <<<"$conn_err"; then
      echo "    → the password in .env.local does not match the one set in PostgreSQL for $PGUSER" >&2
    fi
    exit 1
  fi

  tables="$(psql -d "$db" -Atqc "select count(*) from pg_tables where schemaname = 'public'")"
  if (( tables > 0 )) && [[ "$REPLACE" != true ]]; then
    die "$db already has $tables tables. Re-run with --replace to wipe and reload it."
  fi

  # Extensions need a superuser to create; say which, rather than fail halfway.
  while read -r ext; do
    [[ -z "$ext" ]] && continue
    have="$(psql -d "$db" -Atqc "select 1 from pg_extension where extname = '$ext'")"
    [[ "$have" == 1 ]] || die "$db uses the $ext extension. Create it once: su - postgres -c \"psql -d $db -c 'CREATE EXTENSION IF NOT EXISTS $ext;'\""
  done < <(extensions_in "$file")
done
echo ""

# ── Load ───────────────────────────────────────────────────────────
for db in "${DATABASES[@]}"; do
  file="$(dump_file "$db")"

  if [[ "$REPLACE" == true ]]; then
    # Everything in these databases belongs to the app login, so this
    # removes exactly the app's tables and nothing else.
    psql -d "$db" -qv ON_ERROR_STOP=1 -c "DROP OWNED BY CURRENT_USER CASCADE;" >/dev/null
  fi

  if [[ "$file" == *.sql ]]; then
    # One transaction, stop at the first error: all of it or none of it.
    clean_sql "$file" | psql -d "$db" -q -X -v ON_ERROR_STOP=1 --single-transaction -f - >/dev/null
  else
    # Leave out what a non-superuser may not (re)create: the public schema
    # itself, its comment, and extensions (checked above).
    list="$(mktemp)"
    pg_restore -l "$file" | grep -vE ' SCHEMA - public | COMMENT - SCHEMA public | EXTENSION - | COMMENT - EXTENSION ' > "$list"
    pg_restore -d "$db" -L "$list" --no-owner --no-privileges --exit-on-error --single-transaction "$file"
    rm -f "$list"
  fi

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
