// ═══════════════════════════════════════════════════════════════
// Who is on what, and how much of them is left.
//
// One row per person in the employee master — including the people on
// nothing at all, because a resourcing report that only lists busy
// people cannot answer the question it exists to answer. Somebody
// sitting idle is the most important row on the sheet, and if they are
// simply absent they read the same as not existing.
//
// The people live in identity_db and the allocations live in
// project_db, which are separate databases: there is no join to write.
// The two sides are fetched independently and stitched together in
// memory on employee_id.
// ═══════════════════════════════════════════════════════════════

import { identityDb, projectDb } from "./db";
import { toDateInput } from "./dates";

/** A person's share of one project. */
export interface AllocationEntry {
  projectId: string;
  projectCode: string;
  projectName: string;
  clientCompanyName: string | null;
  roleInProject: string | null;
  allocationPercent: number;
  startDate: string | null;
  endDate: string | null;
  status: string | null;
}

export type AllocationState = "bench" | "under" | "full" | "over";

export interface AllocationRow {
  employeeId: string;
  fullName: string;
  email: string | null;
  designation: string | null;
  department: string | null;
  location: string | null;
  grade: string | null;
  /** Ordered by allocation, largest first — so "Project 1" is their main one. */
  projects: AllocationEntry[];
  totalPercent: number;
  state: AllocationState;
}

export interface AllocationReport {
  generatedAt: string;
  asOf: string | null;
  rows: AllocationRow[];
  /** How many positional columns the widest row needs. */
  maxProjects: number;
  filters: {
    departments: string[];
    locations: string[];
  };
  summary: {
    headcount: number;
    onBench: number;
    allocated: number;
    overAllocated: number;
    /** Mean total allocation across everyone, bench included. */
    averageUtilisation: number;
    /** Sum of every allocation percent, as whole people. */
    committedFte: number;
  };
}

export interface AllocationQuery {
  /** Only count allocations live on this date. Null means count them all. */
  asOf?: string | null;
  department?: string | null;
  location?: string | null;
  /** Matches employee id, name, email or designation. */
  search?: string | null;
  /** Include people marked inactive in the master. Off by default. */
  includeInactive?: boolean;
}

/**
 * Projects that are closed or cancelled are not a claim on anybody's
 * time. Counting them would show people as busy months after the work
 * ended — the same rule `commitmentsFor` applies when it warns about
 * over-allocation, and the two must agree or the warning and the report
 * will contradict each other.
 */
const DEAD_STATUSES = ["closed", "cancelled"];

function liveOn(asOf: string | null, start: string | null, end: string | null): boolean {
  if (!asOf) return true;
  if (start && start > asOf) return false;
  if (end && end < asOf) return false;
  return true;
}

function stateFor(total: number, projectCount: number): AllocationState {
  if (projectCount === 0 || total === 0) return "bench";
  if (total > 100) return "over";
  if (total === 100) return "full";
  return "under";
}

