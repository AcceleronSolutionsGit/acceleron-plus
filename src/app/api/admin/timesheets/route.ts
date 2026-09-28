// GET  /api/admin/timesheets  — Excel / CSV bulk export of timesheets
//
// Admins export all timesheets across the company.
// Reporting managers export only their direct reports' timesheets.
// Multi-sheet Excel (Detailed entries, By Project, By Employee, Overall Summary)
// or CSV export with auto-filters and status highlighting.

import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { projectDb, identityDb } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { toDateInput } from "@/lib/dates";
import { directReportUserIds } from "@/lib/reportees";

export const runtime = "nodejs";

const NAVY   = "FF212F60";
const LIGHT  = "FFF5F6F8";
const GREEN  = "FFE8F5E9";
const AMBER  = "FFFFF8E1";
const RED    = "FFFFEBEE";
const BLUE   = "FFE3F2FD";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function titleCase(v: string | null | undefined): string {
  if (!v) return "";
  return v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtDate(v: unknown): string {
  if (!v) return "";
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-");
    return `${d}/${m}/${y}`;
  }
  try {
    const dt = new Date(s);
    if (!isNaN(dt.getTime())) {
      return `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}/${dt.getFullYear()}`;
    }
  } catch { /* ignore */ }
  return s;
}

function rowFill(status: string): string | null {
  switch (status) {
    case "approved": return GREEN;
    case "rejected": return RED;
    case "submitted": return BLUE;
    case "draft": return AMBER;
    default: return null;
  }
}

