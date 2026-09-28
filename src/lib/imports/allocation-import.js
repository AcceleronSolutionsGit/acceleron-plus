// ═══════════════════════════════════════════════════════════════
// Bringing a Microsoft Forms response sheet into project_team_members.
//
// One response is one person on one project: the employee, the
// project, the role, the percentage and the window. Somebody on three
// projects submits the form three times, which is why there is no
// "Project 2" column anywhere in here — the shape of the sheet does
// not change with how busy anybody is.
//
// This file is plain CommonJS on purpose. The CLI (`node
// src/lib/imports/import-allocations.js`) and the admin upload route
// both need it, and a Next.js route can import CJS while a standalone
// `node` cannot import TypeScript. The database handles are passed in
// rather than imported so the same code runs against the app's pool
// and against a script's own connection.
//
// Nothing here writes until commitAllocationRows is called. Parsing
// and resolving are read-only, which is what makes the preview on the
// admin page honest: it is the same work the commit will do, minus
// the insert.
// ═══════════════════════════════════════════════════════════════

const ExcelJS = require("exceljs");
const { Readable } = require("stream");

// ─── The form ──────────────────────────────────────────────────────
//
// These labels are the question titles in Microsoft Forms, and Forms
// names each response column after its question. Keep them in step or
// the header match falls back to the looser `test` below.

const COLUMN_SPECS = [
  {
    key: "employee",
    label: "Employee (code and name)",
    required: true,
    aliases: ["employee", "employee code", "emp code", "employee name", "resource"],
    test: (h) => h.startsWith("employee") || h.startsWith("emp "),
  },
  {
    key: "project",
    label: "Project (code and name)",
    required: true,
    aliases: ["project", "project code", "project name"],
    test: (h) => h.startsWith("project"),
  },
  {
    key: "role",
    label: "Role on this project",
    required: false,
    aliases: ["role", "role in project"],
    test: (h) => h.startsWith("role"),
  },
  {
    key: "allocation",
    label: "Allocation % on this project",
    required: true,
    aliases: ["allocation", "allocation %", "allocation percent", "allocation percentage"],
    test: (h) =>
      h.startsWith("allocation") && (h.includes("%") || h.includes("percent")),
  },
  {
    key: "startDate",
    label: "Allocation start date",
    required: false,
    aliases: ["start date", "allocation start date", "from date"],
    // "Start time" is a column Forms adds by itself — it is when they
    // opened the form, not when the work starts. Requiring "date"
    // keeps the two apart.
    test: (h) => h.includes("start") && h.includes("date"),
  },
  {
    key: "endDate",
    label: "Allocation end date",
    required: false,
    aliases: ["end date", "allocation end date", "to date"],
    test: (h) => h.includes("end") && h.includes("date"),
  },
  {
    key: "notes",
    label: "Notes (optional)",
    required: false,
    aliases: ["notes", "note", "comments", "anything we should know"],
    test: (h) => h.startsWith("note") || h.startsWith("comment"),
  },
  {
    key: "submittedBy",
    label: "Email",
    required: false,
    aliases: ["email", "submitted by", "your email"],
    test: (h) => h === "email" || h.includes("submitted by"),
  },
  {
    key: "submittedAt",
    label: "Completion time",
    required: false,
    aliases: ["completion time", "submitted at"],
    test: (h) => h.includes("completion time"),
  },
];

/** The questions to build in Forms, in order, for the build sheet. */
const FORM_QUESTIONS = COLUMN_SPECS.filter(
  (c) => !["submittedBy", "submittedAt"].includes(c.key)
);

// ─── Small helpers ─────────────────────────────────────────────────

