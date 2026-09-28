# Resourcing, skills, and the pre-sales pipeline

Who is on a project, what they cost, what they can do — and the path a
deal takes from a lead to a project with a plan already in it.

---

## Setup

```bash
node src/lib/migrations/migrate-resourcing.js
node src/lib/migrations/migrate-assignments.js
```

Both idempotent, like the others.

The first creates `identity_db.skills` (seeded with 24 starter skills)
and `identity_db.employee_skills`, and extends
`project_db.project_team_members` with the columns a staffed assignment
needs: `employee_id`, `daily_cost_inr`, `daily_billable_rate_inr`,
`planned_days`, `planned_cost_inr`, `planned_billable_inr`, `notes`.

The second creates `project_db.wbs_assignments` and adds
`assigned_count` and `assigned_hours` to `wbs_items` for the roll-up.

Nothing else. `employee_rate_bands`, `project_team_members` and
`wbs_items.owner_user_id` all already existed — the app simply never
wrote to them.

---

## Skills

`/admin/skills` — "Skills" in the sidebar, admin only.

The catalogue is admin-maintained: a name and a category, unique per
tenant so two spellings of "React" cannot split the same people into two
buckets. Retiring a skill keeps it on everyone who holds it; it just
stops being offered.

Each person holds a skill at a **proficiency from 1 to 5** — aware,
working, proficient, advanced, expert — optionally with years of
experience and a "main skill" flag. A number rather than a label means
"at least proficient" is a comparison, not a list of accepted strings.

Skills hang off `employee_master.employee_id`, not off a user account,
because somebody is worth staffing long before they ever sign in. If
Darwinbox ever exposes skills, the sync can fill the same table.

The catalogue is served from `/api/skills` rather than `/api/admin/…`:
the proxy reserves that prefix for admins, and a PM staffing a project
needs the list to filter by. Writing still needs `skill.manage`.

---

## Staffing a project

The **Team & Resources** tab on any project.

**Adding somebody** starts with the dates, because they decide who counts
as free. Then filter by the skills the work needs — at a minimum
proficiency, matching all of them or any — or search by name,
designation or department. Each candidate shows what they already hold
and how much of their week is left.

Then a role and an allocation, and the planned cost follows.

### The rate band comes from the person

Nobody picks a band by hand. A person's grade is on their
employee-master row — it comes from Darwinbox — and the grade is what
decides what they cost. Choosing it manually is a chance to get it
wrong, and a chance to price the same grade two different ways on two
different projects.

`suggestBandFor()` resolves it in three steps, most specific first:

| | Match | Example |
|---|---|---|
| 1 | An active band whose `level_code` **is** the grade | G3 → the band coded G3 |
| 2 | An active band **named** for that grade | G4 → "Principal Consultant" |
| 3 | The grade's own default from `DARWINBOX_GRADE_DETAILS` | M2 → Management Trainee, ₹2,500/day |

Step 3 matters: staffing works on day one, before anybody has
configured a single band. When it fires, `rate_band_id` stays null —
there is no band row to point at — and the screen says so plainly
rather than presenting a default as an agreed rate.

The form preselects the derived band and explains where it came from;
a PM can still override it from the dropdown, and overriding is then a
deliberate act rather than the only way to proceed. Sending no
`rateBandId` to the API does the same derivation server-side, so the
rate is right even for a caller that never asked.

### The two costs

| | Where it comes from |
|---|---|
| **Planned** | allocation % × working days in the window × the band's daily cost, fixed when the person is staffed |
| **Actual** | hours already logged on timesheets, at the same daily rate |

Working days are Mon–Fri. Deliberately not a holiday calendar: those
vary by office and nobody maintains that list yet, so counting weekdays
is the honest approximation and `planned_days` stays editable.

The rate is **copied onto the assignment**, not joined at read time. A
band re-priced next April must not silently rewrite what a project
committed to last November. Moving somebody to a different band
re-prices them from that band's current rate, because that is a
decision rather than a drift.

