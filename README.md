# Acceleron Plus

Internal PSA platform for Acceleron Solutions: project management (PMT) and
IT service management (ITSM) over one set of data, so a project created in PMT
opens its ITSM context automatically and the tickets raised in each phase come
back to the project manager's view.

## Getting started

```bash
npm install
cp .env.example .env.local     # then fill in the Postgres and Darwinbox values
node src/lib/migrations/migrate-auth.js
node src/lib/migrations/migrate-project-db.js
node src/lib/migrations/migrate-itsm-db.js
node src/lib/migrations/migrate-planning.js
node src/lib/migrations/migrate-notifications.js
node src/lib/migrations/migrate-otp.js
node src/lib/migrations/migrate-employee-master.js
node src/lib/migrations/migrate-resourcing.js
node src/lib/migrations/migrate-assignments.js
node src/lib/migrations/migrate-margin-and-skills.js
npm run dev
```

Then open http://localhost:3000. Signing in takes an email address and a
six-digit code; in development the code is shown on screen.

Four Postgres databases are used — `identity_db`, `project_db`, `itsm_db` and
`execution_db` — configured through `.env.local`. Nothing is hardcoded; every
script reads `src/lib/db-config.js`.

## Documentation

| File | Covers |
|---|---|
| `AUTH.md` | Sign-in by one-time code, sessions, password mode, admin tasks |
| `PMT-ITSM.md` | The PMT ↔ ITSM loop, editable plans, the fourteen notification events |
| `AGILE-QUALITY.md` | Sprint planning, Requirements, Test Cases, Traceability, and ITSM Kanban |
| `ACCESS-AND-EXPORTS.md` | Who can do what, the editable Gantt, plan exports |
| `RESOURCING-AND-PIPELINE.md` | Staffing with costs and skills, allotting work, and the lead-to-project pipeline |
| `ROLES-AND-MARGIN.md` | Project margin, the skill catalogue, the client portal and the member views |
| `ALLOCATION-REPORT.md` | Who is on what across every project, and how much of each person is left |
| `ALLOCATION-IMPORT.md` | The Microsoft Form that collects allocations, and the importer that brings them in |
| `DEPLOY.md` | Running it in production: pm2, nginx + HTTPS, the daily sweep, backups |

## Stack

Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind v4, Knex
over PostgreSQL. Sessions are HMAC-signed cookies verified in `src/proxy.ts`;
exports are built with `exceljs`, `pdfkit` and `pptxgenjs`.

Note that `src/proxy.ts` is this version's `middleware.ts` — having both files
is a build error.