function normaliseHeader(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Pull a usable value out of whatever exceljs hands back for a cell. */
function readCell(cell) {
  const value = cell ? cell.value : null;
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    if (Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("");
    }
    if ("text" in value) return String(value.text ?? "");
    if ("result" in value) return value.result === null ? null : value.result;
    if ("error" in value) return null;
  }
  return String(value);
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

/**
 * A calendar date, as "YYYY-MM-DD".
 *
 * Returns null for an empty cell and `undefined` for something that
 * was filled in but cannot be read as a date — the caller needs to
 * tell those two apart, because one is fine and the other is a row
 * the importer must refuse.
 *
 * Forms exports dates in the form owner's locale, so 03/04 is
 * genuinely ambiguous. Where one component is above 12 the order
 * settles itself; where neither is, `dateOrder` decides, and it
 * defaults to day-first because that is what an Indian tenant will
 * have typed.
 */
function toDateString(value, dateOrder = "dmy") {
  if (value === null || value === undefined || value === "") return null;

  if (value instanceof Date) {
    return `${value.getUTCFullYear()}-${pad2(value.getUTCMonth() + 1)}-${pad2(
      value.getUTCDate()
    )}`;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    // An Excel serial: days since 1899-12-30, in UTC.
    const ms = Math.round((value - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return undefined;
    return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
  }

  const text = String(value).trim();
  if (!text) return null;

  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text);
  if (m) return `${m[1]}-${pad2(Number(m[2]))}-${pad2(Number(m[3]))}`;

  m = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})/.exec(text);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    let year = Number(m[3]);
    if (year < 100) year += 2000;
    let day;
    let month;
    if (a > 12) {
      day = a;
      month = b;
    } else if (b > 12) {
      month = a;
      day = b;
    } else if (dateOrder === "mdy") {
      month = a;
      day = b;
    } else {
      day = a;
      month = b;
    }
    if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
    return `${year}-${pad2(month)}-${pad2(day)}`;
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}-${pad2(parsed.getDate())}`;
  }
  return undefined;
}

/**
 * "EMP0042 — Rahul Sharma" into its two halves.
 *
 * The separator has to be spaced, so a hyphen inside a code
 * (PRJ-0001) or a name (Jean-Pierre) is left where it is.
 */
function splitLabelled(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return { code: "", rest: "", raw: text };
  const m = /^(.*?)\s+[—–\-|:]\s+(.*)$/.exec(text);
  if (m) return { code: m[1].trim(), rest: m[2].trim(), raw: text };
  return { code: text, rest: "", raw: text };
}

const DEAD_STATUSES = ["closed", "cancelled"];

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Weekdays inclusive of both ends — the same rule staffing.ts uses. */
function workingDaysBetween(start, end) {
  if (!start || !end || end < start) return 0;
  const from = new Date(`${start}T00:00:00`);
  const to = new Date(`${end}T00:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0;
  let days = 0;
  const cursor = new Date(from);
  while (cursor <= to) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) days += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

/** What the assignment is expected to cost — mirrors plannedCostFor. */
function plannedCostFor({ startDate, endDate, allocationPercent, dailyCostInr, dailyBillableRateInr }) {
  const allocation = Math.min(100, Math.max(0, Number(allocationPercent ?? 100)));
  const calendarDays = workingDaysBetween(startDate, endDate);
  const days = round2((calendarDays * allocation) / 100);
  return {
    plannedDays: days,
    plannedCostInr: round2(days * Number(dailyCostInr ?? 0)),
    plannedBillableInr: round2(days * Number(dailyBillableRateInr ?? 0)),
  };
}

// ─── 1. Read the file ──────────────────────────────────────────────

/**
 * Turn the downloaded response sheet into raw rows.
 *
 * Nothing is validated here beyond finding the columns: a row with a
 * nonsense allocation still comes through, so that the report can say
 * which row it was and what was in it.
 */
