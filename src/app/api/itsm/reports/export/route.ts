/**
 * GET /api/itsm/reports/export
 *
 * Exports ITSM ticket data in three formats: CSV, Excel (.xlsx), or PDF.
 *
 * Query params:
 *   format       csv | xlsx | pdf         (required)
 *   status       new|open|pending|... | all
 *   priority     urgent|high|medium|low | all
 *   projectCode  string | all
 *   dateFrom     ISO date string
 *   dateTo       ISO date string
 *   ticketType   incident|service_request|problem|query | all
 *   source       email|portal|phone|... | all
 */

import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getTickets } from "@/lib/api";
import type { Ticket } from "@/lib/types";

export const runtime = "nodejs";

// ─── Formatting helpers ────────────────────────────────────────────────────

function fmt(val: string | null | undefined): string {
  return val ?? "";
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function capitalize(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ") : "";
}

// ─── Filtering ─────────────────────────────────────────────────────────────

function filterTickets(tickets: Ticket[], params: URLSearchParams): Ticket[] {
  const status = params.get("status") || "all";
  const priority = params.get("priority") || "all";
  const projectCode = params.get("projectCode") || "all";
  const ticketType = params.get("ticketType") || "all";
  const source = params.get("source") || "all";
  const dateFrom = params.get("dateFrom");
  const dateTo = params.get("dateTo");

  return tickets.filter((t) => {
    if (status !== "all" && t.status !== status) return false;
    if (priority !== "all" && t.priority !== priority) return false;
    if (projectCode !== "all" && t.projectCode !== projectCode) return false;
    if (ticketType !== "all" && t.ticketType !== ticketType) return false;
    if (source !== "all" && t.source !== source) return false;
    if (dateFrom) {
      const from = new Date(dateFrom);
      if (new Date(t.createdAt) < from) return false;
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      if (new Date(t.createdAt) > to) return false;
    }
    return true;
  });
}

// ─── CSV generator ─────────────────────────────────────────────────────────

function generateCSV(tickets: Ticket[]): string {
  const headers = [
    "Ticket #",
    "Type",
    "Subject",
    "Status",
    "Priority",
    "Source",
    "Requester",
    "Requester Email",
    "Assigned Agent",
    "Project Code",
    "Project Phase",
    "Is Overdue",
    "Created At",
    "Resolved At",
    "Closed At",
    "Description",
  ];

  const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`;

  const rows = tickets.map((t) => [
    escape(fmt(t.ticketNumber)),
    escape(capitalize(fmt(t.ticketType))),
    escape(fmt(t.subject)),
    escape(capitalize(fmt(t.status))),
    escape(capitalize(fmt(t.priority))),
    escape(capitalize(fmt(t.source))),
    escape(
      t.requester
        ? `${t.requester.firstName || ""} ${t.requester.lastName || ""}`.trim()
        : ""
    ),
    escape(fmt(t.requester?.email)),
    escape(fmt(t.agent?.fullName)),
    escape(fmt(t.projectCode)),
    escape(fmt(t.projectPhase)),
    escape(t.isOverdue ? "Yes" : "No"),
    escape(fmtDateTime(t.createdAt)),
    escape(fmtDateTime(t.resolvedAt)),
    escape(fmtDateTime(t.closedAt)),
    escape(fmt(t.description)),
  ]);

  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
}

// ─── Excel (.xlsx) generator ────────────────────────────────────────────────

const PRIORITY_COLORS: Record<string, { bg: string; fg: string }> = {
  urgent: { bg: "FFBCBC", fg: "991B1B" },
  high:   { bg: "FED7AA", fg: "92400E" },
  medium: { bg: "FEF3C7", fg: "92400E" },
  low:    { bg: "D1FAE5", fg: "065F46" },
};

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  new:       { bg: "DBEAFE", fg: "1E40AF" },
  open:      { bg: "EDE9FE", fg: "5B21B6" },
  pending:   { bg: "FEF3C7", fg: "92400E" },
  on_hold:   { bg: "E5E7EB", fg: "374151" },
  resolved:  { bg: "D1FAE5", fg: "065F46" },
  closed:    { bg: "F3F4F6", fg: "6B7280" },
  cancelled: { bg: "FEE2E2", fg: "991B1B" },
};

async function generateExcel(tickets: Ticket[], params: URLSearchParams): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Acceleron Project+";
  wb.created = new Date();

  // ── Sheet 1: All Tickets ────────────────────────────────────────────

  const ws = wb.addWorksheet("All Tickets", {
    views: [{ state: "frozen", ySplit: 2 }],
    properties: { defaultRowHeight: 22 },
  });

  // Title row
  ws.mergeCells("A1:P1");
  const titleCell = ws.getCell("A1");
  const dateRange =
    params.get("dateFrom") || params.get("dateTo")
      ? ` (${fmtDate(params.get("dateFrom") ?? undefined)} – ${fmtDate(params.get("dateTo") ?? undefined)})`
      : "";
  titleCell.value = `Acceleron ITSM — Ticket Export Report${dateRange}`;
  titleCell.font = { size: 14, bold: true, color: { argb: "FF1E3A5F" } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F0FE" } };
  titleCell.alignment = { vertical: "middle", horizontal: "center" };
  ws.getRow(1).height = 30;

  // Headers
  const headers = [
    { header: "Ticket #", key: "num", width: 16 },
    { header: "Type", key: "type", width: 16 },
    { header: "Subject", key: "subject", width: 40 },
    { header: "Status", key: "status", width: 14 },
    { header: "Priority", key: "priority", width: 12 },
    { header: "Source", key: "source", width: 12 },
    { header: "Requester", key: "requester", width: 22 },
    { header: "Requester Email", key: "reqEmail", width: 26 },
    { header: "Assigned Agent", key: "agent", width: 22 },
    { header: "Project Code", key: "project", width: 14 },
    { header: "Project Phase", key: "phase", width: 16 },
    { header: "Overdue?", key: "overdue", width: 10 },
    { header: "Created At", key: "created", width: 20 },
    { header: "Resolved At", key: "resolved", width: 20 },
    { header: "Closed At", key: "closed", width: 20 },
    { header: "Description", key: "desc", width: 50 },
  ];

  ws.columns = headers.map((h) => ({ key: h.key, width: h.width }));
  const headerRow = ws.getRow(2);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h.header;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: false };
    cell.border = { bottom: { style: "thin", color: { argb: "FFB0C4DE" } } };
  });
  headerRow.height = 28;

  // Data rows
  tickets.forEach((t, idx) => {
    const row = ws.addRow([
      t.ticketNumber,
      capitalize(fmt(t.ticketType)),
      fmt(t.subject),
      capitalize(fmt(t.status)),
      capitalize(fmt(t.priority)),
      capitalize(fmt(t.source)),
      t.requester
        ? `${t.requester.firstName || ""} ${t.requester.lastName || ""}`.trim()
        : "",
      fmt(t.requester?.email),
      fmt(t.agent?.fullName),
      fmt(t.projectCode),
      fmt(t.projectPhase),
      t.isOverdue ? "Yes" : "No",
      fmtDateTime(t.createdAt),
      fmtDateTime(t.resolvedAt),
      fmtDateTime(t.closedAt),
      fmt(t.description),
    ]);

    row.height = 20;

    // Zebra striping
    const bgColor = idx % 2 === 0 ? "FFFFFFFF" : "FFF5F7FA";

    row.eachCell((cell, colNum) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgColor } };
      cell.font = { size: 10 };
      cell.alignment = { vertical: "middle", wrapText: colNum === 16 };
      cell.border = {
        bottom: { style: "hair", color: { argb: "FFE2E8F0" } },
      };
    });

    // Priority cell coloring (col 5)
    const pc = PRIORITY_COLORS[t.priority || ""] || PRIORITY_COLORS.medium;
    const priCell = row.getCell(5);
    priCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + pc.bg } };
    priCell.font = { size: 10, bold: true, color: { argb: "FF" + pc.fg } };

    // Status cell coloring (col 4)
    const sc = STATUS_COLORS[t.status || ""] || STATUS_COLORS.new;
    const statCell = row.getCell(4);
    statCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + sc.bg } };
    statCell.font = { size: 10, bold: true, color: { argb: "FF" + sc.fg } };

    // Overdue cell (col 12)
    if (t.isOverdue) {
      const ovCell = row.getCell(12);
      ovCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };
      ovCell.font = { size: 10, bold: true, color: { argb: "FF991B1B" } };
    }
  });

  // AutoFilter on headers
  ws.autoFilter = { from: "A2", to: `P${tickets.length + 2}` };

  // ── Sheet 2: Summary Stats ──────────────────────────────────────────

  const ws2 = wb.addWorksheet("Summary");
  ws2.getColumn("A").width = 28;
  ws2.getColumn("B").width = 18;

  const addSection = (title: string, data: [string, number][]) => {
    const titleRow = ws2.addRow([title]);
    titleRow.getCell(1).font = { bold: true, size: 12, color: { argb: "FF1E3A5F" } };
    titleRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F0FE" } };
    ws2.mergeCells(`A${titleRow.number}:B${titleRow.number}`);
    titleRow.height = 24;

    const hRow = ws2.addRow(["Category", "Count"]);
    hRow.eachCell((c) => {
      c.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF374151" } };
      c.alignment = { horizontal: "center" };
    });

    data.forEach(([label, count]) => {
      const r = ws2.addRow([label, count]);
      r.getCell(2).alignment = { horizontal: "center" };
      r.getCell(2).font = { bold: true };
    });

    ws2.addRow([]);
  };

  ws2.addRow([]);
  ws2.addRow(["ITSM Report — Summary Statistics"]).getCell(1).font = {
    bold: true, size: 14, color: { argb: "FF1E3A5F" },
  };
  ws2.addRow([`Generated: ${new Date().toLocaleString("en-IN")}`]).getCell(1).font = {
    italic: true, size: 10, color: { argb: "FF6B7280" },
  };
  ws2.addRow([`Total Tickets in Report: ${tickets.length}`]).getCell(1).font = {
    bold: true, size: 11,
  };
  ws2.addRow([]);

  const countBy = <K extends string>(arr: Ticket[], fn: (t: Ticket) => K | undefined) => {
    const counts: Record<string, number> = {};
    arr.forEach((t) => {
      const k = fn(t) ?? "Unknown";
      counts[k] = (counts[k] || 0) + 1;
    });
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .map(([k, v]) => [capitalize(k), v] as [string, number]);
  };

  addSection("By Status", countBy(tickets, (t) => t.status));
  addSection("By Priority", countBy(tickets, (t) => t.priority));
  addSection("By Ticket Type", countBy(tickets, (t) => t.ticketType));
  addSection("By Source", countBy(tickets, (t) => t.source));
  addSection("By Project", countBy(tickets, (t) => t.projectCode || "Unlinked"));

  // ── Sheet 3: Overdue Tickets ────────────────────────────────────────

  const ws3 = wb.addWorksheet("Overdue Tickets");
  const overdue = tickets.filter((t) => t.isOverdue);

  ws3.mergeCells("A1:H1");
  ws3.getCell("A1").value = `Overdue Tickets — ${overdue.length} tickets`;
  ws3.getCell("A1").font = { bold: true, size: 13, color: { argb: "FF991B1B" } };
  ws3.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };
  ws3.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
  ws3.getRow(1).height = 28;

  const od2 = ws3.getRow(2);
  ["Ticket #", "Subject", "Status", "Priority", "Requester", "Agent", "Project", "Created At"].forEach(
    (h, i) => {
      const c = od2.getCell(i + 1);
      c.value = h;
      c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF991B1B" } };
      c.alignment = { horizontal: "center", vertical: "middle" };
    }
  );
  ws3.getRow(2).height = 24;
  ws3.columns = [
    { width: 16 }, { width: 40 }, { width: 14 }, { width: 12 },
    { width: 22 }, { width: 22 }, { width: 14 }, { width: 20 },
  ];

  overdue.forEach((t) => {
    const row = ws3.addRow([
      t.ticketNumber,
      t.subject,
      capitalize(fmt(t.status)),
      capitalize(fmt(t.priority)),
      t.requester ? `${t.requester.firstName || ""} ${t.requester.lastName || ""}`.trim() : "",
      fmt(t.agent?.fullName),
      fmt(t.projectCode),
      fmtDateTime(t.createdAt),
    ]);
    row.height = 20;
    row.getCell(4).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF" + (PRIORITY_COLORS[t.priority || ""] || PRIORITY_COLORS.medium).bg },
    };
  });

  // ── Sheet 4: Resolved & Closed ──────────────────────────────────────

  const ws4 = wb.addWorksheet("Resolved & Closed");
  const resolved = tickets.filter((t) => t.status === "resolved" || t.status === "closed");

  ws4.mergeCells("A1:F1");
  ws4.getCell("A1").value = `Resolved & Closed — ${resolved.length} tickets`;
  ws4.getCell("A1").font = { bold: true, size: 13, color: { argb: "FF065F46" } };
  ws4.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD1FAE5" } };
  ws4.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
  ws4.getRow(1).height = 28;

  const rv2 = ws4.getRow(2);
  ["Ticket #", "Subject", "Requester", "Agent", "Resolved At", "Closed At"].forEach((h, i) => {
    const c = rv2.getCell(i + 1);
    c.value = h;
    c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF065F46" } };
    c.alignment = { horizontal: "center", vertical: "middle" };
  });
  ws4.getRow(2).height = 24;
  ws4.columns = [{ width: 16 }, { width: 40 }, { width: 22 }, { width: 22 }, { width: 20 }, { width: 20 }];

  resolved.forEach((t) => {
    const row = ws4.addRow([
      t.ticketNumber,
      t.subject,
      t.requester ? `${t.requester.firstName || ""} ${t.requester.lastName || ""}`.trim() : "",
      fmt(t.agent?.fullName),
      fmtDateTime(t.resolvedAt),
      fmtDateTime(t.closedAt),
    ]);
    row.height = 20;
  });

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

// ─── PDF generator ─────────────────────────────────────────────────────────

async function generatePDF(tickets: Ticket[], params: URLSearchParams): Promise<Buffer> {
  // Build a styled HTML string, then render via browser print (server-side)
  // Since we can't run a browser headlessly without puppeteer (not installed),
  // we produce a well-formatted HTML file that the browser can print to PDF.
  // The route returns it as text/html with a print-on-load script.
  
  const dateRange =
    params.get("dateFrom") || params.get("dateTo")
      ? `${fmtDate(params.get("dateFrom") ?? undefined)} – ${fmtDate(params.get("dateTo") ?? undefined)}`
      : "All Time";

  const totalCount = tickets.length;
  const overdueCount = tickets.filter((t) => t.isOverdue).length;
  const resolvedCount = tickets.filter((t) => t.status === "resolved" || t.status === "closed").length;
  const openCount = tickets.filter((t) => t.status === "new" || t.status === "open").length;

  const byStatus: Record<string, number> = {};
  const byPriority: Record<string, number> = {};
  const byType: Record<string, number> = {};
  tickets.forEach((t) => {
    byStatus[t.status] = (byStatus[t.status] || 0) + 1;
    byPriority[t.priority || "unknown"] = (byPriority[t.priority || "unknown"] || 0) + 1;
    byType[t.ticketType] = (byType[t.ticketType] || 0) + 1;
  });

  const priorityRow = (p: string, clr: string) =>
    byPriority[p]
      ? `<tr><td style="padding:6px 12px;">${capitalize(p)}</td><td style="padding:6px 12px;text-align:center;"><span style="background:${clr};padding:2px 10px;border-radius:12px;font-weight:700;">${byPriority[p]}</span></td></tr>`
      : "";

  const tableRows = tickets
    .slice(0, 200)
    .map(
      (t, i) => `
    <tr style="background:${i % 2 === 0 ? "#fff" : "#F8FAFC"}">
      <td style="padding:7px 10px;font-family:monospace;font-weight:700;font-size:11px;">${t.ticketNumber}</td>
      <td style="padding:7px 10px;font-size:11px;">${t.subject.slice(0, 60)}${t.subject.length > 60 ? "..." : ""}</td>
      <td style="padding:7px 10px;text-align:center;">
        <span style="background:${STATUS_COLORS[t.status]?.bg ? "#" + STATUS_COLORS[t.status].bg : "#E5E7EB"};color:${STATUS_COLORS[t.status]?.fg ? "#" + STATUS_COLORS[t.status].fg : "#374151"};padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;">${capitalize(fmt(t.status))}</span>
      </td>
      <td style="padding:7px 10px;text-align:center;">
        <span style="background:${PRIORITY_COLORS[t.priority || ""]?.bg ? "#" + PRIORITY_COLORS[t.priority || ""].bg : "#FEF3C7"};color:${PRIORITY_COLORS[t.priority || ""]?.fg ? "#" + PRIORITY_COLORS[t.priority || ""].fg : "#92400E"};padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;">${capitalize(fmt(t.priority))}</span>
      </td>
      <td style="padding:7px 10px;font-size:11px;">${fmt(t.agent?.fullName) || "—"}</td>
      <td style="padding:7px 10px;font-size:11px;font-family:monospace;">${fmt(t.projectCode) || "—"}</td>
      <td style="padding:7px 10px;font-size:10px;color:#6B7280;">${fmtDate(t.createdAt)}</td>
      <td style="padding:7px 10px;text-align:center;font-size:11px;font-weight:700;color:${t.isOverdue ? "#DC2626" : "#6B7280"};">${t.isOverdue ? "⚠ Yes" : "No"}</td>
    </tr>`
    )
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>ITSM Report — Acceleron Project+</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', Arial, sans-serif; background: #fff; color: #111827; }
    @media print {
      @page { size: A4 landscape; margin: 12mm; }
      .no-print { display: none !important; }
      body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    }
    .cover { background: linear-gradient(135deg, #1E3A5F 0%, #1a56db 100%); color: #fff; padding: 48px 56px; border-radius: 0 0 32px 32px; margin-bottom: 32px; }
    .cover h1 { font-size: 28px; font-weight: 900; letter-spacing: -0.5px; }
    .cover p { margin-top: 6px; opacity: 0.8; font-size: 14px; }
    .cover .meta { margin-top: 24px; display: flex; gap: 32px; flex-wrap: wrap; }
    .cover .meta-item { background: rgba(255,255,255,0.12); border-radius: 12px; padding: 12px 20px; }
    .cover .meta-item .label { font-size: 11px; opacity: 0.7; text-transform: uppercase; letter-spacing: 0.05em; }
    .cover .meta-item .value { font-size: 24px; font-weight: 900; margin-top: 2px; }
    .section { padding: 0 40px; margin-bottom: 32px; }
    .section-title { font-size: 16px; font-weight: 800; color: #1E3A5F; border-left: 4px solid #1a56db; padding-left: 12px; margin-bottom: 16px; }
    .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 32px; padding: 0 40px; }
    .stat-card { border: 1px solid #E5E7EB; border-radius: 12px; padding: 16px; }
    .stat-card .s-label { font-size: 11px; color: #6B7280; text-transform: uppercase; letter-spacing: 0.05em; }
    .stat-card .s-value { font-size: 28px; font-weight: 900; color: #1E3A5F; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; }
    table thead tr { background: #1E3A5F; }
    table thead th { padding: 10px 10px; color: #fff; font-size: 11px; font-weight: 700; text-align: left; text-transform: uppercase; letter-spacing: 0.04em; }
    table tbody tr:hover { background: #EFF6FF !important; }
    table { border-radius: 12px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
    .summary-tables { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; padding: 0 40px; margin-bottom: 32px; }
    .summary-table th { background:#374151; color:#fff; padding:8px 12px; font-size:11px; }
    .summary-table td { padding:6px 12px; border-bottom:1px solid #F3F4F6; font-size:12px; }
    .footer { text-align: center; font-size: 11px; color: #9CA3AF; padding: 24px 40px; border-top: 1px solid #F3F4F6; }
    .print-btn { position: fixed; bottom: 24px; right: 24px; background: #1a56db; color: #fff; border: none; padding: 12px 24px; border-radius: 12px; font-weight: 700; font-size: 14px; cursor: pointer; box-shadow: 0 4px 12px rgba(26,86,219,0.4); z-index: 100; }
  </style>
</head>
<body>
  <div class="cover">
    <h1>ITSM Ticket Report</h1>
    <p>Acceleron Project+ — Service Desk &amp; Support Queue</p>
    <div class="meta">
      <div class="meta-item">
        <div class="label">Period</div>
        <div class="value" style="font-size:16px;margin-top:4px;">${dateRange}</div>
      </div>
      <div class="meta-item">
        <div class="label">Total Tickets</div>
        <div class="value">${totalCount}</div>
      </div>
      <div class="meta-item">
        <div class="label">Open / New</div>
        <div class="value">${openCount}</div>
      </div>
      <div class="meta-item">
        <div class="label">Overdue</div>
        <div class="value" style="color:#FCA5A5;">${overdueCount}</div>
      </div>
      <div class="meta-item">
        <div class="label">Resolved &amp; Closed</div>
        <div class="value" style="color:#6EE7B7;">${resolvedCount}</div>
      </div>
      <div class="meta-item">
        <div class="label">Generated</div>
        <div class="value" style="font-size:13px;margin-top:4px;">${new Date().toLocaleString("en-IN")}</div>
      </div>
    </div>
  </div>

  <div class="summary-tables">
    <div>
      <div class="section-title" style="margin-bottom:8px;">By Status</div>
      <table class="summary-table">
        <thead><tr><th>Status</th><th>Count</th></tr></thead>
        <tbody>
          ${Object.entries(byStatus).sort(([,a],[,b])=>b-a).map(([k,v])=>`<tr><td>${capitalize(k)}</td><td style="text-align:center;font-weight:700;">${v}</td></tr>`).join("")}
        </tbody>
      </table>
    </div>
    <div>
      <div class="section-title" style="margin-bottom:8px;">By Priority</div>
      <table class="summary-table">
        <thead><tr><th>Priority</th><th>Count</th></tr></thead>
        <tbody>
          ${priorityRow("urgent","#FFBCBC")}
          ${priorityRow("high","#FED7AA")}
          ${priorityRow("medium","#FEF3C7")}
          ${priorityRow("low","#D1FAE5")}
        </tbody>
      </table>
    </div>
    <div>
      <div class="section-title" style="margin-bottom:8px;">By Type</div>
      <table class="summary-table">
        <thead><tr><th>Type</th><th>Count</th></tr></thead>
        <tbody>
          ${Object.entries(byType).sort(([,a],[,b])=>b-a).map(([k,v])=>`<tr><td>${capitalize(k)}</td><td style="text-align:center;font-weight:700;">${v}</td></tr>`).join("")}
        </tbody>
      </table>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Ticket List ${tickets.length > 200 ? `(showing first 200 of ${tickets.length})` : ""}</div>
    <table>
      <thead>
        <tr>
          <th>Ticket #</th><th>Subject</th><th>Status</th><th>Priority</th>
          <th>Agent</th><th>Project</th><th>Created</th><th>Overdue?</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
  </div>

  <div class="footer">
    Acceleron Project+ — ITSM Report · ${new Date().toLocaleString("en-IN")} · ${totalCount} tickets
  </div>

  <button class="print-btn no-print" onclick="window.print()">🖨 Print / Save PDF</button>
  <script>
    // Auto-open print dialog after a short delay for direct "Save as PDF" flow
    window.addEventListener("load", () => {
      const url = new URL(window.location.href);
      if (url.searchParams.get("autoprint") === "1") {
        setTimeout(() => window.print(), 800);
      }
    });
  </script>
</body>
</html>`;

  return Buffer.from(html, "utf-8");
}

// ─── Main handler ──────────────────────────────────────────────────────────

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const format = (searchParams.get("format") || "csv").toLowerCase();

    if (!["csv", "xlsx", "pdf"].includes(format)) {
      return NextResponse.json({ error: "format must be csv, xlsx, or pdf" }, { status: 400 });
    }

    // Fetch all tickets then filter
    const allTickets = await getTickets({
      projectCode: searchParams.get("projectCode") === "all" ? undefined : (searchParams.get("projectCode") ?? undefined),
    });
    const tickets = filterTickets(allTickets, searchParams);

    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `ITSM-Report-${timestamp}`;

    if (format === "csv") {
      const csv = generateCSV(tickets);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }

    if (format === "xlsx") {
      const buf = await generateExcel(tickets, searchParams);
      return new NextResponse(new Uint8Array(buf), {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${filename}.xlsx"`,
          "Cache-Control": "no-store",
        },
      });
    }

    // PDF (returns HTML for browser print)
    const buf = await generatePDF(tickets, searchParams);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `inline; filename="${filename}.html"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    console.error("ITSM export failed:", err);
    return NextResponse.json({ error: err.message || "Export failed" }, { status: 500 });
  }
}