#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// Everything you need to build the resourcing form in Microsoft
// Forms, generated from what is actually in the database.
//
//   node src/lib/imports/export-form-choices.js
//   node src/lib/imports/export-form-choices.js --include-inactive
//   node src/lib/imports/export-form-choices.js --out ./form-choices
//
// Forms cannot read a list from anywhere, so the two dropdowns have
// to be pasted in by hand. That makes them a snapshot: run this again
// before each collection round, or a new joiner will have no way to
// answer the first question.
// ═══════════════════════════════════════════════════════════════

const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");
const { identityDb, projectDb, closeAll } = require("../db-config");
const { buildChoiceLists, FORM_QUESTIONS } = require("./allocation-import");

const args = process.argv.slice(2);
const includeInactive = args.includes("--include-inactive");
const outIndex = args.indexOf("--out");
const outDir = path.resolve(
  outIndex > -1 && args[outIndex + 1] ? args[outIndex + 1] : "./form-choices"
);

function buildSheet(counts) {
  const questions = FORM_QUESTIONS.map((q, i) => {
    const required = q.required ? "**Required**" : "Optional";
    return `### ${i + 1}. ${q.label}\n\n- Type: ${describeType(q.key)}\n- ${required}`;
  }).join("\n\n");

  return `# Resourcing form — build sheet

Generated ${new Date().toISOString().slice(0, 10)} from the live
database: ${counts.employees} employees, ${counts.projects} live projects.

## The shape of it

**One response is one person on one project.** Somebody on three
projects fills the form in three times — which is why there is no
"Project 2" anywhere below. The form stays the same size whether
people carry one project or ten, and the import never has to unpick a
row that holds five projects side by side.

Put that in the form description, in as many words:

> Fill this in once for **each** project you are working on. When you
> have submitted, click **Submit another response** and do the next
> one. If you are on the bench, you do not need to fill this in at
> all — we will see that from the projects nobody has named you on.

## The questions

Create these in order. The titles matter: Microsoft Forms names each
response column after its question, and the importer finds its columns
by those names. Change a title and the importer falls back to a looser
match, which usually still works — but there is no reason to risk it.

${questions}

## The two dropdowns

\`employees.txt\` and \`projects.txt\` sit next to this file, one option
per line. In Forms, add a **Choice** question, click **Add option**
once, then paste the whole file into the first option box — Forms
splits a multi-line paste into separate options by itself.

Turn on **Drop-down** on both (the ⋯ menu on the question). A list of
${counts.employees} radio buttons is unusable; the same list as a
dropdown is fine.

Do not edit the text of an option. The part before the em dash is the
code the importer matches on, and the name after it is only there so a
human can find themselves in the list.

## Settings worth changing

- **Record name** — on, if this is for your own organisation. It gives
  you an audit trail of who said what without asking for it.
- **One response per person** — **off**. People submit once per
  project, so limiting them to one response would cap everybody at a
  single project.
- **Accept responses** — close it when the collection round is over,
  so late responses do not turn up after you have imported.

## When the responses are in

1. In Forms: **Responses → Open in Excel**.
2. Save the workbook somewhere you can find it.
3. Either upload it at **Administration → Resource Allocation →
   Import from Forms**, or run:

   \`\`\`
   node src/lib/imports/import-allocations.js "path/to/responses.xlsx"
   \`\`\`

   That is a dry run: it reads the file, checks every row against the
   master and prints what it would do. Add \`--commit\` to write.

Somebody already on a project in the database is **skipped and
reported**, never overwritten — so re-importing the same file twice is
safe, and so is importing a file that overlaps with staffing a PM has
already done by hand.
`;
}

function describeType(key) {
  switch (key) {
    case "employee":
    case "project":
      return "Choice, drop-down (paste the list from the file below)";
    case "role":
      return 'Choice — PM, BA, Developer, QA, DevOps, Designer, Architect, Support — with "Other" turned on';
    case "allocation":
      return "Text, with **Restrictions → Number → Between 1 and 100**";
    case "startDate":
    case "endDate":
      return "Date";
    default:
      return "Long answer";
  }
}

async function writeTemplate(file) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Responses");
  sheet.columns = FORM_QUESTIONS.map((q) => ({
    header: q.label,
    key: q.key,
    width: Math.max(18, Math.min(42, q.label.length + 6)),
  }));
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).alignment = { vertical: "middle", wrapText: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  await workbook.xlsx.writeFile(file);
}

(async () => {
  try {
    fs.mkdirSync(outDir, { recursive: true });

    const lists = await buildChoiceLists({ identityDb, projectDb, includeInactive });

    const employeesFile = path.join(outDir, "employees.txt");
    const projectsFile = path.join(outDir, "projects.txt");
    const sheetFile = path.join(outDir, "FORM-BUILD-SHEET.md");
    const templateFile = path.join(outDir, "allocation-responses-template.xlsx");

    fs.writeFileSync(employeesFile, lists.employees.join("\n") + "\n", "utf8");
    fs.writeFileSync(projectsFile, lists.projects.join("\n") + "\n", "utf8");
    fs.writeFileSync(sheetFile, buildSheet(lists.counts), "utf8");
    await writeTemplate(templateFile);

    console.log("\n  Resourcing form — build files\n");
    console.log(`  ${employeesFile}`);
    console.log(`     ${lists.counts.employees} employees${includeInactive ? " (including inactive)" : ""}`);
    console.log(`  ${projectsFile}`);
    console.log(`     ${lists.counts.projects} live projects (closed and cancelled left out)`);
    console.log(`  ${sheetFile}`);
    console.log("     how to build the form, question by question");
    console.log(`  ${templateFile}`);
    console.log("     a blank sheet with the same headers, for testing the importer\n");

    if (lists.counts.projects === 0) {
      console.log("  ⚠ No live projects. Nobody can answer the project question.\n");
    }
  } catch (err) {
    console.error("\n  ✖", err.message, "\n");
    process.exitCode = 1;
  } finally {
    await closeAll();
  }
})();