async function parseAllocationFile(buffer, options = {}) {
  const workbook = new ExcelJS.Workbook();
  const filename = String(options.filename || "").toLowerCase();

  if (filename.endsWith(".csv")) {
    const text = buffer.toString("utf8").replace(/^﻿/, "");
    await workbook.csv.read(Readable.from([text]));
  } else {
    await workbook.xlsx.load(buffer);
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new Error("That file has no sheets in it.");
  }

  // Forms puts the headers on row 1, but a sheet somebody has tidied
  // up may have a title above them. Take the first row carrying at
  // least two filled cells.
  let headerRowNumber = 0;
  let headers = [];
  const limit = Math.min(sheet.rowCount, 20);
  for (let r = 1; r <= limit; r += 1) {
    const row = sheet.getRow(r);
    const values = [];
    let filled = 0;
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const text = String(readCell(cell) ?? "").trim();
      values[colNumber] = text;
      if (text) filled += 1;
    });
    if (filled >= 2) {
      headerRowNumber = r;
      headers = values;
      break;
    }
  }

  if (!headerRowNumber) {
    throw new Error("Could not find a header row in that file.");
  }

  // ── Match each question to a column ──
  const mapping = {};
  const usedColumns = new Set();
  const normalised = headers.map((h) => normaliseHeader(h));

  for (const spec of COLUMN_SPECS) {
    const label = normaliseHeader(spec.label);
    const candidates = [
      (h) => h === label,
      (h) => spec.aliases.some((a) => h === a),
      (h) => spec.test(h),
    ];
    for (const matches of candidates) {
      const index = normalised.findIndex(
        (h, i) => h && !usedColumns.has(i) && matches(h)
      );
      if (index > -1) {
        mapping[spec.key] = index;
        usedColumns.add(index);
        break;
      }
    }
  }

  const missing = COLUMN_SPECS.filter(
    (spec) => spec.required && mapping[spec.key] === undefined
  ).map((spec) => spec.label);

  const rows = [];
  for (let r = headerRowNumber + 1; r <= sheet.rowCount; r += 1) {
    const row = sheet.getRow(r);
    const pick = (key) => {
      const index = mapping[key];
      if (index === undefined) return null;
      return readCell(row.getCell(index));
    };

    const raw = {
      rowNumber: r,
      employee: pick("employee"),
      project: pick("project"),
      role: pick("role"),
      allocation: pick("allocation"),
      startDate: pick("startDate"),
      endDate: pick("endDate"),
      notes: pick("notes"),
      submittedBy: pick("submittedBy"),
      submittedAt: pick("submittedAt"),
    };

    // A blank line in the middle of a sheet is not a row somebody
    // filled in — it is just a blank line.
    const hasContent = ["employee", "project", "allocation"].some(
      (k) => String(raw[k] ?? "").trim() !== ""
    );
    if (hasContent) rows.push(raw);
  }

  return {
    sheetName: sheet.name,
    headerRowNumber,
    headers: headers.filter(Boolean),
    mapping,
    missingColumns: missing,
    rows,
  };
}

// ─── 2. Work out what each row means ───────────────────────────────

async function loadReference({ identityDb, projectDb }) {
  const [employees, projects, bands, existing] = await Promise.all([
    identityDb("employee_master").select(
      "employee_id",
      "full_name",
      "company_email_id",
      "designation",
      "department",
      "office_location",
      "job_level",
      "is_active"
    ),
    projectDb("projects").select(
      "id",
      "code",
      "name",
      "status",
      "client_company_name",
      "scrapped_at"
    ),
    projectDb("employee_rate_bands")
      .where("is_active", true)
      .select("id", "band_name", "level_code", "daily_cost_inr", "daily_billable_rate_inr")
      .catch(() => []),
    projectDb("project_team_members").select(
      "project_id",
      "employee_id",
      "user_id",
      "user_name",
      "allocation_percent",
      "start_date",
      "end_date",
      "is_active"
    ),
  ]);

  const employeeByCode = new Map();
  const employeeByEmail = new Map();
  const employeeByName = new Map();
  for (const e of employees) {
    const code = String(e.employee_id ?? "").trim();
    if (code) employeeByCode.set(code.toUpperCase(), e);
    const email = String(e.company_email_id ?? "").trim().toLowerCase();
    if (email) employeeByEmail.set(email, e);
    const name = String(e.full_name ?? "").trim().toLowerCase();
    if (name) {
      const list = employeeByName.get(name) ?? [];
      list.push(e);
      employeeByName.set(name, list);
    }
  }

  const projectByCode = new Map();
  const projectByName = new Map();
  for (const p of projects) {
    const code = String(p.code ?? "").trim();
    if (code) projectByCode.set(code.toUpperCase(), p);
    const name = String(p.name ?? "").trim().toLowerCase();
    if (name) {
      const list = projectByName.get(name) ?? [];
      list.push(p);
      projectByName.set(name, list);
    }
  }

  const projectById = new Map(projects.map((p) => [String(p.id), p]));

  // Who is already on what. Both keys are checked because the table
  // predates employee_id and older rows carry only user_id.
  const takenByEmployee = new Set();
  const takenByUser = new Set();
  const committedBaseline = new Map();
  for (const row of existing) {
    const projectId = String(row.project_id);
    if (row.user_id) takenByUser.add(`${projectId}::${String(row.user_id).toUpperCase()}`);
    if (row.employee_id) takenByEmployee.add(`${projectId}::${String(row.employee_id).toUpperCase()}`);

    // The load they already carry, counting live projects only — the
    // same exclusion the allocation report and the over-allocation
    // warning use, so the three cannot disagree on screen.
    const project = projectById.get(projectId);
    if (!project || project.scrapped_at) continue;
    if (DEAD_STATUSES.includes(String(project.status ?? "").toLowerCase())) continue;
    if (row.is_active === false) continue;
    const employeeId = String(row.employee_id ?? row.user_id ?? "").toUpperCase();
    if (!employeeId) continue;
    committedBaseline.set(
      employeeId,
      (committedBaseline.get(employeeId) ?? 0) + Number(row.allocation_percent ?? 0)
    );
  }

  return {
    employees,
    projects,
    bands,
    employeeByCode,
    employeeByEmail,
    employeeByName,
    projectByCode,
    projectByName,
    projectById,
    takenByEmployee,
    takenByUser,
    committedBaseline,
  };
}

