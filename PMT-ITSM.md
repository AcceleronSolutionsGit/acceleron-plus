# PMT ↔ ITSM — plans, charts and notifications

How a project flows from creation through planning into the service desk, and
what tells the project manager about it.

---

## Setup

Two migrations, both idempotent:

```bash
node src/lib/migrations/migrate-planning.js       # real dates on WBS & milestones
node src/lib/migrations/migrate-notifications.js  # event columns & indexes
```

Then restart. Nothing else is required — email activates on its own once
`SMTP_*` is filled in, and stays silent until then.

---

## The loop

**Creating a project** (`POST /api/pmt/projects`) writes the project, opens a
matching `itsm_db.project_contexts` row, and writes the context id back onto the
project. Any ticket raised against that project code from then on is joined back
to the project and appears on its **Linked ITSM Tickets** tab, tagged with the
phase it was raised in.

**Changing the phase** (`PATCH /api/pmt/projects/<id>` with `currentPhase`)
updates the ITSM context, so linked tickets immediately report the new phase.
If the context is missing it is recreated rather than failing.

**The project manager sees everything** on one page: Gantt, WBS, linked tickets,
milestones, invoices, stage-gates, timesheets, financials, risks and documents.

---

## What can now be edited

Previously these could only be created — there were no PATCH or DELETE routes at
all. Each resource now has a full set:

| Resource | Collection | Item |
|---|---|---|
| WBS | `GET POST /api/pmt/projects/<id>/wbs` | `GET PATCH DELETE .../wbs/<itemId>` |
| Milestones | `GET POST .../milestones` | `PATCH DELETE .../milestones/<milestoneId>` |
| Risks | `GET POST .../risks` | `PATCH DELETE .../risks/<riskId>` |
| Stage-gates | `GET POST .../governance` | `PATCH DELETE .../governance/<reviewId>` |

`<id>` accepts a project UUID **or** a code like `PRJ-0001`. This matters: the
old POST handlers wrote the raw URL segment into `project_id`, so every item
created from a code-based URL was an orphan row pointing at nothing.

They also spread the whole request body into the insert, which let a caller set
`id`, `tenant_id` or `project_id` directly. Every field is now declared in
`src/lib/pmt-fields.ts` and anything undeclared is dropped.

**Permissions.** Any signed-in user can read and create. Deleting a work
package, milestone or risk needs PM or admin; recording or amending a stage-gate
needs PM or admin; deleting a stage-gate needs admin, because it is an audit
record. The UI hides what you cannot do, and the API refuses it regardless.

Those rules now live in one table — `src/lib/permissions.ts` — read by both the
API guards and the pages, and narrowed per project by
`project_team_members.role_in_project`. **ACCESS-AND-EXPORTS.md** has the full
matrix.

**Guard rails.** Re-parenting a work package under its own descendant is
refused. Deleting one with children, or with timesheets logged against it, is
refused with an explanation rather than orphaning the rows. Completing a work
package sets progress to 100; completing a milestone stamps `completed_at`, and
reopening it clears the stamp.

---

## The Gantt chart is real now

It used to invent its timeline: each work package was placed seven days after
the previous one, progress was hardcoded at 75% for parents and 60% for
children, and every bar read "active".

`wbs_items` now carries `start_date`, `end_date`, `status`, `progress_percent`,
`estimated_hours` and `owner_user_id`. The chart reads those, and lists the
packages nobody has scheduled rather than inventing dates for them.

It is also editable: drag a bar to reschedule it, drag either end to change one
date, drag the handle inside it to set progress, or drag across the empty row
to draw a new work package. See **ACCESS-AND-EXPORTS.md**, which also covers
exporting the plan to Excel, PDF, PowerPoint and CSV.

Two arithmetic bugs went with it. **Total Est. Work** summed only
`type === "task"`, but a top-level item is typed `"phase"` — so a flat plan
always totalled zero days. It now sums leaf packages (a parent's bar spans its
children, so counting both double-counts). **Overall Progress** was a flat mean
across everything including milestones; it is now weighted by duration, so a
40-day package at 50% moves the number more than a 2-day one at 100%.

