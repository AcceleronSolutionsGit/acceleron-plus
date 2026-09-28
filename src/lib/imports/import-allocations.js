#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// Bring a Microsoft Forms response sheet into project_team_members.
//
//   node src/lib/imports/import-allocations.js responses.xlsx
//   node src/lib/imports/import-allocations.js responses.xlsx --commit
//   node src/lib/imports/import-allocations.js responses.csv --date-order mdy
//
// A dry run by default, and deliberately so: the first thing anybody
// wants to know about a file of 200 responses is how many of them are
// wrong, and finding that out should not require having already
// written them.
//
// Somebody already on a project is skipped and reported. Nothing that
// is already in the database is overwritten by this script.
// ═══════════════════════════════════════════════════════════════

const fs = require("fs");
const path = require("path");
const { identityDb, projectDb, closeAll } = require("../db-config");
const { runAllocationImport } = require("./allocation-import");

const args = process.argv.slice(2);
const commit = args.includes("--commit");
const verbose = args.includes("--verbose");
const orderIndex = args.indexOf("--date-order");
const dateOrder = orderIndex > -1 && args[orderIndex + 1] === "mdy" ? "mdy" : "dmy";
const file = args.find((a) => !a.startsWith("--") && a !== "mdy" && a !== "dmy");

const PAD = "  ";

function line(char = "─", width = 72) {
  return PAD + char.repeat(width);
}

function describe(row) {
  const who = row.employeeName ? `${row.employeeId} ${row.employeeName}` : row.employeeRaw || "—";
  const what = row.projectCode || row.projectRaw || "—";
  const pct = row.allocationPercent ? `${row.allocationPercent}%` : "—";
  const window =
    row.startDate || row.endDate
      ? `${row.startDate ?? "open"} → ${row.endDate ?? "open"}`
      : "no dates";
  return `${who}  ·  ${what}  ·  ${pct}  ·  ${window}`;
}

(async () => {
  if (!file) {
    console.error(
      "\n  Usage: node src/lib/imports/import-allocations.js <responses.xlsx> [--commit] [--date-order dmy|mdy] [--verbose]\n"
    );
    process.exitCode = 1;
    await closeAll();
    return;
  }

  const resolved = path.resolve(file);
  if (!fs.existsSync(resolved)) {
    console.error(`\n  ✖ No such file: ${resolved}\n`);
    process.exitCode = 1;
    await closeAll();
    return;
  }

  try {
    const result = await runAllocationImport({
      buffer: fs.readFileSync(resolved),
      filename: resolved,
      identityDb,
      projectDb,
      commit,
      dateOrder,
      importedBy: "the import script",
    });

    if (!result.ok) {
      console.error(`\n  ✖ ${result.error}\n`);
      if (result.parsed && result.parsed.headers.length > 0) {
        console.error(`${PAD}The columns I found were:`);
        for (const h of result.parsed.headers) console.error(`${PAD}  · ${h}`);
        console.error("");
      }
      process.exitCode = 1;
      return;
    }

    const { rows, summary } = result;

    console.log("");
    console.log(`${PAD}${path.basename(resolved)} — sheet "${result.sheetName}"`);
    console.log(`${PAD}${commit ? "COMMITTING" : "Dry run — nothing will be written"}`);
    console.log(line());

    const errors = rows.filter((r) => r.outcome === "error");
    const skipped = rows.filter((r) => r.outcome === "skipped");
    const ready = rows.filter((r) => r.outcome === "ready");
    const warned = rows.filter((r) => r.warnings.length > 0);

    if (errors.length > 0) {
      console.log(`\n${PAD}REFUSED — ${errors.length} row${errors.length === 1 ? "" : "s"}\n`);
      for (const row of errors) {
        console.log(`${PAD}  row ${row.rowNumber}: ${describe(row)}`);
        for (const m of row.messages) console.log(`${PAD}    ✖ ${m}`);
      }
    }

    if (skipped.length > 0) {
      console.log(`\n${PAD}SKIPPED — ${skipped.length} already there\n`);
      for (const row of skipped) {
        console.log(`${PAD}  row ${row.rowNumber}: ${row.messages[0] ?? describe(row)}`);
      }
    }

    if (warned.length > 0) {
      console.log(`\n${PAD}WORTH KNOWING\n`);
      for (const row of warned) {
        console.log(`${PAD}  row ${row.rowNumber}: ${describe(row)}`);
        for (const w of row.warnings) console.log(`${PAD}    ⚠ ${w}`);
      }
    }

    if (verbose && ready.length > 0) {
      console.log(`\n${PAD}${commit ? "INSERTED" : "WOULD INSERT"}\n`);
      for (const row of ready) {
        console.log(`${PAD}  row ${row.rowNumber}: ${describe(row)}`);
      }
    }

    console.log("");
    console.log(line());
    const verb = commit ? "inserted" : "ready to insert";
    console.log(
      `${PAD}${summary.total} response${summary.total === 1 ? "" : "s"}  ·  ` +
        `${commit ? (summary.inserted ?? 0) : summary.ready} ${verb}  ·  ` +
        `${summary.skipped} skipped  ·  ${summary.errors} refused` +
        (summary.overAllocated ? `  ·  ${summary.overAllocated} over 100%` : "")
    );
    if (!commit && summary.ready > 0) {
      console.log(`${PAD}Run again with --commit to write them.`);
    }
    if (commit && summary.failed) {
      console.log(`${PAD}⚠ ${summary.failed} row(s) failed at the insert — see REFUSED above.`);
    }
    console.log("");
  } catch (err) {
    console.error("\n  ✖", err && err.message ? err.message : err, "\n");
    if (verbose && err && err.stack) console.error(err.stack);
    process.exitCode = 1;
  } finally {
    await closeAll();
  }
})();