/**
 * The band that fits this person, read from the bands table rather
 * than from a hard-coded rate card.
 *
 * Longest level code first, so somebody on SRG1 is not handed the G1
 * band because "SRG1" happens to contain it.
 */
function bandFor(employee, bands) {
  const grade = String(employee.job_level ?? "").trim().toUpperCase();
  if (!grade || bands.length === 0) return null;

  const coded = bands
    .filter((b) => String(b.level_code ?? "").trim())
    .sort(
      (a, b) => String(b.level_code).trim().length - String(a.level_code).trim().length
    );

  const exact = coded.find((b) => String(b.level_code).trim().toUpperCase() === grade);
  const match =
    exact ?? coded.find((b) => grade.includes(String(b.level_code).trim().toUpperCase()));
  if (!match) return null;

  return {
    id: String(match.id),
    bandName: String(match.band_name ?? ""),
    dailyCostInr: Number(match.daily_cost_inr ?? 0),
    dailyBillableRateInr:
      match.daily_billable_rate_inr === null || match.daily_billable_rate_inr === undefined
        ? null
        : Number(match.daily_billable_rate_inr),
  };
}

/**
 * Decide every row against the master, without writing anything.
 *
 * Outcomes are deliberately three, not two: `ready` will be inserted,
 * `error` cannot be, and `skipped` is a row that is already in the
 * database — which is not a failure, it is the second time somebody
 * filled the form in.
 */
