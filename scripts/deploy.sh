#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# Build and (re)start Acceleron Plus under pm2. Run on the server,
# from anywhere:
#
#   ./scripts/deploy.sh             pull, install, build, reload
#   ./scripts/deploy.sh --migrate   ...and run the DB migrations first
#   ./scripts/deploy.sh --no-pull   skip `git pull` (code copied by rsync/scp)
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

cd "$(dirname "$0")/.."
APP_DIR="$(pwd)"

MIGRATE=false
PULL=true
for arg in "$@"; do
  case "$arg" in
    --migrate) MIGRATE=true ;;
    --no-pull) PULL=false ;;
    *) echo "Unknown option: $arg"; exit 2 ;;
  esac
done

step() { printf '\n\033[1;34m▸ %s\033[0m\n' "$*"; }

# ── Preconditions ────────────────────────────────────────────────
if [ ! -f .env.local ]; then
  echo "✖ $APP_DIR/.env.local is missing. Copy .env.example and fill in the production values (DEPLOY.md, step 3)."
  exit 1
fi
command -v pm2 >/dev/null || { echo "✖ pm2 is not installed:  sudo npm install -g pm2"; exit 1; }

# NEXT_PUBLIC_APP_URL is baked into the browser bundle at build time,
# so a wrong value here means rebuilding — catch it before the build.
if ! grep -Eq '^NEXT_PUBLIC_APP_URL=https://' .env.local; then
  echo "⚠ NEXT_PUBLIC_APP_URL in .env.local is not an https:// URL. Email links will point at the wrong place."
fi

# ── Code ─────────────────────────────────────────────────────────
if $PULL && [ -d .git ]; then
  step "git pull"
  git pull --ff-only
fi

# ── Dependencies ─────────────────────────────────────────────────
# --include=dev: the build needs TypeScript and Tailwind, and npm skips
# devDependencies whenever NODE_ENV=production is exported in the shell.
step "npm ci"
npm ci --include=dev --no-audit --no-fund

# ── Database ─────────────────────────────────────────────────────
if $MIGRATE; then
  step "Migrations"
  MIGRATIONS=(
    migrate-auth
    migrate-project-db
    migrate-itsm-db
    migrate-planning
    migrate-notifications
    migrate-otp
    migrate-employee-master
    migrate-resourcing
    migrate-assignments
    migrate-margin-and-skills
    migrate-documents
    migrate-internal-department
    migrate_governance_invoices_comments
    migrate-scrap
    migrate-phase-sync
    migrate-phase1
    migrate-team-roles
  )
  for m in "${MIGRATIONS[@]}"; do
    echo "  → $m"
    node "src/lib/migrations/$m.js"
  done
fi

# ── Build ────────────────────────────────────────────────────────
mkdir -p logs uploads/project-documents
step "next build"
npm run build

# ── Run ──────────────────────────────────────────────────────────
step "pm2"
if pm2 describe acceleron-plus >/dev/null 2>&1; then
  pm2 reload ecosystem.config.js --update-env
else
  pm2 start ecosystem.config.js
fi
pm2 save

# ── Smoke test ───────────────────────────────────────────────────
step "Health check"
for i in $(seq 1 15); do
  code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/login || true)
  if [ "$code" = "200" ]; then
    echo "✔ Acceleron Plus is answering on 127.0.0.1:3000"
    exit 0
  fi
  sleep 2
done
echo "✖ No 200 from /login after 30s — check:  pm2 logs acceleron-plus --lines 100"
exit 1