Everything is computed in `src/lib/staffing.ts` — one place, read by the
API, the screen and (in time) the exports, so the three cannot disagree.

### Over-allocation

Allocation only means anything across the whole portfolio. Somebody at
50% here may be at 80% on two other projects for the same weeks, and the
row in front of you says nothing about it.

So every add and every edit checks the other live projects — closed and
cancelled ones are not a claim on anybody's time — over the overlapping
dates. Going past 100% is refused once, with the clashing projects and
percentages named, and goes through only when the request comes back
with `allowOverallocation: true`. The screen asks first.

The candidate list shows the same thing before you choose: "20% free,
on PRJ-0002 (80%)". Two ranges overlap unless one finishes before the
other starts; a missing date is open-ended, which is the honest reading
of a row nobody has bounded.

### Who sees what

`team.view` shows who is on the project. `team.viewCost` is what adds
the money, and when it is missing the cost block is **absent from the
response** rather than zeroed — nothing downstream can mistake "not
allowed to see" for "free". `team.manage` is what lets somebody change
the team.

A member sees the team and its skills, and no money. A client sees
neither.

### Removing somebody

Time already logged against a project is a financial record. Somebody
with timesheets is **stood down** — marked inactive, hours and cost
kept — rather than deleted. Anybody else is removed outright.

---

## Allotting the work

Staffing puts somebody on a project. Allotting gives them a specific
work package, and that is a different question.

`wbs_items.owner_user_id` already existed as a single free-text id —
resolved, as it happens, against mock data. It stays as the one person
accountable, but it could never say who is actually doing a package
three people share, how much each of them has, or how far along each
one is. `wbs_assignments` carries that: one row per person per package,
with their own planned hours, status and progress.

**Assign** from the work breakdown — each row has a button showing how
many people are on it. Only people already on the project team can be
given work; assigning somebody who was never staffed would hand them
work with no rate, no allocation and no place in the cost. Hours
default the assignment's window to the package's own.

**Progress rolls up, weighted by hours.** A package where one person
has finished 8 hours and another has not started 32 is 20% complete,
not 50%, and the plan now says so. Nobody types a package's percentage
any more — it is the sum of what its people report. With no hours
recorded anywhere it falls back to a plain mean, which is the best
available reading rather than a wrong one. Status follows too: everyone
finished makes the package finished, anybody moving makes it in
progress. "Blocked" is left to a human, because one blocked assignee
does not necessarily stop the package.

**Who may update what**

| | Their own assignment | Somebody else's | Hours and dates |
|---|---|---|---|
| Team member | ✓ | | |
| Lead / PM / admin | ✓ | ✓ | ✓ |

A member moves their own progress, status and notes. Reaching for
another person's is refused by name — *"That work is allotted to Vikram
Nair"* — and reaching for the hours or the dates on their own is
refused too, because that is a planning decision. This is what stops
one person quietly overwriting another's status.

**My Tasks** (`/my-tasks`, in the sidebar for everyone) is the view a
delivery person lives in: everything allotted to them across every
project, grouped by when it is due or by project, with overdue work
first and progress they can move without opening anything. Hunting
through six project pages to find your own work is how things get
forgotten.

---

## The pre-sales pipeline

Three things on these screens did nothing at all: **+ New Lead** had no
handler, cards could not move between columns, and **Finalize** and
**View Proposal** on a solutioning estimate were decoration. There was
also no route from a won lead to a project, though `projects.lead_id`
and `solutioning_sessions.finalized_at` had been waiting for one.

**The board.** New Lead opens a form. Cards drag between columns and
save optimistically — the board is a status field with nice styling, and
waiting on a round-trip to watch a card land feels broken. A refused
move puts the card back and says why.

**An estimate** is built from phases, rate bands and day counts, plus
any additional costs, with a risk buffer. Creating one moves the lead to
*solutioning* on its own.

**Finalizing** is what turns somebody's working estimate into the number
the proposal goes out with. It stamps who and when, supersedes any
earlier finalized estimate — only one can be live, or the proposal value
is ambiguous — carries the proposed fee onto the lead as its opportunity
value, and moves the lead to *proposal*. Reopening undoes it.