async function resolveAllocationRows(rawRows, options) {
  const { identityDb, projectDb } = options;
  const dateOrder = options.dateOrder === "mdy" ? "mdy" : "dmy";
  const reference = options.reference ?? (await loadReference({ identityDb, projectDb }));

  const seenInFile = new Map();
  const runningTotal = new Map(reference.committedBaseline);
  const rows = [];

  for (const raw of rawRows) {
    const messages = [];
    const warnings = [];
    const row = {
      rowNumber: raw.rowNumber,
      employeeRaw: String(raw.employee ?? "").trim(),
      projectRaw: String(raw.project ?? "").trim(),
      role: String(raw.role ?? "").trim() || null,
      notes: String(raw.notes ?? "").trim() || null,
      submittedBy: String(raw.submittedBy ?? "").trim() || null,
      employeeId: null,
      employeeName: null,
      projectId: null,
      projectCode: null,
      projectName: null,
      allocationPercent: null,
      startDate: null,
      endDate: null,
      totalAfter: null,
      outcome: "ready",
      messages,
      warnings,
    };

    // ── The person ──
    const employeeRef = splitLabelled(row.employeeRaw);
    let employee = null;
    if (!row.employeeRaw) {
      messages.push("No employee given.");
    } else {
      employee = reference.employeeByCode.get(employeeRef.code.toUpperCase()) ?? null;
      if (!employee && employeeRef.raw.includes("@")) {
        employee = reference.employeeByEmail.get(employeeRef.raw.toLowerCase()) ?? null;
      }
      if (!employee) {
        for (const candidate of [employeeRef.rest, employeeRef.raw]) {
          const key = candidate.trim().toLowerCase();
          if (!key) continue;
          const matches = reference.employeeByName.get(key);
          if (matches && matches.length === 1) {
            employee = matches[0];
            break;
          }
          if (matches && matches.length > 1) {
            messages.push(
              `"${candidate}" matches ${matches.length} people in the master — the response needs the employee code.`
            );
            break;
          }
        }
      }
      if (!employee && messages.length === 0) {
        messages.push(`No employee in the master matches "${row.employeeRaw}".`);
      }
    }

    if (employee) {
      row.employeeId = String(employee.employee_id);
      row.employeeName = String(employee.full_name ?? "");
      if (employee.is_active === false) {
        warnings.push("Marked inactive in the employee master.");
      }
    }

    // ── The project ──
    const projectRef = splitLabelled(row.projectRaw);
    let project = null;
    let projectAmbiguous = false;
    if (!row.projectRaw) {
      messages.push("No project given.");
    } else {
      project = reference.projectByCode.get(projectRef.code.toUpperCase()) ?? null;
      if (!project) {
        for (const candidate of [projectRef.rest, projectRef.raw]) {
          const key = candidate.trim().toLowerCase();
          if (!key) continue;
          const matches = reference.projectByName.get(key);
          if (matches && matches.length === 1) {
            project = matches[0];
            break;
          }
          if (matches && matches.length > 1) {
            projectAmbiguous = true;
            messages.push(
              `"${candidate}" matches ${matches.length} projects — the response needs the project code.`
            );
            break;
          }
        }
      }
      if (!project && !projectAmbiguous) {
        messages.push(`No project matches "${row.projectRaw}".`);
      }
    }

    if (project) {
      row.projectId = String(project.id);
      row.projectCode = String(project.code ?? "");
      row.projectName = String(project.name ?? "");
      if (project.scrapped_at) {
        messages.push(`${row.projectCode} has been scrapped — nobody can be staffed onto it.`);
      } else if (DEAD_STATUSES.includes(String(project.status ?? "").toLowerCase())) {
        messages.push(
          `${row.projectCode} is ${String(project.status).toLowerCase()} — a finished project is not a claim on anybody's time.`
        );
      }
    }

    // ── The numbers ──
    const allocationText = String(raw.allocation ?? "").replace("%", "").trim();
    const allocation = Number(allocationText);
    if (!allocationText) {
      messages.push("No allocation percentage given.");
    } else if (!Number.isFinite(allocation) || allocation <= 0 || allocation > 100) {
      messages.push(`"${raw.allocation}" is not an allocation between 1 and 100.`);
    } else {
      row.allocationPercent = Math.round(allocation);
    }

    const start = toDateString(raw.startDate, dateOrder);
    const end = toDateString(raw.endDate, dateOrder);
    if (start === undefined) messages.push(`"${raw.startDate}" is not a date I can read.`);
    else row.startDate = start;
    if (end === undefined) messages.push(`"${raw.endDate}" is not a date I can read.`);
    else row.endDate = end;
    if (row.startDate && row.endDate && row.endDate < row.startDate) {
      messages.push("The end date falls before the start date.");
    }
    if (start === null && end === null) {
      warnings.push("No dates — this allocation will count on every as-at date.");
    }

    // ── Already there? ──
    if (row.employeeId && row.projectId && messages.length === 0) {
      const key = `${row.projectId}::${row.employeeId.toUpperCase()}`;
      const firstSeen = seenInFile.get(key);
      if (firstSeen) {
        row.outcome = "skipped";
        messages.push(
          `${row.employeeName} is already on ${row.projectCode} earlier in this file (row ${firstSeen}).`
        );
      } else if (
        reference.takenByEmployee.has(key) ||
        reference.takenByUser.has(key)
      ) {
        row.outcome = "skipped";
        messages.push(`${row.employeeName} is already on ${row.projectCode} in the database.`);
      } else {
        seenInFile.set(key, row.rowNumber);
      }
    }

    if (messages.length > 0 && row.outcome !== "skipped") {
      row.outcome = "error";
    }

    // ── What it does to their week ──
    if (row.outcome === "ready" && row.employeeId && row.allocationPercent) {
      const key = row.employeeId.toUpperCase();
      const total = (runningTotal.get(key) ?? 0) + row.allocationPercent;
      runningTotal.set(key, total);
      row.totalAfter = total;
      if (total > 100) {
        warnings.push(
          `Takes ${row.employeeName} to ${total}% across every live project — more than a full week.`
        );
      }
    }

    rows.push(row);
  }

  const summary = {
    total: rows.length,
    ready: rows.filter((r) => r.outcome === "ready").length,
    skipped: rows.filter((r) => r.outcome === "skipped").length,
    errors: rows.filter((r) => r.outcome === "error").length,
    overAllocated: rows.filter((r) => (r.totalAfter ?? 0) > 100).length,
  };

  return { rows, summary, reference };
}