---

## Notifications

`src/lib/notifications.ts` is the single entry point. Recipients are resolved
from the project — PM, sponsor, team members — instead of the hardcoded
`10000000-…-0001` the old manual endpoint used. Whoever performed the action is
excluded, so you are never told about your own edit.

| Event | Severity | Goes to |
|---|---|---|
| `project_kickoff` | info | PM, sponsor |
| `phase_changed` | info | PM, sponsor, team |
| `project_status_changed` / `project_closed` | info / warning | PM, sponsor |
| `milestone_created` | info | PM, team |
| `milestone_completed` | info | PM, sponsor |
| `milestone_overdue` | warning | PM, sponsor |
| `wbs_status_changed` / `deliverable_ready` | info | PM, team |
| `risk_raised` | warning, or critical at high/high | PM (+ sponsor if critical) |
| `risk_escalated` | critical | PM, sponsor |
| `stage_gate_recorded` | info | PM, sponsor |
| `stage_gate_failed` | critical | PM, sponsor |
| `ticket_linked` | info | PM |
| `ticket_escalated` | warning | PM |
| `sla_breach` | critical | PM, sponsor |

One event produces one row per recipient. Events that could repeat carry a
dedupe key — an SLA breach alerts once per ticket, an overdue milestone once per
day — enforced by a partial unique index, not just application logic.

Only real transitions fire. Setting the phase to its current value, or raising
an already-high ticket, produces nothing.

**Notifying never breaks the action that caused it.** Every path swallows its
own errors, so a bad SMTP host cannot fail a milestone update.

### Email

`src/lib/mailer.ts` sends through nodemailer using the `SMTP_*` variables. With
none set it is a no-op and everything still works in-app. Messages are plain
text plus a simple HTML version, colour-coded by severity, with a deep link back
into the app via `NEXT_PUBLIC_APP_URL`.

### The bell

A bell in the top bar polls `/api/notifications` every 60 seconds, shows the
unread count, marks items read on click, and deep-links to the item. Reads and
writes are scoped to your own rows — one user cannot clear another's.

### Overdue milestones need a scheduler

Every other event has a request to hang off. "Overdue" is time passing, so
something has to ask. Set `NOTIFICATION_SWEEP_TOKEN` in `.env.local` and call it
once a morning:

```bash
curl -X POST http://localhost:3000/api/notifications/sweep \
     -H "x-sweep-token: <your token>"
```

On Windows, Task Scheduler running that line daily is enough. Without the token
the endpoint still works for a signed-in admin or PM. It is safe to call
repeatedly — the daily dedupe key means no duplicates.

---

## Also fixed along the way

- **`/itsm/tickets` links were 404s.** The project page linked to
  `/itsm/tickets` and `/itsm/tickets/<number>`; the real routes are `/itsm` and
  `/itsm/<number>`. Every linked-ticket link was dead.
- **`userRole` was never passed.** `ProjectDetailClient` has taken a `userRole`
  prop all along, but the server page never supplied it, so it defaulted to
  `"member"` — meaning the Timesheets, Financials and Documents tabs saw
  "member" for everyone, including admins. It now receives the real session role.
- **`next build` failed without `.env.local`.** The credential check added with
  the auth work threw during the build, when Next imports every route to collect
  its config. It now skips the build phase and still fails fast in a running
  server.
- **Malformed JSON returned 500** on several routes; now 400.

---

## Verified

Against a live Postgres: all three migrations run clean and are idempotent;
project creation opens the ITSM context and notifies; create/edit/delete works
for all four resources by both UUID and project code; mass-assignment of `id`,
`project_id` and `tenant_id` is ignored; invalid enums, out-of-range progress,
inverted date ranges and missing names are each rejected with a specific
message; every one of the fourteen events fires with the right severity and
recipients; repeat events dedupe; a ticket raised against the project appears on
the PMT page. The UI was driven in a real browser — bell opens, WBS and
milestone editors show their controls to an admin, the overdue milestone is
flagged, and the Gantt totals (69 days, 48% weighted) match the database.

Not verified here: actual SMTP delivery, which needs your mail server.
