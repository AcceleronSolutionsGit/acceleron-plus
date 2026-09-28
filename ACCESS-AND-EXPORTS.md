# Access, the editable Gantt, and exports

Three things arrived together, because they lean on each other: a permission
model with a single source of truth, a Gantt chart you draw on directly, and
plan exports that respect who is asking.

---

## Setup

```bash
npm install                       # exceljs, pdfkit, @types/pdfkit are new
rm src/app/\(app\)/pmt/\[id\]/GanttTab.tsx     # replaced by GanttEditor.tsx
node src/lib/seeds/grant-role.js --email sabarnik.lahiri@acceleronsolutions.io --role admin
```

`grant-role.js` creates the user from `employee_master` if there is no row in
`identity_db.users` yet, sets the role, and stamps `sessions_valid_from` so any
session they already hold is re-evaluated on the next request.

```bash
node src/lib/seeds/grant-role.js --list             # who holds what
node src/lib/seeds/grant-role.js --email x --role pm
```

If a newly added route 404s in dev, delete `.next`. Running more than one dev
server against the same directory leaves a stale route manifest behind, and
nested dynamic routes (`[id]/wbs/[itemId]`) are the first to disappear.

---

## Who can do what

`src/lib/permissions.ts` holds the whole model. It is imported by the API
guards **and** by the pages, so a button that appears and a request that
succeeds can never disagree — there is only one table.

Access is two layers, and a capability has to survive both:

1. **The global role** on `identity_db.users` sets the ceiling — `admin`, `pm`,
   `member`, `client`.
2. **`project_team_members.role_in_project`** narrows it for one project. The
   free text there ("Tech Lead", "QA", "Developer") is mapped onto `manager`,
   `lead`, `contributor`, `viewer`, `client`; anything unrecognised becomes
   `contributor`, which is the safe middle.

Layer 2 only ever takes away. A member cannot be promoted by a project role,
and a PM who is a `viewer` on someone else's project reads it without editing
it. Admins bypass layer 2 entirely; so does the named PM or sponsor on the
project row, because their global role already reflects the job.

| | admin | pm | member | client |
|---|---|---|---|---|
| See the project and plan | ✓ | ✓ | ✓ | ✓ |
| Create a project | ✓ | ✓ | | |
| Reschedule, draw, delete work | ✓ | ✓ | | |
| Move a progress bar | ✓ | ✓ | ✓ | |
| Raise a risk | ✓ | ✓ | ✓ | |
| Record a stage gate | ✓ | ✓ | | |
| Delete a stage gate | ✓ | | | |
| Budget, cost summary, invoices | ✓ | named PM only | | |
| Approve timesheets | ✓ | ✓ | | |
| See others' timesheets | ✓ | ✓ | | |
| Employee master and roles | ✓ | | | |
| Export the plan | ✓ | ✓ | ✓ | ✓ |
| Export with money in it | ✓ | named PM only | | |

A client can download the plan. They can already read it on screen, so refusing
the file was inconsistent rather than protective — what actually matters is
that `export.financials` is missing, so the budget, invoiced totals and the
whole rate-band column are absent from their copy.

### Using it in a route

```ts
const guard = await requireProjectCapability(id, "plan.create");
if (!guard.ok) return guard.response;
const { project, session, access } = guard;
```

One call does three jobs that used to be three (and, on several routes, none):
checks there is a session, resolves `/pmt/<uuid>` **or** `/pmt/PRJ-0001` to a
real project, and checks the capability against *that* project. Resolution
happens after the session check, so an anonymous caller cannot use the 404/200
difference to enumerate project codes.

When the required capability depends on the request body, resolve with the read
capability and decide afterwards:

```ts
const guard = await requireProjectCapability(id, "plan.view");
...
const required = touched.every((f) => f === "progress_percent")
  ? "plan.updateProgress"
  : "plan.edit";
if (!can(access, required)) return capabilityDenied(access, required);
```

That is what lets a contributor move their own progress bar on a work package
whose dates they are not allowed to touch.

`requireCapabilityGlobally(capability)` is the same check for routes that are
not about one project (creating a project, approving a timesheet).

### What this closed