// ─── 3. Write ──────────────────────────────────────────────────────

/**
 * Timesheets and permissions key off identity_db.users.id, but
 * somebody staffed onto a project may never have signed in — so fall
 * back to their employee code rather than refusing to staff them.
 * Same rule as the team route.
 */
async function resolveUserIds(employeeIds, { identityDb, reference }) {
  const byEmployee = new Map();
  const emails = [];
  for (const id of employeeIds) {
    const employee = reference.employeeByCode.get(String(id).toUpperCase());
    const email = String(employee?.company_email_id ?? "").trim().toLowerCase();
    if (email) emails.push(email);
  }

  let users = [];
  if (emails.length > 0) {
    users = await identityDb("users")
      .whereRaw("lower(email) = any(?)", [emails])
      .select("id", "email")
      .catch(() => []);
  }
  const userByEmail = new Map(
    users.map((u) => [String(u.email ?? "").toLowerCase(), String(u.id)])
  );

  for (const id of employeeIds) {
    const employee = reference.employeeByCode.get(String(id).toUpperCase());
    const email = String(employee?.company_email_id ?? "").trim().toLowerCase();
    byEmployee.set(String(id), (email && userByEmail.get(email)) || String(id));
  }
  return byEmployee;
}

/**
 * Insert the rows that are ready.
 *
 * Row by row rather than all-or-nothing: these have already been
 * checked against the master, so a failure here is something
 * unexpected in one row, and throwing away forty good rows because of
 * it helps nobody. Every outcome is reported either way.
 */
async function commitAllocationRows(resolvedRows, options) {
  const { identityDb, projectDb, reference, importedBy } = options;
  const ready = resolvedRows.filter((r) => r.outcome === "ready");
  const userIds = await resolveUserIds(
    ready.map((r) => r.employeeId),
    { identityDb, reference }
  );

  const stamp = new Date();
  const results = [];
  let inserted = 0;
  let failed = 0;

  for (const row of ready) {
    const employee = reference.employeeByCode.get(row.employeeId.toUpperCase());
    const band = employee ? bandFor(employee, reference.bands) : null;
    const planned = plannedCostFor({
      startDate: row.startDate,
      endDate: row.endDate,
      allocationPercent: row.allocationPercent,
      dailyCostInr: band?.dailyCostInr ?? null,
      dailyBillableRateInr: band?.dailyBillableRateInr ?? null,
    });

    const provenance = `Imported from the resourcing form${
      importedBy ? ` by ${importedBy}` : ""
    } on ${stamp.toISOString().slice(0, 10)}${
      row.submittedBy ? `; response from ${row.submittedBy}` : ""
    }.`;

    try {
      await projectDb("project_team_members").insert({
        project_id: row.projectId,
        user_id: userIds.get(row.employeeId) ?? row.employeeId,
        employee_id: row.employeeId,
        user_name: row.employeeName || null,
        rate_band_id: band?.id || null,
        rate_band_name: band?.bandName ?? null,
        role_in_project: row.role,
        allocation_percent: row.allocationPercent,
        start_date: row.startDate,
        end_date: row.endDate,
        daily_cost_inr: band?.dailyCostInr ?? null,
        daily_billable_rate_inr: band?.dailyBillableRateInr ?? null,
        planned_days: planned.plannedDays,
        planned_cost_inr: planned.plannedCostInr,
        planned_billable_inr: planned.plannedBillableInr,
        notes: row.notes ? `${row.notes}\n\n${provenance}` : provenance,
        is_active: true,
        created_at: stamp,
        updated_at: stamp,
      });
      inserted += 1;
      if (!band) {
        row.warnings.push(
          "No rate band matched their grade — the row carries no rates. Set it on the project's Team tab."
        );
      }
      results.push({ rowNumber: row.rowNumber, outcome: "inserted" });
    } catch (err) {
      failed += 1;
      row.outcome = "error";
      const message = String(err && err.message ? err.message : err);
      // The table's own unique key, reached by a row that slipped past
      // the check above — somebody importing the same file twice at
      // once, say.
      row.messages.push(
        message.includes("unique")
          ? `${row.employeeName} is already on ${row.projectCode}.`
          : message
      );
      results.push({ rowNumber: row.rowNumber, outcome: "failed", error: message });
    }
  }

  return {
    inserted,
    failed,
    skipped: resolvedRows.filter((r) => r.outcome === "skipped").length,
    errors: resolvedRows.filter((r) => r.outcome === "error").length,
    results,
  };
}

