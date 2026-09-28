# Margin, self-service skills, and the client and member views

What a project is meant to earn, who sees what, and the two views for
people who are not project managers.

---

## Setup

```bash
node src/lib/migrations/migrate-margin-and-skills.js
node src/lib/seeds/seed-demo-accounts.js --project PRJ-0001
```

The migration adds `target_margin_percent`, `margin_set_by_user_id`,
`margin_set_at` and `margin_notes` to `projects`, and fills the skill
catalogue out to **115 skills across 10 groups**. The seed creates two
accounts to look at the app through — see the end of this document.

---

## Project margin

**Financials tab**, at the top. Set by whoever can manage invoices —
the PM and above; a member or a client gets a 403 from the API, not a
hidden button.

Margin is stated one way and computed in one place:

```
margin % = (billable − cost) ÷ billable × 100
```

Not cost ÷ billable, and not billable ÷ cost. One arrangement out of
place turns a 40% project into a 29% one, so `src/lib/margin.ts` owns
it and everything else asks.

Three numbers, answering different questions:

| | What it means |
|---|---|
| **Target** | what the PM committed to, with who set it and when |
| **Planned** | what the staffing plan implies, before anybody works |
| **Actual** | what the hours logged so far have earned, at the same rates |

The variance is shown in **percentage points**, not as a second
percentage — "4 points under" is a different statement from "4% under",
and conflating them is how margin conversations go wrong.

### Pricing to the target

**Price the team to it** rewrites each person's billable rate:

```
billable = cost ÷ (1 − margin)
```

Every person is repriced from *their own* cost, so the margin is
uniform across the team rather than one grade subsidising another.
Cost is never touched: what somebody costs is a fact, what the client
is charged is the decision being made.

It is a separate action rather than a side effect of saving the number,
because recording an aim and rewriting live rates are different
decisions — and doing the second silently when somebody meant the first
would be an unpleasant surprise on a running project.

Somebody with no daily cost on file is skipped and named rather than
priced at zero. A target of 100% or more is refused: it has no solution
at any finite price.

---

## Skills

The catalogue now covers what the practice actually staffs:

| Group | Count | |
|---|---|---|
| SAP | 22 | S/4HANA, FICO, MM, SD, PP, QM, PM, WM/EWM, HCM, SuccessFactors, Ariba, ABAP, Fiori/UI5, BASIS, BW/BI, CPI, SolMan, GRC, Security, LSMW/LTMC, Analytics Cloud, CS |
| Backend | 23 | PHP, Laravel, Symfony, CodeIgniter, WordPress, Node.js, NestJS, Express, Python, Django, FastAPI, Flask, Java, Spring Boot, C#/.NET, ASP.NET Core, Go, Rust, Rails, GraphQL, REST, gRPC, microservices |
| Frontend | 12 | JavaScript, TypeScript, React, Next.js, Vue, Nuxt, Angular, Svelte, Tailwind, HTML/CSS, Redux, accessibility |
| Data | 14 | Postgres, MySQL, MongoDB, SQL Server, Oracle, Redis, Elasticsearch, Kafka, Airflow, Spark, migration, modelling, Power BI, Tableau |
| Cloud & DevOps | 13 | AWS, Azure, GCP, Docker, Kubernetes, Terraform, Ansible, Jenkins, GitHub Actions, GitLab CI, Linux, Nginx, observability |
| Quality | 9 | automation, manual QA, Selenium, Cypress, Playwright, Jest, JUnit, Postman, JMeter |
| Platforms | 7 | Oracle Fusion, Salesforce, ServiceNow, Power Platform, Dynamics 365, Shopify, Magento |
| Advisory | 6 | architecture, BA, change, PM, agile, pre-sales |
| Mobile | 4 | React Native, Flutter, Swift, Kotlin |
| Security | 5 | cybersecurity, appsec, pen testing, IAM, ISO 27001 |

Skills already in the catalogue keep everyone who holds them and are
only moved into a clearer group — re-running the migration never
disturbs existing data.

### Two ways to map them

**An admin maintains anyone's** at `/admin/skills`, reachable from
Administration and now also from **Master Data → Skills & Resource
Mapping**, which is where people look for master lists.

**Everybody maintains their own** at `/my-skills`. The employee master
is only as good as what is in it, and one admin typing a hundred
people's skills is how it goes stale — the person who knows is the
person themselves.