export async function buildAllocationReport(
  query: AllocationQuery = {}
): Promise<AllocationReport> {
  const asOf = query.asOf ? toDateInput(query.asOf) || null : null;

  // ── The people ────────────────────────────────────────────────
  let people = identityDb("employee_master").select(
    "employee_id",
    "full_name",
    "company_email_id",
    "designation",
    "department",
    "office_location",
    "job_level",
    "employee_status",
    "is_active"
  );

  if (!query.includeInactive) {
    people = people.where("is_active", true);
  }

  if (query.department) people = people.where("department", query.department);
  if (query.location) people = people.where("office_location", query.location);

  if (query.search) {
    const term = `%${query.search.trim().toLowerCase()}%`;
    people = people.where((b) =>
      b
        .whereRaw("lower(employee_id) like ?", [term])
        .orWhereRaw("lower(full_name) like ?", [term])
        .orWhereRaw("lower(coalesce(company_email_id, '')) like ?", [term])
        .orWhereRaw("lower(coalesce(designation, '')) like ?", [term])
    );
  }

  const employees = (await people.orderBy("employee_id")) as Record<string, unknown>[];

  // The filter dropdowns are built from the whole master, not from the
  // filtered set — otherwise choosing Kolkata removes every other
  // location from the list and you cannot get back.
  const [departmentRows, locationRows] = await Promise.all([
    identityDb("employee_master")
      .distinct("department")
      .whereNotNull("department")
      .andWhereNot("department", "")
      .orderBy("department"),
    identityDb("employee_master")
      .distinct("office_location")
      .whereNotNull("office_location")
      .andWhereNot("office_location", "")
      .orderBy("office_location"),
  ]);

  // ── Their allocations ─────────────────────────────────────────
  const employeeIds = employees.map((e) => String(e.employee_id)).filter(Boolean);

  const allocationsByEmployee = new Map<string, AllocationEntry[]>();

  if (employeeIds.length > 0) {
    const assignments = (await projectDb("project_team_members as ptm")
      .join("projects as p", "p.id", "ptm.project_id")
      .whereIn("ptm.employee_id", employeeIds)
      .andWhere("ptm.is_active", true)
      .whereNull("p.scrapped_at")
      .whereNotIn("p.status", DEAD_STATUSES)
      .select(
        "ptm.employee_id",
        "ptm.project_id",
        "ptm.role_in_project",
        "ptm.allocation_percent",
        "ptm.start_date",
        "ptm.end_date",
        "p.code",
        "p.name",
        "p.status",
        "p.client_company_name"
      )
      .catch(() => [])) as Record<string, unknown>[];

    for (const row of assignments) {
      const start = toDateInput(row.start_date as string) || null;
      const end = toDateInput(row.end_date as string) || null;
      if (!liveOn(asOf, start, end)) continue;

      const employeeId = String(row.employee_id);
      const list = allocationsByEmployee.get(employeeId) ?? [];
      list.push({
        projectId: String(row.project_id),
        projectCode: String(row.code ?? ""),
        projectName: String(row.name ?? ""),
        clientCompanyName: row.client_company_name ? String(row.client_company_name) : null,
        roleInProject: row.role_in_project ? String(row.role_in_project) : null,
        allocationPercent: Number(row.allocation_percent ?? 0),
        startDate: start,
        endDate: end,
        status: row.status ? String(row.status) : null,
      });
      allocationsByEmployee.set(employeeId, list);
    }
  }

  // ── Stitch ────────────────────────────────────────────────────
  const rows: AllocationRow[] = employees.map((e) => {
    const employeeId = String(e.employee_id);
    const projects = (allocationsByEmployee.get(employeeId) ?? []).sort(
      // Biggest commitment first, so "Project 1" is the one they are
      // mostly doing. Ties break on code, so the order is stable
      // between two runs and a diff of two exports means something.
      (a, b) =>
        b.allocationPercent - a.allocationPercent ||
        a.projectCode.localeCompare(b.projectCode)
    );

    const totalPercent = projects.reduce((sum, p) => sum + p.allocationPercent, 0);

    return {
      employeeId,
      fullName: String(e.full_name ?? ""),
      email: e.company_email_id ? String(e.company_email_id) : null,
      designation: e.designation ? String(e.designation) : null,
      department: e.department ? String(e.department) : null,
      location: e.office_location ? String(e.office_location) : null,
      grade: e.job_level ? String(e.job_level) : null,
      projects,
      totalPercent,
      state: stateFor(totalPercent, projects.length),
    };
  });

  const headcount = rows.length;
  const onBench = rows.filter((r) => r.state === "bench").length;
  const overAllocated = rows.filter((r) => r.state === "over").length;
  const totalPercentSum = rows.reduce((sum, r) => sum + r.totalPercent, 0);

  return {
    generatedAt: new Date().toISOString(),
    asOf,
    rows,
    maxProjects: rows.reduce((max, r) => Math.max(max, r.projects.length), 0),
    filters: {
      departments: departmentRows.map((r: Record<string, unknown>) => String(r.department)),
      locations: locationRows.map((r: Record<string, unknown>) => String(r.office_location)),
    },
    summary: {
      headcount,
      onBench,
      allocated: headcount - onBench,
      overAllocated,
      // Rounded for display only — every figure it is derived from is
      // kept whole, so the export and the screen never disagree.
      averageUtilisation: headcount === 0 ? 0 : Math.round(totalPercentSum / headcount),
      committedFte: Math.round((totalPercentSum / 100) * 10) / 10,
    },
  };
}

/**
 * The report as a rectangle: a header row and body rows, with the
 * positional Project N columns already flattened.
 *
 * Both exporters and the on-screen table read this, so a column can
 * never appear in the spreadsheet and not on the page.
 */
export function toMatrix(report: AllocationReport): {
  header: string[];
  rows: (string | number)[][];
} {
  const slots = Math.max(1, report.maxProjects);

  const header = ["Emp Code", "Name", "Department", "Location"];
  for (let i = 1; i <= slots; i += 1) {
    header.push(`Project ${i}`, `Project ${i} Allocation %`);
  }
  header.push("Total Allocation %", "Status");

  const STATE_LABEL: Record<AllocationState, string> = {
    bench: "On bench",
    under: "Partly allocated",
    full: "Fully allocated",
    over: "Over-allocated",
  };

  const rows = report.rows.map((r) => {
    const cells: (string | number)[] = [
      r.employeeId,
      r.fullName,
      r.department ?? "",
      r.location ?? "",
    ];
    for (let i = 0; i < slots; i += 1) {
      const p = r.projects[i];
      // An empty string, not a zero: this person has no fifth project,
      // which is a different statement from being on one at 0%.
      cells.push(p ? `${p.projectCode} — ${p.projectName}` : "", p ? p.allocationPercent : "");
    }
    cells.push(r.totalPercent, STATE_LABEL[r.state]);
    return cells;
  });

  return { header, rows };
}