The guards were uneven before. `plan.*` was enforced nowhere on write, so any
signed-in user — including a client — could reschedule the plan, create work
packages, and post comments through the API even though the UI gave them no
way to. `invoices`, `wbs-comments`, `notifications` and `billing` had no auth
at all: invoice amounts were readable by anyone with a session. Deletes were
gated on `role === "pm"` string comparisons scattered across eight files.

Two of those routes also took a record id from the request body and updated it
without scoping the query to the project in the URL, so an id belonging to a
different project would have been updated happily. Both are now scoped, and
answer 404 when the record belongs somewhere else.

### The admin screen

`/admin/roles` — "People & Roles" in the sidebar, admin only, both in the
navigation and in `proxy.ts`. It lists everyone with their employee-master
designation, department, location and grade where a Darwinbox row matches,
filters by role with live counts, searches, and changes a role from a dropdown.

Granting admin asks for confirmation. Removing the last active admin is
refused, as is deactivating yourself. "What can each role do?" opens the matrix
above, rendered from the same `permissions.ts` table, so the screen cannot
drift from the rules.

---

## Project finances: admin and the project's own PM

Money on a project — budget, cost summary, margin, invoices, team rates and
planned cost, and the money columns in an export — is visible to exactly two
kinds of people: **admins**, and **the project manager named on the project**
(`projects.project_manager_user_id`). Nobody else, whatever their role:

| | Sees the project's money |
|---|---|
| Admin | ✓ every project |
| Named PM of this project | ✓ this project (even if their global role is member) |
| Global `pm` on someone else's project | ✗ |
| "PM" on the Team tab but not the named PM | ✗ |
| Sponsor | ✗ |
| Member, client | ✗ |

This is not a layer question, so `can()` decides it before the two layers: the
five capabilities in `FINANCIAL_CAPABILITIES` (`financials.view`,
`invoice.view`, `invoice.manage`, `team.viewCost`, `export.financials`) pass
only for an admin or `isProjectManager` whenever the context was resolved for
one project (`projectScoped`). Every guard that already asked for those
capabilities — cost-summary, margin, invoices, billing, team cost, export —
picks the rule up without changes. Questions asked without a project (the
pre-sales pipeline) still fall to the global role.

What changed around it:

- **The page never receives the money.** `page.tsx` strips `budgetInr` and the
  margin fields (`redactProjectFinancials`) before the project is serialised,
  and the Budget tile, the Invoices and Financials tabs and the budget field in
  Edit Project are not rendered at all.
- **The APIs remove keys rather than zero them.** `GET /api/pmt/projects` and
  `GET/PATCH /api/pmt/projects/[id]` redact per project; team add/edit
  responses drop the rate and planned-cost columns (`withoutTeamCost`); a
  logged timesheet only echoes its internal cost to the PM or an admin; the
  portfolio dashboard totals only the projects you manage (all of them for an
  admin).
- **Naming the PM is protected**, because it is what unlocks the money. Only an
  admin, or the current PM handing over, can change `projectManagerUserId`;
  changing the budget needs `financials.view`. Both are refused with a 403 and
  a reason, not silently ignored.
- **The pipeline is not a side door.** A converted lead's fee *is* the
  project's budget, so for converted leads the lead's opportunity value and the
  solutioning estimate follow the project rule (`src/lib/lead-finance.ts`).
  Members and clients see no pipeline money at all.

## Lifecycle banner, steps 1 and 2

"Lead & Pipeline" and "Solutioning & Effort" used to be hardcoded as completed
on every project. `src/lib/lifecycle.ts` now reads them:

| Project has | Step 1 | Step 2 |
|---|---|---|
| A lead marked won | ✓ `ACC-LEAD-0001 · Won · Zoho <ref>` | ✓ if an estimate is finalized (effort-days shown), in progress if only drafts, pending if none |
| A lead not yet won | in progress, with the lead's stage | as above |
| A lead marked lost | flagged, grey | as above |
| No lead, a Zoho sales order | ✓ `Zoho sales order · <ref>` | skipped — not estimated in Acceleron |
| Neither | pending — no lead or sales order linked | pending |

Hovering a step explains it, and for admins/PMs the title links to the lead.
No money appears in the banner — the fee is the budget — so it is safe to show
everyone. Steps 3–6 are unchanged.

