# The in-app guides

A **Guide** button in the top bar, on every page, for every role. Open
it, pick what you are trying to do, and the app walks you through it —
pointing at each control as you go.

No migration, no setup.

---

## How it behaves

It **points rather than blocks**. The dimming overlay never takes
pointer events, so the control being highlighted is still clickable and
you can follow the instruction while the card is up. An overlay that
disables the app while explaining it teaches nothing.

Some steps carry an instruction — *Click New Project* — and doing the
thing moves the tour on by itself, so the guide keeps pace with you
rather than the other way round.

A tour **survives moving between pages**. Position is held in
`sessionStorage`, so a step that says "open the Team tab" can be
followed by one that lives on a different route, and the tour navigates
there itself.

Escape leaves at any point. Left and right arrows step. Clicking
anywhere outside the card closes it. Finished guides are ticked off in
the panel and the count sits in its footer.

The button carries a small red dot until it has been opened once. After
that it stays quiet — a badge that never goes away is decoration.

---

## What is in it

The panel puts **For this page** at the top, because somebody opening
help on the timesheet almost certainly wants the timesheet one and not
a list of thirteen. Everything else is grouped underneath.

| Role | Guides |
|---|---|
| **Admin** | 12 |
| **PM** | 11 |
| **Member** | 5 |
| **Client** | 1 |

**Getting started** — finding your way around; the client portal.
**Delivery** — starting a project, staffing one without double-booking
anyone, setting a margin and pricing to it, running a deal from lead to
project.
**Reporting** — seeing who is free and exporting it.
**Service desk** — working the queue.
**My work** — the timesheet, your tasks, your skills.
**Administration** — people and roles, master data.

Each one is written as a job somebody actually has, in that role's
language. "Staff a project without double-booking anyone" is a task;
"the Team tab" is not. They also carry the reasoning the app depends
on — why repricing is a separate button from saving a target, why a
blank timesheet cell deletes rather than storing a zero, why closed
projects are not counted against anybody's time.

---

## Adding or changing one

Everything is in **`src/lib/guides.ts`**. A guide is a title, a summary,
the roles that get it, and its steps:

```ts
{
  id: "staff-project",
  title: "Staff a project without double-booking anyone",
  summary: "Add people, let their rate band come from their grade…",
  minutes: 3,
  roles: ["admin", "pm"],
  path: "/pmt",
  group: "Delivery",
  steps: [
    {
      title: "Team & Resources",
      body: "Everyone on the project, what they cost, and what they are billed at.",
      target: "tab:team",        // the data-guide attribute to point at
      path: "/pmt",              // the tour navigates here if needed
      action: "Open the Team tab",
      advanceOnAction: true,     // doing it moves the tour on
    },
  ],
}
```

A step with no `target` is just something to read, and renders centred.

### Anchoring to an element

Steps point at a **`data-guide` attribute**, never at a CSS class. A
class is a styling decision and will eventually be changed by somebody
who has no idea a tour depends on it.

Three families are generated automatically, so most things are already
reachable without tagging anything:

| | |
|---|---|
| `nav:/my-tasks` | any sidebar item, from its href |
| `pmt-tab:/pmt/leads` | any of the four PMT header tabs |
| `tab:team` | any tab rendered by the `Tabs` component |

Anything else gets an explicit attribute — `data-guide="project:new"`
on the New Project button, and so on. `css:` as a prefix falls back to a
raw selector for the rare case that needs one.

If an element cannot be found after four seconds the card says so
plainly and offers to carry on, rather than hanging on an empty
spotlight.

---

## Verified

**Every guide, stepped through end to end, in a real browser, as each
role.** 18 runs — 12 as admin, 5 as member, 1 as client — and **every
step found its element**. No console errors on any run.

The harness drives the app the way a person does: it clicks the Guide
button, finds the row by its title, and presses Next through to Done,
checking at each step whether the spotlight anchored or the card fell
back to "not on this screen".

**Two real bugs this turned up.**

The panel rendered **see-through**, with the page legible straight
through it, despite a computed background of opaque white. The top bar
carries `backdrop-blur`, and an element with a backdrop-filter
composites its descendants into the filtered group — nothing about the
panel's own styling could have fixed it. It is now portalled to the
body, out of that ancestor entirely.

`master-data` appeared to loop forever. It was the harness: the Master
Data page has its own pagination button labelled "Next", and the script
was clicking that instead of the card's. Scoped to the card it runs
4/4 and closes cleanly — worth recording, because the same trap is
waiting for the next person who writes a test against a button label.

**Permissions hold.** A member is offered 5 guides and a client 1; none
of them points at anything that role cannot reach.

**Production build** clean, 46 pages.

Not verified here: the guides below 640px. The cards are fixed-width
and will need a mobile treatment before the app is used on a phone.