**Converting** creates the project: the finalized fee becomes the
budget, each phase in the estimate becomes a work package carrying its
summed effort in hours, the ITSM context opens exactly as it does for a
project created by hand, and the lead is marked won. `projects.lead_id`
means the project can always be traced back to the deal. Converting
twice is refused, as is deleting a lead that became a project or that
has estimates against it — mark it lost instead of deleting the history.

---

## Verified

Against a live Postgres and a real browser.

**The cost arithmetic, checked by hand.** Rahul Mehta, 2–13 November at
50% on a ₹8,000/day band: 10 working days × 50% = 5.0 days = ₹40,000,
billable ₹75,000. Vikram Nair, 19 Sept – 30 Nov at 100%: 51 working days
= ₹408,000. The tab's totals — 53 days, ₹424,000, ₹795,000 billable —
match an independent calculation exactly.

**The band derivation, all three paths.** Across seven people: Ananya,
Farah and Sabarnik (G3) matched a band coded G3 at ₹10,500/day by
`level_code`; Dev and Vikram (G2) matched "Consultant" and Rahul and
Priya (G4) matched "Principal Consultant" by `band_name`; a trainee at
M2, with no band configured for that grade, fell to the built-in
₹2,500/day default with `rate_band_id` left null and a message naming
the grade. Staffing with no band in the request produced the right rate
each time — Sabarnik at G3 for 2–13 November came to 10 working days ×
₹10,500 = ₹105,000, and the M2 trainee for five days to ₹12,500.

**Over-allocation.** With Rahul already at 80% on PRJ-0002 across those
dates, staffing him at 50% was refused with *"would be at 130% over these
dates — already on PRJ-0002 at 80%"*; the same request with the override
went through and reported 130%; 20% instead was allowed, landing exactly
on 100%; raising it to 40% afterwards was refused again. Farah Khan,
whose other assignment ends 30 October, showed 60% committed for an
October window and 0% for a November one — the date overlap is real, not
a flat sum.

**Skills.** Filtering for Azure *and* Kubernetes at proficiency ≥ 4
returned only Rahul (5 and 4); matching *any* returned the same person;
searching "sap" found Ananya Roy by designation. Creating "Terraform" in
the admin screen, assigning it to Ananya, then filtering the staffing
search by it returned her and nobody else.

**Permissions.** A member sees the team but no costs and no Add button;
the API omits the cost block entirely rather than blanking it.

**Assignment and the roll-up.** A package estimated at 420h was allotted
to two people, 8h and 32h. With the first at 100% and the second at 0%
the package read 20%; moving the second to 50% took it to 60% — both
exactly the weighted figure. Allotting the same person twice returned
409; somebody not on the team was refused with a message naming the
Team & Resources tab.

**Update rights.** As the team member: updating their own assignment
succeeded; another person's returned 403 naming who it belongs to;
their own *hours* returned 403 explaining that is a PM's call;
allotting work and unassigning both returned 403. Through `/my-tasks`,
marking their own complete set it to 100% and completed in one step,
while another person's returned 404 rather than acknowledging it
exists.

**The pipeline, end to end.** A lead created through the UI
(ACC-LEAD-0001), moved to qualified, an invalid status refused with the
six valid ones named. An estimate of ₹568,500 moved the lead to
solutioning on its own; finalizing moved it to proposal and set the
opportunity value to the fee; finalizing twice returned 409. Converting
produced PRJ-0003 with a ₹568,500 budget, two work packages carrying
160h and 720h — 2 people × 10 days and 3 × 30 days, correct — and an
ITSM context; converting again returned 409, and deleting the lead was
refused because it had become a project. Dragging a card from New Leads
to Qualified sent one PATCH and the card stayed put.

Not verified here: the sandbox's ITSM schema is partial, so linked-ticket
behaviour on a converted project was not exercised beyond the context
row being created.