---

## Drawing and editing the Gantt

`GanttEditor.tsx` replaces the read-only `GanttTab.tsx`. What you can do with
the mouse:

- **Move a bar** — drag it. Both dates shift, the duration is kept.
- **Change one date** — drag either end. The 8px strips at each edge resize.
- **Set progress** — drag the round handle inside the bar. Dates do not move.
- **Draw a new work package** — drag across the dashed **New work package** row
  at the bottom, then name it in the dialog that opens.

Each row belongs to its own work package, and only the dashed row at the bottom
creates anything. Dragging the empty space beside an existing bar used to draw a
brand-new package on top of an existing one — pick an item, get a duplicate —
which is never what anyone means. It now does nothing at all.

Zoom is day / week / month, and on first load the chart picks the level that
fits the whole plan and scrolls to where the work actually is. That last part
matters more than it sounds: the timeline starts two weeks before the earliest
date anywhere in the plan, so a single stray early date used to push every bar
off the right of the viewport and the chart opened looking empty. A **Today**
button scrolls back whenever you have wandered.

Milestones sit on their own strip as diamonds, coloured by status and red when
overdue. A dashed line marks today.

**Colour by** switches what the bars mean:

| Mode | Colours show |
|---|---|
| Status | Not started, in progress, blocked, completed — what the row says |
| Health | Derived from the dates and the percentage: finished, past its end date, behind the curve (more than 15 points under where the elapsed time says it should be), ends within a week, on track |
| Phase | One hue per top-level branch, inherited by its children, so a long plan reads as blocks of work |

Health is worth the extra click, because it answers a question status cannot: a
package can be "in progress" and three weeks late. Nothing is stored — it is
computed from the same dates the chart draws, so it cannot go stale. The legend
lists only the colours actually on screen, and each row carries a matching chip
beside its name so the label column and the bars agree.

**A work package with no dates** gets a row saying "drag across this row to give
it dates", and doing so schedules *that* package rather than creating a new one.
The hint line counts how many are still unscheduled, so a plan nobody has dated
explains itself instead of drawing a blank chart.

Every change saves immediately and optimistically: the bar moves, the request
goes out, and if the server refuses the bar snaps back and the reason appears
above the chart. Work packages nobody has scheduled are listed with a "not
scheduled" label rather than being given invented dates.

The hint line above the chart says what *you* can do rather than hiding the
feature silently — "Drag to edit. Move a bar to reschedule it…" for someone who
can, "Read-only. Client — you are not on this project's team." for someone who
cannot. A person with progress-only rights sees the progress sentence and not
the reschedule one.

A refused drag says why. Silently doing nothing is what makes a chart feel
broken, so a gesture your role does not allow now names the rule that stopped
it, and a failed save distinguishes an expired session, a 404 (usually a stale
`.next`) and a missing migration instead of a flat "that didn't save".

**Three bugs worth remembering.** The drag handler originally did its saving
inside a `setState` updater; React invokes updaters twice in development, so
every drag fired two identical PATCH requests. The work now happens in the
mouse-up handler and reads the drag state from a ref. A stale `.next` directory
made every nested dynamic route 404 — the drag looked broken when the code was
fine. And the dates were a day early everywhere east of Greenwich; see below.

---

## Calendar dates are calendar dates

A `date` column has no time and no zone: 2026-11-22 is the 22nd. The pg driver
decoded it into a JS Date at **local** midnight, `mapSnakeToCamel` serialised
that with `toISOString()` — converting to UTC — and the UI truncated the result
to ten characters:

```
Postgres      2026-11-22
pg driver     Sun Nov 22 2026 00:00:00 GMT+0530
toISOString   2026-11-21T18:30:00.000Z
.slice(0,10)  2026-11-21          ← a day early, every time
```

In IST every date in the application displayed one day early. In a date input
it was worse than cosmetic: the field showed the 21st, the form posted the 21st,
and the row moved back a day each time somebody opened the editor and saved.
It was invisible in UTC, which is why it survived the first round of testing.

Two changes fix the class of bug rather than the instances:

1. `src/lib/db.ts` registers a type parser for DATE (oid 1082) that hands the
   value back as the untouched `"YYYY-MM-DD"` string. There is no Date to
   convert, so there is nothing to convert wrongly, and the value is now correct
   for a client in any timezone.