// ─── The whole thing ───────────────────────────────────────────────

/**
 * Parse, resolve, and — only when `commit` is set — write.
 *
 * The preview and the commit run the same code, so what the admin
 * page shows before you press the button is what the button does.
 */
async function runAllocationImport(options) {
  const { buffer, filename, identityDb, projectDb, commit = false, importedBy = null } = options;

  const parsed = await parseAllocationFile(buffer, { filename });
  if (parsed.missingColumns.length > 0) {
    return {
      ok: false,
      error: `That sheet is missing ${parsed.missingColumns
        .map((c) => `"${c}"`)
        .join(" and ")}. Export the responses straight from Microsoft Forms, or rename the columns to match.`,
      parsed,
    };
  }
  if (parsed.rows.length === 0) {
    return { ok: false, error: "There are no responses in that file.", parsed };
  }

  const resolved = await resolveAllocationRows(parsed.rows, {
    identityDb,
    projectDb,
    dateOrder: options.dateOrder,
  });

  if (!commit) {
    return {
      ok: true,
      committed: false,
      sheetName: parsed.sheetName,
      rows: resolved.rows,
      summary: resolved.summary,
    };
  }

  const written = await commitAllocationRows(resolved.rows, {
    identityDb,
    projectDb,
    reference: resolved.reference,
    importedBy,
  });

  return {
    ok: true,
    committed: true,
    sheetName: parsed.sheetName,
    rows: resolved.rows,
    summary: { ...resolved.summary, ...written },
  };
}

// ─── Choice lists for the form itself ──────────────────────────────

/**
 * The two dropdowns, built from what is actually in the database.
 *
 * Microsoft Forms has no way to read a list from anywhere, so the
 * options have to be pasted in — which means they are a snapshot, and
 * re-running this before each collection round is the whole
 * maintenance story.
 */
async function buildChoiceLists({ identityDb, projectDb, includeInactive = false }) {
  let employeeQuery = identityDb("employee_master").select(
    "employee_id",
    "full_name",
    "department",
    "is_active"
  );
  if (!includeInactive) employeeQuery = employeeQuery.where("is_active", true);
  const employees = await employeeQuery.orderBy("employee_id");

  const projects = await projectDb("projects")
    .whereNull("scrapped_at")
    .whereNotIn("status", DEAD_STATUSES)
    .select("code", "name", "client_company_name", "status")
    .orderBy("code");

  return {
    employees: employees.map(
      (e) => `${String(e.employee_id).trim()} — ${String(e.full_name ?? "").trim()}`
    ),
    projects: projects.map((p) => {
      const client = String(p.client_company_name ?? "").trim();
      return `${String(p.code).trim()} — ${String(p.name ?? "").trim()}${
        client ? ` (${client})` : ""
      }`;
    }),
    counts: { employees: employees.length, projects: projects.length },
  };
}

module.exports = {
  COLUMN_SPECS,
  FORM_QUESTIONS,
  parseAllocationFile,
  loadReference,
  resolveAllocationRows,
  commitAllocationRows,
  runAllocationImport,
  buildChoiceLists,
  // exported for tests and for the CLI's dry-run report
  toDateString,
  splitLabelled,
  bandFor,
  plannedCostFor,
  workingDaysBetween,
};