`/api/me/skills` is deliberately a separate endpoint from the admin one
and can only ever reach the caller's own row. Collapsing the two into
one route with a "whose?" parameter is how somebody ends up editing a
colleague's profile by changing a number in a URL. Somebody whose
sign-in is not linked to an employee record is told so plainly rather
than silently failing to save.

---

## The client portal

`/portal`. A client signing in lands here, not on the project list.

They see progress, dates, the plan by stage, milestones, documents
shared with them, and their own tickets — with a button to raise
another.

**The shape of this matters more than the styling.** The portal is not
the internal payload with fields hidden on the way out; that is one
forgotten field away from leaking a rate. `/api/portal` builds a
separate, smaller object that never selects a cost column at all. Its
per-project keys are exactly: `code`, `name`, `description`, `status`,
`phase`, `startDate`, `plannedEndDate`, `progressPercent`,
`workPackages`, `milestones`, `documents`, `tickets`,
`openTicketCount`. There is nothing to hide because nothing is sent.

Progress is weighted by duration the same way the internal plan weights
it, so a client and a PM never read two different percentages for the
same project.

`proxy.ts` sends a client away from `/pmt`, `/admin`, `/my-tasks`,
`/my-timesheet` and `/my-skills` to their portal. That guard is the
control: those pages are server components that read data *before* any
in-page check runs, so hiding the sidebar link would not have been
enough.

---

## The member views

**My Tasks** (`/my-tasks`) — everything allotted to them across every
project, grouped by when it is due or by project, overdue first.

**My Timesheet** (`/my-timesheet`) — one week, every project they are
allocated to, as a grid. Rows are the project and the work packages
allotted to them; columns are the days. Type hours, click away, saved.

Only projects they are **actually staffed on** appear, and the API
refuses a booking against anything else. A timesheet that lets you
book time anywhere is a reconciliation problem waiting to happen.

Zero or blank deletes the entry rather than leaving a `0` to reconcile.
An approved entry is locked — it is a financial record somebody has
signed off, and amending it silently would change a number they
approved. **Submit week** puts every draft entry in for approval at
once.

---

## The two demo accounts

Sign in at `/login` with the email address. There is no password — a
six-digit code is used, and in development it is shown on screen.

| | |
|---|---|
| **Team member** | `arjun.das@acceleronsolutions.io` |
| | Senior Consultant, grade G3, staffed at 60% on PRJ-0001 with two work packages allotted and four skills on file. Lands on My Tasks; has My Timesheet and My Skills; no Administration. |
| **Client** | `meera.iyer@gainwellindia.com` |
| | Client contact on PRJ-0001. Lands on the portal; sees progress, milestones, a shared status report and a button to raise a ticket. |

`seed-demo-accounts.js` is idempotent and takes `--project <CODE>` to
staff them onto a specific project.

---

## Verified

**The margin arithmetic, by hand.** Billable ₹100,000 against cost
₹60,000 gives 40%; against ₹110,000 it gives −10%; with no revenue it
returns null rather than inventing 0%. A ₹10,500 cost at a 40% target
prices to ₹17,500, and feeding that back through the margin formula
returns exactly 40%. A 100% target returns null; a 0% target returns
the cost unchanged.

**End to end on a live project.** A team planned at 46.4% margin, a 45%
target set, then repriced: planned margin landed on exactly **45.0%**,
and each person individually — ₹10,500 → ₹19,090.91, ₹18,000 →
₹32,727.27, ₹2,500 → ₹4,545.45 — also at 45%, so no grade subsidises
another. A 120% target was refused with the reason.

**Who may touch it.** Admin and PM: view 200, set 200. Member and
client: 403 on both.

**The client.** Lands on `/portal`. Sees the project, the six stages
with their real percentages, three milestones, the shared status report
and the ticket button. No rupee symbol appears anywhere on the page.
`/api/.../team`, `/api/.../margin` and `/api/admin/users` all return
403. Before the proxy guard was added this account could open `/pmt`
and read project budgets — that is what the guard fixes.

**The member.** Sidebar shows My Work, Project Management and Service
Desk, and no Administration. My Tasks lists both allotted packages. The
timesheet renders a 21-cell grid for the one project they are staffed
on; logging 7.5 hours persisted and the week total read 7.5h. My Skills
shows their four skills and the full catalogue including the SAP group.
`/api/.../margin` returns 403.

Not verified here: the portal's document link points at the existing
download route, but the seeded row has no file behind it — the link is
present and correctly scoped, the download itself is untested.