2. `src/lib/dates.ts` holds the only date formatters the app should use —
   `toDateInput`, `toISODate`, `todayISO`, `todayPlusISO`, `parseISODate`. They
   read the local calendar day and never route through UTC. Every
   `toISOString().slice(0, 10)` and `.split("T")[0]` in the app now goes
   through them.

If you add a date anywhere, use those helpers. `new Date(value).toISOString()`
is the trap.

---

## Exports

`GET /api/pmt/projects/<id>/export?format=xlsx|pdf|pptx|csv`

| Format | What you get |
|---|---|
| `xlsx` | Seven sheets: Summary, Work Breakdown, Milestones, Risks, Stage Gates, Team, Linked Tickets |
| `pdf` | Cover summary, then the Gantt drawn as vector bars with progress fill, milestone diamonds, a today line and a legend |
| `pptx` | Five slides: title, status, schedule, risks, next steps |
| `csv` | One table — add `&table=wbs\|milestones\|risks\|governance\|team\|tickets` |

The Export button on the project page offers all six downloads and says whether
financials are included, so nobody wonders why their file differs from a
colleague's.

Everything comes from `src/lib/exporters/plan-data.ts`, which gathers the plan
once and computes duration-weighted progress the same way the screen does — the
file and the page cannot disagree. `gatherPlan()` takes `includeFinancials`,
and when it is false the budget and invoiced rows are not written and the rate
band column is dropped entirely rather than blanked, so there is no column of
suggestive gaps.

The response carries `X-Financials-Included: yes|no`, which is what the UI
reads to caption the menu.

---

## Verified

Against a live Postgres and a real browser, signed in as each of the four roles
in turn:

**The permission matrix, probed at the API rather than the UI.** Reschedule,
progress, create, delete, invoices, cost summary, timesheets, employee master
and export were each called as admin, PM, member and client. Member: 403 on
reschedule and create, 200 on progress. Client: 403 on all four writes and on
timesheets. Only the admin reached `/api/admin/users`. Exports returned
`financials=yes` for admin and PM, `no` for member and client.

**The chart.** Moving a bar sends exactly one PATCH and persists
(2026-11-22 → 2027-01-31 became 2026-11-22 → 2027-02-09 and stayed). Dragging
the right edge changed the end date and left the start alone. The progress
handle moved 55% → 65% with the dates untouched. Drawing on the empty row
opened the dialog with the right range and POSTed a 201. As a member the bars
did not respond to a drag and no request was made; as a client the read-only
banner named the reason and there were no progress handles at all.

**Dates, with the server in IST.** The same project was opened from browsers in
Asia/Kolkata, America/New_York and Asia/Tokyo; all three showed
`2026-11-22 → 2027-02-27`, matching the row in Postgres exactly. Before the fix
the same page showed the 21st. The WBS editor's date inputs round-trip
unchanged, so saving no longer walks a row backwards, and the CSV export carries
the same days as the screen.

**Colour coding.** All three modes were exercised: Status produced four fills,
Health three (the ones present in the data), Phase six — one per top-level
branch, with children inheriting. The legend tracked the mode each time.

**Scrolling.** On a plan 2574px wide in a 930px viewport, the chart opened at
scroll 0 with three of six bars visible. It now auto-selects the zoom that fits
and opens with all six in view.

**Rows belong to their item.** Dragging the empty space beside a scheduled bar
sent no request and opened no dialog; dragging an unscheduled item's row PATCHed
that item's dates; dragging the dashed row opened the naming dialog. The work
package count was six before and six after, so nothing phantom was created.

**The files.** `openpyxl` opened the workbook and found all seven sheets;
`zipfile` confirmed five slides in the PPTX; page two of the PDF was rendered
to an image and inspected — bars, progress fill, status colours, milestone
diamonds, the today line and the legend all draw correctly. The admin workbook
contains Budget, Invoiced and Rate band; the member workbook has neither the
rows nor the column.

Not verified here: `invoices` has no table in the sandbox schema, so those
routes were confirmed to pass the permission check and then report a missing
table as a setup error (503) rather than a 500 — the query itself is untested.
