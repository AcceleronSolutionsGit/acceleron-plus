// ═══════════════════════════════════════════════════════════════
// The resource allocation report, as a file.
//
// Both formats are built from the same `toMatrix` rectangle as the
// on-screen table, so a column can never appear in one and not the
// other, and the number in a cell is the number somebody saw.
// ═══════════════════════════════════════════════════════════════

import ExcelJS from "exceljs";
import { toMatrix, type AllocationReport } from "../allocations";

const NAVY = "FF212F60";
const LIGHT = "FFF5F6F8";
const RED = "FFDE1E24";

// The tints match the ones the page uses, so the spreadsheet and the
// screen are recognisably the same report.
const BENCH_FILL = "FFFDF1DD"; // amber — idle capacity
const OVER_FILL = "FFFBEAE7"; // red — more than one person's worth
const FULL_FILL = "FFE6F5EE"; // green — exactly committed

export function allocationFileStem(report: AllocationReport): string {
  const stamp = (report.asOf ?? report.generatedAt.slice(0, 10)).replace(/-/g, "");
  return `acceleron-resource-allocation-${stamp}`;
}

/** A styled workbook: the matrix, plus a summary sheet that explains it. */
export async function buildAllocationWorkbook(
  report: AllocationReport
): Promise<Buffer> {
  const { header, rows } = toMatrix(report);

  const wb = new ExcelJS.Workbook();
  wb.creator = "Acceleron Plus";
  wb.created = new Date(report.generatedAt);

  // ── Summary ───────────────────────────────────────────────────
  const summary = wb.addWorksheet("Summary");
  summary.columns = [
    { header: "Field", key: "field", width: 28 },
    { header: "Value", key: "value", width: 46 },
  ];

  const s = report.summary;
  const summaryRows: [string, string | number][] = [
    ["Report", "Resource allocation by person"],
    ["Generated", new Date(report.generatedAt).toLocaleString("en-IN")],
    ["Allocations counted", report.asOf ? `Live on ${report.asOf}` : "All current allocations"],
    ["Headcount", s.headcount],
    ["Allocated to at least one project", s.allocated],
    ["On the bench", s.onBench],
    ["Over-allocated (above 100%)", s.overAllocated],
    ["Average utilisation", `${s.averageUtilisation}%`],
    ["Committed capacity", `${s.committedFte} FTE`],
    ["Widest row", `${report.maxProjects} project(s)`],
  ];
  summaryRows.forEach(([field, value]) => summary.addRow({ field, value }));

  styleHeader(summary);
  summary.getColumn("field").font = { bold: true };

  // A note, because a reader six months from now will wonder why a
  // closed project is not in their numbers.
  summary.addRow({});
  const note = summary.addRow({
    field: "Note",
    value:
      "Closed and cancelled projects are excluded — they are not a claim on anyone's time.",
  });
  note.getCell("value").alignment = { wrapText: true, vertical: "top" };
  note.getCell("field").font = { bold: true, color: { argb: NAVY } };

  // ── The matrix ────────────────────────────────────────────────
  const sheet = wb.addWorksheet("Allocation", {
    views: [{ state: "frozen", xSplit: 4, ySplit: 1 }],
  });

  sheet.addRow(header);
  rows.forEach((row) => sheet.addRow(row));

  // Emp code / Name / Dept / Location, then a name+percent pair per
  // project, then the two totals.
  const widths = [14, 26, 20, 16];
  for (let i = 0; i < Math.max(1, report.maxProjects); i += 1) widths.push(34, 12);
  widths.push(16, 18);
  widths.forEach((w, i) => {
    sheet.getColumn(i + 1).width = w;
  });

  styleHeader(sheet);

  const totalCol = 4 + Math.max(1, report.maxProjects) * 2 + 1;

  report.rows.forEach((source, index) => {
    const row = sheet.getRow(index + 2);

    const fill =
      source.state === "over"
        ? OVER_FILL
        : source.state === "bench"
          ? BENCH_FILL
          : source.state === "full"
            ? FULL_FILL
            : index % 2 === 0
              ? LIGHT
              : null;

    if (fill) {
      row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
    }

    // Percent columns right-aligned so a column of numbers reads as one.
    for (let i = 0; i < Math.max(1, report.maxProjects); i += 1) {
      const cell = row.getCell(4 + i * 2 + 2);
      cell.alignment = { horizontal: "right" };
      if (typeof cell.value === "number") cell.numFmt = '0"%"';
    }

    const total = row.getCell(totalCol);
    total.alignment = { horizontal: "right" };
    total.numFmt = '0"%"';
    total.font = {
      bold: true,
      color: { argb: source.state === "over" ? RED : NAVY },
    };
  });

  // Filters on the header row, so whoever opens this can slice it
  // themselves rather than asking for another export.
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: rows.length + 1, column: header.length },
  };

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function styleHeader(sheet: ExcelJS.Worksheet) {
  const row = sheet.getRow(1);
  row.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  row.alignment = { vertical: "middle", wrapText: true };
  row.height = 26;
}

// ─── CSV ───────────────────────────────────────────────────────────

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Excel opens these directly, so CRLF it is. */
export function buildAllocationCsv(report: AllocationReport): string {
  const { header, rows } = toMatrix(report);
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}
