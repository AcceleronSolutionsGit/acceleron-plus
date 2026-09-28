# Phase 1 rollout

Regular members get two jobs: **add themselves to the projects they work
on** and **fill in the weekly timesheet** (plus My Skills). There is no
approval before somebody is on a project; their reporting manager reviews
self-allocations afterwards and approves timesheets.
Everything else stays visible in the sidebar but greyed out with a
"Coming soon" badge. Admins and PMs are not restricted.

The switch is `PHASE1_ROLLOUT` in `src/lib/rollout.ts`. Set it to `false`
when Phase 2 goes live and every restriction below lifts at once.

## Who sees what

| | member | member with direct reports | pm | admin |
|---|---|---|---|---|
| My Projects, My Timesheet, My Skills | ✓ | ✓ | ✓ | ✓ |
| Timesheet Approvals, Team Allocations | | ✓ (own team) | ✓ (own team) | ✓ (everyone) |
| My Tasks, Projects, Governance, Service Desk | greyed | greyed | ✓ | ✓ |
| Administration | | | | ✓ |

Members land on `/my-projects` after sign-in. Typing `/pmt`, `/itsm` or
`/my-tasks` sends them back there (enforced in `proxy.ts`, not just the
sidebar). Guides that visit those pages are not offered to them.

## Adding yourself to a project

My Projects has an **Add a project** searchable dropdown (the shared
`Combobox`) over every live project you are not on — most of them from the
Zoho sales-order Excel — matching on name, code, customer and sales order
number. Pick one, choose a role and an allocation %, and you are on it: a
`project_team_members` row is written at once and the project appears in
My Timesheet. Below the picker are the projects you are on, each with
**Edit** (role / %) and **Remove** (deactivates the row; hours logged are
kept, and adding it again reactivates the same row).

| Endpoint | Does |
|---|---|
| `POST /api/me/projects` | Adds you (or reactivates you) and writes a `self_allocated` row to `project_allocation_requests`; any old `pending` request for that project becomes `withdrawn` |
| `PATCH /api/me/projects` | Changes your role / allocation on a project you are on |
| `DELETE /api/me/projects?projectId=` | Takes you off it (`is_active = false`) |

`/api/me/projects` also returns `clientName` and `salesOrderRef`. No
migration creates `projects.zoho_sales_order_ref`; if it is missing the
route falls back to the list without it.

## Team Allocations (manager review)

`/admin/allocation-requests`, "Team Allocations" in the sidebar. The
reporting manager (admins: everyone) sees their team's self-allocations:

| Action | From | To | Effect |
|---|---|---|---|
| Looks right | `self_allocated` | `reviewed` | none — just recorded |
| Remove | `self_allocated`, `reviewed` | `removed` | takes them off the project; they see the note on My Projects |
| Approve / Reject | `pending` (from before self-service) | `approved` / `rejected` | approve adds them to the team |

A row whose person has since taken themselves off shows "has left" and
offers no Remove.

## Approvals follow Darwinbox

`src/lib/reportees.ts` works out someone's direct reports from
`employee_master.direct_manager_employee_id` (synced from Darwinbox),
matched to app users by `darwinbox_ref` or email. The old code relied only
on `employee_master.reporting_manager_user_id`, which nothing populates, so
no manager could ever see a request. That column is still honoured for
manual links.

A manager only shows up as one if **they have signed in at least once**
(or were created with `grant-role.js`) — there has to be a `users` row to
match against. Until then, their team's requests are only visible to admins.

## Fixed along the way

- `/admin/timesheets` and `/admin/allocation-requests` were blocked by the
  proxy for everyone but admins, so managers could not reach them. They are
  now open to any signed-in employee; the APIs scope to direct reports.
- `POST /api/pmt/timesheets` approved whatever ids it was sent — any
  signed-in user could approve anyone's hours, including their own. It now
  acts only on the reviewer's direct reports (admins: anyone) and never on
  the reviewer's own entries. The response reports `count` and `skipped`.
- Nobody can review their own allocation, admins included.
- Clients can no longer open `/my-projects` or call `/api/me/projects`,
  which listed every live project.
- The approval queue's admin check used `roleCode === "admin"`, so
  `super_admin` / `tenant_admin` were treated as managers. It uses the
  derived role now.

## Rolling it out

1. `node src/lib/seeds/sync-darwinbox.js` so reporting lines are current.
2. Make sure the people who run projects hold the `pm` role
   (`node src/lib/seeds/grant-role.js --email … --role pm`); everyone else
   stays `member`.
3. Restart `next dev` (delete `.next` if a route 404s).
