# Resource allocation

Who is on what, across every project at once, and how much of each
person is left. **Administration → Resource Allocation**.

No migration and no seed. It reads what is already there.

---

## The report

One row per person in the employee master, **including the people on
nothing at all**. That is the point: a resourcing report that lists only
busy people cannot answer the question it exists to answer. Somebody
sitting idle is the most important row on the sheet, and if they are
simply absent they read the same as not existing.

| | |
|---|---|
| **Emp Code, Name, Department, Location** | straight from the employee master |
| **Project 1, 2, 3 …** | that person's own projects, biggest commitment first |
| **Total Allocation %** | the sum |
| **Status** | on bench · partly allocated · fully allocated · over-allocated |

The project columns are **positional**, not one column per project in
the company. Row 1's "Project 1" is a different project from row 2's, so
you cannot read down a column — but the sheet stays the same width
whether there are three projects or three hundred. The number of column
pairs is the widest row in the current filter, so it grows only as far
as it has to.

Within a row the projects are ordered by allocation, largest first, so
"Project 1" is the thing that person is mostly doing. Ties break on
project code, which makes the order stable between two runs — a diff of
two exports then means something.

### What is counted

**Closed and cancelled projects are excluded.** They are not a claim on
anybody's time, and counting them would show people as busy months after
the work ended. This is the same rule the over-allocation warning uses
when you staff somebody, and the two have to agree or the warning and
the report will contradict each other on screen.

**As at** narrows to allocations live on one date — useful for "who is
free in November". Left empty, every current allocation counts. An
allocation with no dates is always counted; it has not been given a
window, so there is none to fall outside of.

---

## The dashboard

Five figures across the top, and each is a different question:

| | |
|---|---|
| **Headcount** | how many people the filter covers |
| **Allocated** | on at least one live project, with committed capacity in FTE |
| **On bench** | on nothing — idle capacity |
| **Over-allocated** | above 100%, which is a promise that cannot be kept |
| **Avg utilisation** | mean total across everyone, bench included |

Over-allocated rows are tinted red and bench rows amber **across the
whole row**, not just in the status column — on a sheet this wide the
last column may be off-screen, and a problem you can only see after
scrolling is a problem you will miss.

The employee column is pinned to the left and the total to the right, so
the two things you are comparing stay on screen while the projects
scroll between them.

Filters: search (code, name, email or designation), department,
location, an as-at date, **only the bench and the over-allocated** —
which is the view worth opening on a Monday — and whether to include
people marked inactive in the master.

---

## Export

**Export to Excel** and **CSV**, both taking the same filters as the
screen. What downloads is what you were looking at; exporting a
different set from the one on screen is how a report gets argued about
in a meeting.

The workbook has two sheets. **Allocation** is the matrix, with the
header frozen, the first four columns frozen, AutoFilter on every
column, and the same red/amber/green tints as the page. **Summary**
carries the five figures, when it was generated, what the as-at filter
was, and a note saying closed projects are excluded — because a reader
six months from now will otherwise wonder why a finished project is
missing from their numbers.

The CSV is written with a UTF-8 BOM, so Excel on Windows opens it as
UTF-8 instead of turning every ₹ and every accented name into mojibake.

Both formats are built from the same rectangle as the on-screen table,
so a column cannot appear in one and not the other.

---

## Who can see it

A new capability, `report.allocations`:

| | |
|---|---|
| **Admin** | yes — the page and both exports |
| **PM** | yes at the API. A PM staffing a project needs to see who is free before they can ask for them; withholding the bench makes that guesswork |
| **Member** | no — 403 |
| **Client** | no — 403 |

The API guards on the capability rather than on the URL, so it stays
correct if the page ever moves out from under `/admin`. The page itself
is admin-only twice over: the proxy blocks `/admin` for everyone else,
and the server component checks the role again before it reads anything.

The report names people and projects. It carries **no rates and no
cost**, so it is not gated behind `financials.view`.

---

## Where it lives

```
src/lib/allocations.ts              the report, and toMatrix()
src/lib/exporters/allocations.ts    the workbook and the CSV
src/app/api/reports/allocations/            JSON
src/app/api/reports/allocations/export/     the file
src/app/(app)/admin/allocations/            the page
```

People live in `identity_db` and allocations live in `project_db`, which
are separate databases — there is no join to write. The two sides are
fetched independently and stitched on `employee_id` in memory.

---

## Verified

**The arithmetic, by hand, against live Postgres.** A seeded spread of
14 people: somebody on three projects at 50 + 50 + 30 = **130%**,
somebody on two at 70 + 30 = **100%**, somebody on one at **25%**, and
seven on nothing at **0%**. Every one of the 14 totals in the downloaded
workbook was re-derived from its own project cells — **0 mismatches**.
Headcount 14, allocated 7, bench 7, over-allocated 1; the 615 percentage
points across everyone give 615 ÷ 14 = **44%** average utilisation and
615 ÷ 100 = **6.2 FTE** committed, which is what both the page and the
Summary sheet report.

**The filters.** Department → 7 rows, all Delivery. Location → 3 rows,
all Pune. Search "neha" → 1 row. An as-at date before every project
started puts all 14 on the bench and collapses the report to zero
project columns; a date after every project ends does the same. "Only
the bench and the over-allocated" → 8 rows, matching 7 + 1.

**Permissions.** Member: 403 on the report and 403 on the export, and
`/admin/allocations` redirects to `/pmt`. Client: 403.

**The files.** The workbook opens with both sheets and the exact header
`Emp Code | Name | Department | Location | Project 1 | Project 1
Allocation % | … | Total Allocation % | Status`. The CSV's first three
bytes are `EF BB BF`, the UTF-8 BOM.

**The page**, at 1440px, with no console errors, and checked again
scrolled fully right to confirm the pinned columns stay readable.

**Production build** clean — 46 pages, both new routes present.

Not verified here: behaviour at a few thousand employees. The query is
two round trips regardless of headcount, but the page renders every row
without virtualising, so a very large master will feel heavy before it
is wrong.