function escapeCsv(val: unknown): string {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

export async function GET(req: Request) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;
    const isAdmin = auth.session.role === "admin";
    const userId = auth.session.userId;

    // Resolve which user IDs this caller may see.
    // Admins: everyone. Managers: only their direct reports.
    let allowedUserIds: string[] | null = null;
    if (!isAdmin) {
      allowedUserIds = await directReportUserIds(userId);
      if (allowedUserIds.length === 0) {
        return NextResponse.json({ error: "You have no direct reports to export." }, { status: 403 });
      }
    }

    const url = new URL(req.url);
    const statusFilter = url.searchParams.get("status") || "";
    const projectFilter = url.searchParams.get("project") || "";
    const userFilter = url.searchParams.get("user") || url.searchParams.get("userId") || "";
    const fromDate = url.searchParams.get("from") || "";
    const toDate = url.searchParams.get("to") || "";
    const format = (url.searchParams.get("format") || "xlsx").toLowerCase();

    let query = projectDb("project_timesheets as ts")
      .join("projects as p", "p.id", "ts.project_id")
      .select(
        "ts.id",
        "ts.user_id",
        "ts.user_name",
        "p.code as project_code",
        "p.name as project_name",
        "ts.log_date",
        "ts.hours_logged",
        "ts.activity_type",
        "ts.notes",
        "ts.status",
        "ts.submitted_at",
        "ts.reviewed_at",
        "ts.reviewed_by_user_id",
        "ts.rejection_reason"
      )
      .orderBy([{ column: "ts.log_date", order: "asc" }, { column: "ts.user_name", order: "asc" }]);

    if (allowedUserIds !== null) {
      if (userFilter) {
        if (!allowedUserIds.includes(userFilter)) {
          return NextResponse.json({ error: "You cannot export this user's timesheets." }, { status: 403 });
        }
        query = query.where("ts.user_id", userFilter);
      } else {
        query = query.whereIn("ts.user_id", allowedUserIds);
      }
    } else if (userFilter) {
      query = query.where("ts.user_id", userFilter);
    }

    if (statusFilter && statusFilter !== "all") query = query.where("ts.status", statusFilter);
    if (projectFilter) query = query.where("ts.project_id", projectFilter);
    if (fromDate) query = query.where("ts.log_date", ">=", fromDate);
    if (toDate) query = query.where("ts.log_date", "<=", toDate);

    const rows = (await query.catch(() => [])) as Record<string, unknown>[];

    // User details lookup (employee_id, email, full_name)
    const userIds = [...new Set(rows.map((r) => String(r.user_id ?? "")).filter(Boolean))];
    const reviewerIds = [...new Set(rows.map((r) => String(r.reviewed_by_user_id ?? "")).filter(Boolean))];
    const allUserIds = [...new Set([...userIds, ...reviewerIds])];

    const userMap = new Map<string, { email: string; fullName: string; employeeId: string }>();
    if (allUserIds.length > 0) {
      const users = (await identityDb("users")
        .whereIn("id", allUserIds)
        .select("id", "email", "full_name", "darwinbox_ref")
        .catch(() => [])) as Record<string, unknown>[];

      const emails = users.map((u) => String(u.email ?? "").toLowerCase()).filter(Boolean);
      const employees = emails.length > 0 ? ((await identityDb("employee_master")
        .whereRaw("lower(company_email_id) = ANY(?)", [emails])
        .select("company_email_id", "employee_id")
        .catch(() => [])) as Record<string, unknown>[]) : [];

      const empByEmail = new Map<string, string>();
      for (const e of employees) {
        empByEmail.set(String(e.company_email_id ?? "").toLowerCase(), String(e.employee_id ?? ""));
      }

      for (const u of users) {
        const email = String(u.email ?? "");
        const empId = empByEmail.get(email.toLowerCase()) || String(u.darwinbox_ref ?? "");
        userMap.set(String(u.id), {
          email,
          fullName: String(u.full_name ?? ""),
          employeeId: empId,
        });
      }
    }

    // ── CSV Format ─────────────────────────────────────────────────
    if (format === "csv") {
      const headers = [
        "Timesheet ID",
        "Employee ID",
        "Employee Name",
        "Employee Email",
        "Project Code",
        "Project Name",
        "Log Date",
        "Day",
        "Hours Logged",
        "Activity Type",
        "Status",
        "Notes",
        "Submitted At",
        "Reviewed By",
        "Reviewed At",
        "Rejection Reason",
      ];

      const csvLines: string[] = [headers.join(",")];

      for (const r of rows) {
        const uInfo = userMap.get(String(r.user_id ?? "")) || { email: "", fullName: "", employeeId: "" };
        const reviewer = userMap.get(String(r.reviewed_by_user_id ?? ""));
        const logDateStr = toDateInput(r.log_date as string);
        let dayName = "";
        try {
          const [y, mo, d] = logDateStr.split("-").map(Number);
          const dt = new Date(y, mo - 1, d);
          dayName = DAY_NAMES[dt.getDay()];
        } catch { /* ignore */ }

        const submittedAt = r.submitted_at ? new Date(String(r.submitted_at)).toISOString() : "";
        const reviewedAt = r.reviewed_at ? new Date(String(r.reviewed_at)).toISOString() : "";

        const line = [
          escapeCsv(r.id),
          escapeCsv(uInfo.employeeId),
          escapeCsv(r.user_name || uInfo.fullName),
          escapeCsv(uInfo.email),
          escapeCsv(r.project_code),
          escapeCsv(r.project_name),
          escapeCsv(fmtDate(logDateStr)),
          escapeCsv(dayName),
          Number(r.hours_logged ?? 0).toFixed(2),
          escapeCsv(titleCase(String(r.activity_type ?? ""))),
          escapeCsv(titleCase(String(r.status ?? "draft"))),
          escapeCsv(r.notes ?? ""),
          escapeCsv(submittedAt),
          escapeCsv(reviewer?.fullName ?? ""),
          escapeCsv(reviewedAt),
          escapeCsv(r.rejection_reason ?? ""),
        ].join(",");

        csvLines.push(line);
      }

      const csvContent = csvLines.join("\r\n");
      const filename = `timesheets_${new Date().toISOString().slice(0, 10)}.csv`;

      return new NextResponse(csvContent, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    // ── Excel (.xlsx) Format ───────────────────────────────────────
    const wb = new ExcelJS.Workbook();
    wb.creator = "Acceleron Plus";
    wb.created = new Date();

    // ── Sheet 1: Detailed Timesheet Entries ────────────────────────
    const ws = wb.addWorksheet("Timesheets");

    ws.columns = [
      { header: "Timesheet ID",    key: "id",          width: 36 },
      { header: "Employee ID",     key: "emp_id",      width: 14 },
      { header: "Employee Name",   key: "user_name",   width: 26 },
      { header: "Email",           key: "email",       width: 28 },
      { header: "Project Code",    key: "proj_code",   width: 14 },
      { header: "Project Name",    key: "proj_name",   width: 36 },
      { header: "Log Date",        key: "log_date",    width: 14 },
      { header: "Day",             key: "day",         width: 8  },
      { header: "Hours",           key: "hours",       width: 12 },
      { header: "Activity Type",   key: "activity",    width: 18 },
      { header: "Status",          key: "status",      width: 14 },
      { header: "Notes",           key: "notes",       width: 40 },
      { header: "Submitted At",    key: "submitted_at",width: 20 },
      { header: "Reviewed By",     key: "reviewed_by", width: 24 },
      { header: "Reviewed At",     key: "reviewed_at", width: 20 },
      { header: "Rejection Reason",key: "rejection",   width: 36 },
    ];

    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11, name: "Calibri" };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };
    headerRow.height = 24;
    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.autoFilter = { from: "A1", to: "P1" };

    let rowIdx = 2;
    for (const r of rows) {
      const uInfo = userMap.get(String(r.user_id ?? "")) || { email: "", fullName: "", employeeId: "" };
      const reviewer = userMap.get(String(r.reviewed_by_user_id ?? ""));
      const logDateStr = toDateInput(r.log_date as string);
      let dayName = "";
      try {
        const [y, mo, d] = logDateStr.split("-").map(Number);
        const dt = new Date(y, mo - 1, d);
        dayName = DAY_NAMES[dt.getDay()];
      } catch { /* ignore */ }

      const status = String(r.status ?? "draft");
      const submittedAt = r.submitted_at
        ? new Date(String(r.submitted_at)).toLocaleString("en-IN")
        : "";
      const reviewedAt = r.reviewed_at
        ? new Date(String(r.reviewed_at)).toLocaleString("en-IN")
        : "";

      const dataRow = ws.addRow({
        id:           String(r.id),
        emp_id:       uInfo.employeeId,
        user_name:    r.user_name ? String(r.user_name) : uInfo.fullName,
        email:        uInfo.email,
        proj_code:    String(r.project_code),
        proj_name:    String(r.project_name),
        log_date:     fmtDate(logDateStr),
        day:          dayName,
        hours:        Number(r.hours_logged ?? 0),
        activity:     titleCase(String(r.activity_type ?? "")),
        status:       titleCase(status),
        notes:        r.notes ? String(r.notes) : "",
        submitted_at: submittedAt,
        reviewed_by:  reviewer?.fullName ?? "",
        reviewed_at:  reviewedAt,
        rejection:    r.rejection_reason ? String(r.rejection_reason) : "",
      });

      const fill = rowFill(status);
      if (fill) {
        dataRow.eachCell({ includeEmpty: false }, (cell) => {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
        });
      } else if (rowIdx % 2 === 0) {
        dataRow.eachCell({ includeEmpty: true }, (cell) => {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT } };
        });
      }

      dataRow.getCell("hours").alignment = { horizontal: "right" };
      dataRow.getCell("hours").numFmt = '0.00" h"';
      rowIdx++;
    }

    // ── Sheet 2: Summary By Project ────────────────────────────────
    const wsProject = wb.addWorksheet("By Project");
    wsProject.columns = [
      { header: "Project Code",    key: "code",           width: 16 },
      { header: "Project Name",    key: "name",           width: 38 },
      { header: "Total Entries",   key: "entries",        width: 14 },
      { header: "Total Hours",     key: "total_hours",    width: 16 },
      { header: "Approved Hours",  key: "approved_hours", width: 16 },
      { header: "Pending Hours",   key: "pending_hours",  width: 16 },
      { header: "Contributors",    key: "contributors",   width: 14 },
    ];
    const ph = wsProject.getRow(1);
    ph.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    ph.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    ph.height = 24;
    wsProject.views = [{ state: "frozen", ySplit: 1 }];

    const projStats = new Map<string, {
      code: string;
      name: string;
      entries: number;
      totalHours: number;
      approvedHours: number;
      pendingHours: number;
      users: Set<string>;
    }>();

    for (const r of rows) {
      const pcode = String(r.project_code);
      const curr = projStats.get(pcode) || {
        code: pcode,
        name: String(r.project_name),
        entries: 0,
        totalHours: 0,
        approvedHours: 0,
        pendingHours: 0,
        users: new Set<string>(),
      };
      const hrs = Number(r.hours_logged ?? 0);
      curr.entries++;
      curr.totalHours += hrs;
      if (r.status === "approved") curr.approvedHours += hrs;
      if (r.status === "submitted") curr.pendingHours += hrs;
      if (r.user_id) curr.users.add(String(r.user_id));
      projStats.set(pcode, curr);
    }

    for (const p of projStats.values()) {
      const pr = wsProject.addRow({
        code:           p.code,
        name:           p.name,
        entries:        p.entries,
        total_hours:    Number(p.totalHours.toFixed(2)),
        approved_hours: Number(p.approvedHours.toFixed(2)),
        pending_hours:  Number(p.pendingHours.toFixed(2)),
        contributors:   p.users.size,
      });
      pr.getCell("total_hours").numFmt = '0.00" h"';
      pr.getCell("approved_hours").numFmt = '0.00" h"';
      pr.getCell("pending_hours").numFmt = '0.00" h"';
    }

    // ── Sheet 3: Summary By Employee ───────────────────────────────
    const wsEmp = wb.addWorksheet("By Employee");
    wsEmp.columns = [
      { header: "Employee ID",     key: "emp_id",         width: 14 },
      { header: "Employee Name",   key: "name",           width: 28 },
      { header: "Email",           key: "email",          width: 30 },
      { header: "Total Entries",   key: "entries",        width: 14 },
      { header: "Total Hours",     key: "total_hours",    width: 16 },
      { header: "Approved Hours",  key: "approved_hours", width: 16 },
      { header: "Pending Hours",   key: "pending_hours",  width: 16 },
      { header: "Projects Count",  key: "projects",       width: 16 },
    ];
    const eh = wsEmp.getRow(1);
    eh.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    eh.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    eh.height = 24;
    wsEmp.views = [{ state: "frozen", ySplit: 1 }];

    const empStats = new Map<string, {
      empId: string;
      name: string;
      email: string;
      entries: number;
      totalHours: number;
      approvedHours: number;
      pendingHours: number;
      projects: Set<string>;
    }>();

    for (const r of rows) {
      const uid = String(r.user_id ?? "");
      const uInfo = userMap.get(uid) || { email: "", fullName: "", employeeId: "" };
      const uname = String(r.user_name || uInfo.fullName || "Unknown");
      const curr = empStats.get(uid) || {
        empId: uInfo.employeeId,
        name: uname,
        email: uInfo.email,
        entries: 0,
        totalHours: 0,
        approvedHours: 0,
        pendingHours: 0,
        projects: new Set<string>(),
      };
      const hrs = Number(r.hours_logged ?? 0);
      curr.entries++;
      curr.totalHours += hrs;
      if (r.status === "approved") curr.approvedHours += hrs;
      if (r.status === "submitted") curr.pendingHours += hrs;
      if (r.project_code) curr.projects.add(String(r.project_code));
      empStats.set(uid, curr);
    }

    for (const e of empStats.values()) {
      const er = wsEmp.addRow({
        emp_id:         e.empId,
        name:           e.name,
        email:          e.email,
        entries:        e.entries,
        total_hours:    Number(e.totalHours.toFixed(2)),
        approved_hours: Number(e.approvedHours.toFixed(2)),
        pending_hours:  Number(e.pendingHours.toFixed(2)),
        projects:       e.projects.size,
      });
      er.getCell("total_hours").numFmt = '0.00" h"';
      er.getCell("approved_hours").numFmt = '0.00" h"';
      er.getCell("pending_hours").numFmt = '0.00" h"';
    }

    // ── Sheet 4: Executive Summary ─────────────────────────────────
    const summary = wb.addWorksheet("Summary");
    summary.columns = [
      { header: "Metric",  key: "metric",  width: 32 },
      { header: "Value",   key: "value",   width: 24 },
    ];
    const totalHours = rows.reduce((s, r) => s + Number(r.hours_logged ?? 0), 0);
    const byStatus = rows.reduce<Record<string, number>>((acc, r) => {
      const s = String(r.status ?? "draft");
      acc[s] = (acc[s] ?? 0) + 1;
      return acc;
    }, {});

    const summaryRows: [string, string | number][] = [
      ["Total Timesheet Entries", rows.length],
      ["Total Hours Logged", `${totalHours.toFixed(2)} hrs`],
      ["Draft Entries", byStatus["draft"] ?? 0],
      ["Submitted (Pending Approval)", byStatus["submitted"] ?? 0],
      ["Approved Entries", byStatus["approved"] ?? 0],
      ["Rejected Entries", byStatus["rejected"] ?? 0],
      ["Total Projects Involved", projStats.size],
      ["Total Employees Contributing", empStats.size],
      ["Date Range Filter", fromDate || toDate ? `${fromDate || "Start"} to ${toDate || "End"}` : "All Time"],
      ["Status Filter", statusFilter || "All"],
      ["Export Generated At", new Date().toLocaleString("en-IN")],
      ["Export Generated By", `${auth.session.fullName || "User"} (${isAdmin ? "Admin" : "Reporting Manager"})`],
    ];
    summaryRows.forEach(([metric, value]) => summary.addRow({ metric, value }));
    const sh = summary.getRow(1);
    sh.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    sh.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    sh.height = 24;
    summary.getColumn("metric").font = { bold: true };

    const buffer = await wb.xlsx.writeBuffer();
    const filename = `timesheets_${new Date().toISOString().slice(0, 10)}.xlsx`;

    return new NextResponse(Buffer.from(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error("admin.timesheets.export", err);
    return NextResponse.json({ error: "Export failed." }, { status: 500 });
  }
}
