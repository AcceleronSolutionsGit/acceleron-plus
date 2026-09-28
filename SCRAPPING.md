# Scrapping a project

Taking a project out of circulation without destroying what it carries,
and deleting it outright only when there is demonstrably nothing to
lose.

---

## Setup

```bash
node src/lib/migrations/migrate-scrap.js
```

Adds the scrapped and requested columns to `projects`, plus a partial
index on `scrapped_at` — every list in the app now filters on it, and
without the index that predicate is a sequential scan on every project
query in the product. Idempotent.

---

## Why it is not a delete

A project is not just a row. Hanging off it are timesheets somebody
approved, invoices that have been sent, and tickets a client raised.
Deleting the row would orphan every one of them.

So **scrapping is a state the project enters**, with the reason, the
person and the moment recorded against it. Nothing is destroyed and an
admin can put it back exactly as it was.

**Purging** — actually deleting the row and everything cascading from
it — is offered only on a project that is already scrapped *and* holds
nothing. `purgeBlockers` in `src/lib/scrap.ts` is the only thing
standing between a client's invoice and a delete statement, so every
path goes through it and `purgeProject` re-checks rather than trusting
its caller.

A project is blocked from deletion by any of: approved timesheet
entries, invoices, linked service-desk tickets, or hours logged.

---

## The reason

Mandatory, minimum ten characters. The reason *is* the feature — a
project that vanished with "asdf" written against it is no more
accountable than one that vanished silently. The dialog's Scrap button
stays disabled until the box holds a real sentence, and the API checks
again before it touches anything.

---

## Who does what

| | |
|---|---|
| **Admin** | scraps, restores, and purges |
| **PM** | records a *request*, with a reason, for an admin to action |
| **Member / client** | 403, and `/pmt/scrapped` redirects away |

A PM cannot scrap alone on purpose: removing a project other people are
billing against should not be something one person can do quietly. Both
halves are kept, so it is clear afterwards who asked and who agreed. A
PM can withdraw their own request.

---

## Where it is

**On the project** — a red *Scrap project* (admin) or *Request
scrapping* (PM) in the header. The dialog says **what will be kept
before it asks for the reason**: somebody about to remove a project
needs to know whether forty approved timesheets are going with it, and
afterwards is not a useful time to learn that.

**Projects → Scrapped** (admin only) — everything scrapped, with its
reason, who did it and when, and what it is still holding. Restore is a
button. *Delete for good* is greyed out, with the reason in its tooltip,
unless the project is genuinely empty — and then it asks you to type the
project code. That friction is the difference between "I clicked the red
button" and "I meant this project".

---

## What stops counting

This is the part that matters, and it is easy to get half-right. A
scrapped project is excluded from:

- **the project list** — `getProjects()` filters it out centrally, not
  at each call site, because one caller forgetting is how a scrapped
  project reappears in somebody's numbers
- **the resource allocation report** — it stops claiming anybody's time
- **the staffing clash warning** — which has to agree with the report,
  or the two contradict each other on screen
- **the client portal** — not theirs to see either

`getScrappedProjects()` is deliberately a separate function rather than
a flag, so nothing shows scrapped projects by accident.

---

## Verified

**End to end against live Postgres, in a real browser.**

| | |
|---|---|
| No reason | 400 — *A reason is required.* |
| `"nope"` | 400 — *Say a little more — at least 10 characters.* |
| A real sentence | 200, scrapped, with what was kept in the message |
| Scrapping twice | 409 — *already been scrapped* |
| Purge before scrapping | 409, with the blockers listed |
| Purge holding 2 approved timesheets and 31 hours | **409, refused**, both blockers named |
| Purge on an empty project | 200, gone for good |
| Restore | 200, back in the list |

**It really does stop counting.** Scrapping PRJ-0003 took the
allocation report from **1 over-allocated to 0** and average utilisation
from **44% to 40%** — Neha Roy was at 130% precisely because of her 30%
on that project. Checked by hand: 615 points less PRJ-0003's 60 = 555,
÷14 = 40%, ÷100 = 5.6 FTE. Both matched.

**Permissions.** Member: 403 on scrap, 403 on the scrapped list, 403 on
purge, and `/pmt/scrapped` redirects to `/pmt` without rendering.

**The dialog.** Disabled on an empty reason, still disabled on a short
one, enabled on a real one; after scrapping it leaves the project page,
because staying on a project that has left every list is a dead end.

**A bug `tsc` could not catch.** The confirmation dialog is a client
component and imported `MIN_REASON_LENGTH` from `scrap.ts`, which
imports the database — dragging the Postgres driver into the browser
bundle. Types were clean; only the bundler found it. The pure rules now
live in `scrap-rules.ts` with no database import, and `scrap.ts`
re-exports them so the rule cannot end up stated differently in two
places.

**Production build** clean, 47 pages.

Not verified here: what a client sees if they had a scrapped project's
URL open when it was scrapped. The portal query excludes it, so the
project disappears on their next load, but the transition is untested.
