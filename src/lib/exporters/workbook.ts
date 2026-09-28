// ═══════════════════════════════════════════════════════════════
// Excel and CSV exports.
// ═══════════════════════════════════════════════════════════════

import ExcelJS from "exceljs";
import type { PlanExport } from "./plan-data";

const NAVY = "FF212F60";
const LIGHT = "FFF5F6F8";

function titleCase(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function styleHeader(sheet: ExcelJS.Worksheet) {
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  header.alignment = { vertical: "middle" };
  header.height = 22;
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

function banded(sheet: ExcelJS.Worksheet) {
  sheet.eachRow((row, index) => {
    if (index === 1) return;
    if (index % 2 === 0) {
      row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT } };
    }
  });
}

/** A full workbook: one sheet per part of the plan. */
export async function buildWorkbook(plan: PlanExport): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Acceleron Plus";
  wb.created = new Date(plan.generatedAt);

  // ── Summary ───────────────────────────────────────────────────
  const summary = wb.addWorksheet("Summary");
  summary.columns = [
    { header: "Field", key: "field", width: 26 },
    { header: "Value", key: "value", width: 60 },
  ];

  const rows: [string, string][] = [
    ["Project code", plan.project.code],
    ["Project name", plan.project.name],
    ["Client", plan.project.clientCompanyName ?? "—"],
    ["Status", titleCase(plan.project.status)],
    ["Current phase", plan.project.currentPhase ?? "—"],
    ["Project manager", plan.project.projectManagerName ?? "—"],
    ["Start date", plan.project.startDate ?? "—"],
    ["Planned end", plan.project.plannedEndDate ?? "—"],
    ["Overall progress", `${plan.overallProgress}%`],
    ["Work packages", String(plan.wbs.length)],
    ["Milestones", String(plan.milestones.length)],
    ["Open risks", String(plan.risks.filter((r) => r.status === "open").length)],
    ["Linked tickets", String(plan.tickets.length)],
  ];

  if (plan.financials) {
    rows.push(
      ["Budget (INR)", plan.financials.budgetInr?.toLocaleString("en-IN") ?? "—"],
      ["Hours logged", plan.financials.totalLoggedHours.toFixed(1)],
      ["Invoiced (INR)", plan.financials.invoicedInr.toLocaleString("en-IN")],
      ["Invoices raised", String(plan.financials.invoiceCount)]
    );
  }

  rows.push(["Exported", new Date(plan.generatedAt).toLocaleString("en-IN")]);
  rows.forEach(([field, value]) => summary.addRow({ field, value }));
  styleHeader(summary);
  summary.getColumn("field").font = { bold: true };

  // ── Work breakdown ────────────────────────────────────────────
  const wbs = wb.addWorksheet("Work Breakdown");
  wbs.columns = [
    { header: "Code", key: "code", width: 12 },
    { header: "Work package", key: "name", width: 46 },
    { header: "Status", key: "status", width: 14 },
    { header: "Start", key: "start", width: 12 },
    { header: "End", key: "end", width: 12 },
    { header: "Days", key: "days", width: 8 },
    { header: "Progress %", key: "progress", width: 12 },
    { header: "Est. hours", key: "hours", width: 12 },
    { header: "Owner", key: "owner", width: 22 },
    { header: "Description", key: "description", width: 50 },
  ];

  for (const item of plan.wbs) {
    const days =
      item.startDate && item.endDate
        ? Math.max(
            1,
            Math.round(
              (new Date(item.endDate).getTime() - new Date(item.startDate).getTime()) / 86400000
            )
          )
        : null;

    const row = wbs.addRow({
      code: item.code ?? "",
      // Indentation carries the tree structure into the spreadsheet.
      name: `${"    ".repeat(item.depth)}${item.name}`,
      status: titleCase(item.status),
      start: item.startDate ?? "",
      end: item.endDate ?? "",
      days: days ?? "",
      progress: item.progressPercent,
      hours: item.estimatedHours ?? "",
      owner: item.ownerName ?? "",
      description: item.description ?? "",
    });

    if (item.depth === 0) row.font = { bold: true };
    row.getCell("progress").numFmt = '0"%"';

    // Colour the status so the sheet is scannable.
    const colour =
      item.status === "completed"
        ? "FFE8F5E9"
        : item.status === "blocked"
          ? "FFFFEBEE"
          : item.status === "in_progress"
            ? "FFE3F2FD"
            : null;
    if (colour) {
      row.getCell("status").fill = { type: "pattern", pattern: "solid", fgColor: { argb: colour } };
    }
  }
  styleHeader(wbs);
  wbs.autoFilter = { from: "A1", to: "J1" };

  // ── Milestones ────────────────────────────────────────────────
  const milestones = wb.addWorksheet("Milestones");
  milestones.columns = [
    { header: "Milestone", key: "name", width: 44 },
    { header: "Due", key: "due", width: 14 },
    { header: "Status", key: "status", width: 14 },
    { header: "Completed", key: "completed", width: 14 },
    { header: "Billing", key: "billing", width: 10 },
    { header: "Description", key: "description", width: 50 },
  ];
  plan.milestones.forEach((m) => {
    const overdue = m.dueDate && m.status !== "completed" && new Date(m.dueDate) < new Date();
    const row = milestones.addRow({
      name: m.name,
      due: m.dueDate ?? "",
      status: overdue ? "Overdue" : titleCase(m.status),
      completed: m.completedAt ?? "",
      billing: m.isBillingMilestone ? "Yes" : "",
      description: m.description ?? "",
    });
    if (overdue) row.getCell("status").font = { color: { argb: "FFC62828" }, bold: true };
  });
  styleHeader(milestones);
  banded(milestones);

  // ── Risks ─────────────────────────────────────────────────────
  const risks = wb.addWorksheet("Risks");
  risks.columns = [
    { header: "Risk", key: "title", width: 44 },
    { header: "Probability", key: "probability", width: 14 },
    { header: "Impact", key: "impact", width: 14 },
    { header: "Status", key: "status", width: 14 },
    { header: "Mitigation", key: "mitigation", width: 50 },
  ];
  plan.risks.forEach((r) => {
    const row = risks.addRow({
      title: r.title,
      probability: titleCase(r.probability),
      impact: titleCase(r.impact),
      status: titleCase(r.status),
      mitigation: r.mitigationPlan ?? "",
    });
    if (r.probability === "high" && r.impact === "high") {
      row.font = { color: { argb: "FFC62828" }, bold: true };
    }
  });
  styleHeader(risks);
  banded(risks);

  // ── Stage-gates ───────────────────────────────────────────────
  if (plan.reviews.length > 0) {
    const reviews = wb.addWorksheet("Stage Gates");
    reviews.columns = [
      { header: "Review", key: "type", width: 36 },
      { header: "Date", key: "date", width: 14 },
      { header: "Outcome", key: "outcome", width: 18 },
      { header: "Notes", key: "notes", width: 60 },
    ];
    plan.reviews.forEach((r) =>
      reviews.addRow({
        type: r.reviewType,
        date: r.reviewDate ?? "",
        outcome: titleCase(r.outcome),
        notes: r.notes ?? "",
      })
    );
    styleHeader(reviews);
    banded(reviews);
  }

  // ── Team ──────────────────────────────────────────────────────
  if (plan.team.length > 0) {
    const team = wb.addWorksheet("Team");
    team.columns = [
      { header: "Name", key: "name", width: 30 },
      { header: "Role on project", key: "role", width: 24 },
      { header: "Allocation %", key: "allocation", width: 14 },
      ...(plan.financials ? [{ header: "Rate band", key: "band", width: 24 }] : []),
    ];
    plan.team.forEach((t) =>
      team.addRow({
        name: t.userName ?? "",
        role: t.roleInProject ?? "",
        allocation: t.allocationPercent ?? "",
        // Rate bands are commercial — omitted when the caller cannot see money.
        ...(plan.financials ? { band: t.rateBandName ?? "" } : {}),
      })
    );
    styleHeader(team);
    banded(team);
  }

  // ── Linked tickets ────────────────────────────────────────────
  if (plan.tickets.length > 0) {
    const tickets = wb.addWorksheet("Linked Tickets");
    tickets.columns = [
      { header: "Ticket", key: "number", width: 20 },
      { header: "Subject", key: "subject", width: 56 },
      { header: "Status", key: "status", width: 14 },
      { header: "Priority", key: "priority", width: 12 },
      { header: "Raised", key: "created", width: 14 },
    ];
    plan.tickets.forEach((t) =>
      tickets.addRow({
        number: t.ticketNumber,
        subject: t.subject,
        status: titleCase(t.status),
        priority: titleCase(t.priority),
        created: t.createdAt ?? "",
      })
    );
    styleHeader(tickets);
    banded(tickets);
  }

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// ─── CSV ───────────────────────────────────────────────────────────

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvTable(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

export type CsvTable = "wbs" | "milestones" | "risks" | "reviews" | "team" | "tickets";

/** One table as CSV. Excel opens these directly, so CRLF it is. */
export function buildCsv(plan: PlanExport, table: CsvTable): string {
  switch (table) {
    case "milestones":
      return csvTable(
        ["Milestone", "Due", "Status", "Completed", "Billing", "Description"],
        plan.milestones.map((m) => [
          m.name, m.dueDate, m.status, m.completedAt, m.isBillingMilestone ? "Yes" : "", m.description,
        ])
      );
    case "risks":
      return csvTable(
        ["Risk", "Probability", "Impact", "Status", "Mitigation"],
        plan.risks.map((r) => [r.title, r.probability, r.impact, r.status, r.mitigationPlan])
      );
    case "reviews":
      return csvTable(
        ["Review", "Date", "Outcome", "Notes"],
        plan.reviews.map((r) => [r.reviewType, r.reviewDate, r.outcome, r.notes])
      );
    case "team":
      return csvTable(
        ["Name", "Role on project", "Allocation %"],
        plan.team.map((t) => [t.userName, t.roleInProject, t.allocationPercent])
      );
    case "tickets":
      return csvTable(
        ["Ticket", "Subject", "Status", "Priority", "Raised"],
        plan.tickets.map((t) => [t.ticketNumber, t.subject, t.status, t.priority, t.createdAt])
      );
    case "wbs":
    default:
      return csvTable(
        ["Level", "Code", "Work package", "Status", "Start", "End", "Progress %", "Est. hours", "Owner"],
        plan.wbs.map((w) => [
          w.depth + 1, w.code, w.name, w.status, w.startDate, w.endDate, w.progressPercent,
          w.estimatedHours, w.ownerName,
        ])
      );
  }
}
