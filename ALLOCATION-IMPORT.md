# Collecting allocations, and bringing them in

A Microsoft Form that people fill in, and an importer that turns the
responses into rows in `project_team_members` — which is what the
**Resource Allocation** report reads. Collect once, import once, and
the report stops being a thing somebody maintains by hand.

---

## One response is one allocation

The form asks about **one person on one project**. Somebody on three
projects fills it in three times.

That is the whole design decision, and it is worth saying why. A form
with "Project 1, Project 2, Project 3 …" caps people at however many
blocks you built, asks everybody to look at empty boxes, and leaves the
importer unpicking five projects out of one row. A form with one
allocation per response is the same size whether people carry one
project or ten, and every response maps to exactly one database row —
so when a row is refused, the report can point at a response rather
than at a corner of one.

The cost is that people press **Submit another response** a few times.
Say so in the form description and nobody minds.

---

## Building the form

```
node src/lib/imports/export-form-choices.js
```

Writes four things into `./form-choices`:

| | |
|---|---|
| `employees.txt` | one line per active person — `EMP0042 — Rahul Sharma` |
| `projects.txt` | one line per live project — `PRJ-0001 — Website Revamp (Acme Corp)` |
| `FORM-BUILD-SHEET.md` | the questions to create, in order, with the settings |
| `allocation-responses-template.xlsx` | a blank sheet with the same headers, for testing |

`--include-inactive` adds people marked inactive in the master.
`--out <dir>` puts the files somewhere else.

Forms cannot read a list from anywhere, so the two dropdowns are pasted
in — which makes them a snapshot. Re-run this before each collection
round, or a new joiner has no way to answer the first question.

### The questions

| # | Question | Type |
|---|---|---|
| 1 | **Employee (code and name)** | Choice, drop-down — paste `employees.txt` |
| 2 | **Project (code and name)** | Choice, drop-down — paste `projects.txt` |
| 3 | **Role on this project** | Choice — PM, BA, Developer, QA, DevOps, Designer, Architect, Support — with "Other" on |
| 4 | **Allocation % on this project** | Text, Restrictions → Number → between 1 and 100 |
| 5 | **Allocation start date** | Date |
| 6 | **Allocation end date** | Date |
| 7 | **Notes (optional)** | Long answer |

Forms names each response column after its question, and the importer
finds its columns by those names — so keep the titles as they are. It
falls back to a looser match if you change one, but there is no reason
to spend that.

To paste a dropdown: add a **Choice** question, click **Add option**
once, then paste the whole file into the first option box. Forms splits
a multi-line paste into separate options by itself. Turn **Drop-down**
on from the ⋯ menu — two hundred radio buttons is not a question, it is
a wall.

Nobody should edit the text of an option. The part before the em dash
is the code the importer matches on; the name after it is there so a
human can find themselves in the list.

### Settings

- **Record name** — on, for an audit trail of who said what.
- **One response per person** — **off**. People submit once per
  project; capping them at one response caps everybody at one project.
- **Accept responses** — close it when the round is over, so a late
  response does not turn up after you have imported.

---

## Importing

**Forms → Responses → Open in Excel**, then either:

**The admin page.** Administration → Resource Allocation → **Import
from Forms**. Upload the workbook, read the preview, press the button.

**The script.**

```
node src/lib/imports/import-allocations.js "path/to/responses.xlsx"
node src/lib/imports/import-allocations.js "path/to/responses.xlsx" --commit
```

A dry run by default, and deliberately: the first thing anybody wants
to know about 200 responses is how many are wrong, and finding that out
should not require having already written them. `--verbose` lists the
rows it would insert; `--date-order mdy` reads 03/04 as 4 March.

Both paths run the same code over the same file, so the preview cannot
differ from what the button does. The only difference between them is
whether the insert happens.

### What each row gets

| | |
|---|---|
| **Will import** | a new row on that project — role, percentage, dates |
| **Already there** | that person is already on that project. Skipped and named. Nothing is overwritten |
| **Refused** | something in the row cannot be resolved. Named, with the reason |

**Skipped, never overwritten** is the rule. Re-importing the same file
twice is safe, and so is importing a file that overlaps with staffing a
PM has already done by hand — their row is the one that stands, because
it is the one somebody made a decision about.

A row is refused when the employee is not in the master, when the name
given matches two people, when the project does not exist or is closed,
cancelled or scrapped, when the percentage is not between 1 and 100, or
when a date cannot be read or the end falls before the start.

### What it warns about but still imports

- Taking somebody past 100% across every live project. It says who and
  by how much. A promise that cannot be kept belongs on the report,
  tinted red, not quietly refused at the door — the report is where
  somebody will do something about it.
- Somebody marked inactive in the master.
- An allocation with no dates, which counts on every as-at date.

### Dates

Forms exports dates in the form owner's locale, so `03/04/2026` is
genuinely ambiguous. Where one component is above 12 the order settles
itself; where neither is, the importer reads day-first, because that is
what an Indian tenant will have typed. `--date-order mdy`, or the
dropdown on the admin page, switches it.

### Rates

An imported row picks up the rate band whose `level_code` matches the
person's grade, and its planned cost is worked out the same way the
Team tab does it. Where no band matches the grade, the row is written
**without rates** and says so, rather than inventing a figure — a
number nobody chose is worse than a blank somebody fills in.

---

## Who can do it

A new capability, `allocation.import`: **admin only**.

Reading the allocation report stays open to PMs — staffing a project
means knowing who is free. Writing allocations across every project at
once is a different thing, and one person doing it deliberately beats
several people doing it by accident. The page checks the role, the
proxy blocks `/admin`, and the API guards on the capability rather than
the URL.

---

## Where it lives

```
src/lib/imports/allocation-import.js       parse · resolve · commit
src/lib/imports/allocation-import.d.ts     its types, for the app
src/lib/imports/export-form-choices.js     the form build files
src/lib/imports/import-allocations.js      the CLI
src/app/api/reports/allocations/import/    the upload route
src/app/(app)/admin/allocations/import/    the page
```

The core is plain CommonJS on purpose: the CLI and the upload route
need the same logic, and standalone `node` can import CommonJS while it
cannot import TypeScript. The database handles are passed in rather
than imported, so the same code runs against the app's pool and against
a script's own connection — and so the resolve step can be tested with
no database at all.

Reading is separated from writing by more than politeness: nothing in
`parseAllocationFile` or `resolveAllocationRows` touches the database,
which is what makes the preview honest.

No migration. The importer writes the same columns the Team tab already
writes; there is no new table and nothing to run before using it.

---

## Verified

**The resolver, against a nine-case response sheet** covering a clean
row, a person already on that project in the database, the same person
twice in one file, an employee code not in the master, a closed
project, an allocation of 150, a date reading "banana", and an end date
before its start. Each landed in the right bucket with the right
message: 2 ready, 2 skipped, 5 refused, and the over-allocation warning
fired on the row that took somebody to 110%.

**Both file formats.** The same sheet as `.xlsx` and as a UTF-8-BOM
`.csv` produced the same column mapping and the same rows — including
`Start time` (Forms' own column) not being mistaken for
`Allocation start date`.

**Dates.** `01/10/2026` read day-first as 1 October; `2026-10-01` read
as itself; an Excel date cell read from its serial.

**Rate bands.** SRG1 matched the SRG1 band rather than the G1 band it
contains; a grade with no configured band returned nothing rather than
a guess.

**Typecheck** clean across the app.

Not verified here: a run against live Postgres, and `npm run build`.
