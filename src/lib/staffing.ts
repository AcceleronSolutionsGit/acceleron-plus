// ═══════════════════════════════════════════════════════════════
// Staffing — who is on a project, what they cost, what they can do.
//
// The arithmetic lives here rather than in the route or the screen so
// that the number a PM reads, the number the API stores and the number
// an export prints are the same number.
//
// Two costs, deliberately separate:
//
//   planned   allocation % × working days × the band's daily cost,
//             fixed at the moment somebody is staffed
//   actual    hours already logged on timesheets, at the same rate
//
// Planned is a commitment and must not move when a rate band is
// re-priced next April, so the rate is copied onto the assignment
// rather than joined at read time.
// ═══════════════════════════════════════════════════════════════

import { identityDb, projectDb } from "./db";
import { toDateInput, parseISODate } from "./dates";

/** Hours in a working day — the divisor turning logged hours into days. */
export const HOURS_PER_DAY = 8;

export interface RateBand {
  id: string;
  bandName: string;
  levelCode: string;
  dailyCostInr: number;
  dailyBillableRateInr: number | null;
}

export interface TeamMemberSkill {
  id: string;
  name: string;
  category: string | null;
  proficiency: number;
  yearsExperience: number | null;
  isPrimary: boolean;
}

export interface TeamMember {
  id: string;
  projectId: string;
  userId: string;
  employeeId: string | null;
  userName: string | null;
  email: string | null;
  designation: string | null;
  department: string | null;
  roleInProject: string | null;
  allocationPercent: number;
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
  notes: string | null;
  rateBandId: string | null;
  rateBandName: string | null;
  skills: TeamMemberSkill[];
  /** Present only for someone allowed to see cost. */
  cost?: {
    dailyCostInr: number | null;
    dailyBillableRateInr: number | null;
    plannedDays: number | null;
    plannedCostInr: number | null;
    plannedBillableInr: number | null;
    actualHours: number;
    actualDays: number;
    actualCostInr: number | null;
    /** actual ÷ planned, as a percentage. Null when nothing was planned. */
    burnPercent: number | null;
  };
}

// ─── Working days ──────────────────────────────────────────────────

/**
 * Working days between two dates, inclusive, skipping weekends.
 *
 * Deliberately not a calendar: public holidays vary by office and
 * nobody maintains that list yet. Counting Mon–Fri is the honest
 * approximation, and the planned days are editable afterwards for the
 * cases where it matters.
 */
export function workingDaysBetween(
  start: string | Date | null | undefined,
  end: string | Date | null | undefined
): number {
  const from = parseISODate(start as string);
  const to = parseISODate(end as string);
  if (!from || !to || to < from) return 0;

  let days = 0;
  const cursor = new Date(from);
  while (cursor <= to) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) days += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export interface PlannedCost {
  plannedDays: number;
  plannedCostInr: number;
  plannedBillableInr: number;
}

/**
 * What an assignment is expected to cost.
 *
 * Someone at 50% for ten working days is five days of cost, which is
 * why allocation multiplies rather than merely annotating the row.
 */
export function plannedCostFor(input: {
  startDate: string | null | undefined;
  endDate: string | null | undefined;
  allocationPercent: number | null | undefined;
  dailyCostInr: number | null | undefined;
  dailyBillableRateInr?: number | null | undefined;
  /** Override the calendar calculation when somebody has typed a figure. */
  plannedDays?: number | null;
}): PlannedCost {
  const allocation = Math.min(100, Math.max(0, Number(input.allocationPercent ?? 100)));
  const calendarDays = workingDaysBetween(input.startDate, input.endDate);
  const days =
    input.plannedDays !== undefined && input.plannedDays !== null
      ? Number(input.plannedDays)
      : round2((calendarDays * allocation) / 100);

  const cost = Number(input.dailyCostInr ?? 0);
  const billable = Number(input.dailyBillableRateInr ?? 0);

  return {
    plannedDays: days,
    plannedCostInr: round2(days * cost),
    plannedBillableInr: round2(days * billable),
  };
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

// ─── Reading ───────────────────────────────────────────────────────

/** The rate bands available to staff with, newest effective first. */
export async function listRateBands(): Promise<RateBand[]> {
  const rows = await projectDb("employee_rate_bands")
    .where("is_active", true)
    .orderBy(["level_code", "band_name"]);

  return rows.map((r: Record<string, unknown>) => ({
    id: String(r.id),
    bandName: String(r.band_name ?? ""),
    levelCode: String(r.level_code ?? ""),
    dailyCostInr: Number(r.daily_cost_inr ?? 0),
    dailyBillableRateInr:
      r.daily_billable_rate_inr === null || r.daily_billable_rate_inr === undefined
        ? null
        : Number(r.daily_billable_rate_inr),
  }));
}

/** Skills for a set of employees, in one query rather than N. */
export async function skillsForEmployees(
  employeeIds: string[]
): Promise<Map<string, TeamMemberSkill[]>> {
  const map = new Map<string, TeamMemberSkill[]>();
  const ids = employeeIds.filter(Boolean);
  if (ids.length === 0) return map;

  const rows = await identityDb("employee_skills as es")
    .join("skills as s", "s.id", "es.skill_id")
    .whereIn("es.employee_id", ids)
    .andWhere("s.is_active", true)
    .select(
      "es.employee_id",
      "es.proficiency",
      "es.years_experience",
      "es.is_primary",
      "s.id as skill_id",
      "s.name",
      "s.category"
    )
    .orderBy([{ column: "es.is_primary", order: "desc" }, { column: "s.name" }])
    .catch(() => []);

  for (const row of rows as Record<string, unknown>[]) {
    const employeeId = String(row.employee_id);
    if (!map.has(employeeId)) map.set(employeeId, []);
    map.get(employeeId)!.push({
      id: String(row.skill_id),
      name: String(row.name ?? ""),
      category: row.category ? String(row.category) : null,
      proficiency: Number(row.proficiency ?? 3),
      yearsExperience:
        row.years_experience === null || row.years_experience === undefined
          ? null
          : Number(row.years_experience),
      isPrimary: Boolean(row.is_primary),
    });
  }
  return map;
}

/**
 * The project's team.
 *
 * `includeCost` is the caller's decision, made from the capability —
 * and when it is false the cost block is absent rather than zeroed, so
 * nothing downstream can mistake "not allowed to see" for "free".
 */
export async function getProjectTeam(
  projectId: string,
  options: { includeCost: boolean; includeInactive?: boolean } = { includeCost: false }
): Promise<TeamMember[]> {
  let query = projectDb("project_team_members").where("project_id", projectId);
  if (!options.includeInactive) query = query.andWhere("is_active", true);
  const rows = (await query.orderBy("created_at")) as Record<string, unknown>[];

  if (rows.length === 0) return [];

  const employeeIds = rows.map((r) => String(r.employee_id ?? "")).filter(Boolean);
  const [skills, directory, hours] = await Promise.all([
    skillsForEmployees(employeeIds),
    employeeDirectory(employeeIds),
    options.includeCost ? loggedHoursByUser(projectId) : Promise.resolve(new Map<string, number>()),
  ]);

  return rows.map((row) => {
    const employeeId = row.employee_id ? String(row.employee_id) : null;
    const profile = employeeId ? directory.get(employeeId) : undefined;

    const member: TeamMember = {
      id: String(row.id),
      projectId: String(row.project_id),
      userId: String(row.user_id),
      employeeId,
      userName: row.user_name ? String(row.user_name) : (profile?.fullName ?? null),
      email: profile?.email ?? null,
      designation: profile?.designation ?? null,
      department: profile?.department ?? null,
      roleInProject: row.role_in_project ? String(row.role_in_project) : null,
      allocationPercent: Number(row.allocation_percent ?? 100),
      startDate: toDateInput(row.start_date as string) || null,
      endDate: toDateInput(row.end_date as string) || null,
      isActive: row.is_active !== false,
      notes: row.notes ? String(row.notes) : null,
      rateBandId: row.rate_band_id ? String(row.rate_band_id) : null,
      rateBandName: row.rate_band_name ? String(row.rate_band_name) : null,
      skills: employeeId ? (skills.get(employeeId) ?? []) : [],
    };

    if (options.includeCost) {
      const dailyCost =
        row.daily_cost_inr === null || row.daily_cost_inr === undefined
          ? null
          : Number(row.daily_cost_inr);
      const plannedCost =
        row.planned_cost_inr === null || row.planned_cost_inr === undefined
          ? null
          : Number(row.planned_cost_inr);

      const actualHours = hours.get(String(row.user_id)) ?? 0;
      const actualDays = round2(actualHours / HOURS_PER_DAY);
      const actualCost = dailyCost === null ? null : round2(actualDays * dailyCost);

      member.cost = {
        dailyCostInr: dailyCost,
        dailyBillableRateInr:
          row.daily_billable_rate_inr === null || row.daily_billable_rate_inr === undefined
            ? null
            : Number(row.daily_billable_rate_inr),
        plannedDays:
          row.planned_days === null || row.planned_days === undefined
            ? null
            : Number(row.planned_days),
        plannedCostInr: plannedCost,
        plannedBillableInr:
          row.planned_billable_inr === null || row.planned_billable_inr === undefined
            ? null
            : Number(row.planned_billable_inr),
        actualHours,
        actualDays,
        actualCostInr: actualCost,
        burnPercent:
          plannedCost && plannedCost > 0 && actualCost !== null
            ? Math.round((actualCost / plannedCost) * 100)
            : null,
      };
    }

    return member;
  });
}

interface DirectoryEntry {
  fullName: string | null;
  email: string | null;
  designation: string | null;
  department: string | null;
}

async function employeeDirectory(employeeIds: string[]): Promise<Map<string, DirectoryEntry>> {
  const map = new Map<string, DirectoryEntry>();
  if (employeeIds.length === 0) return map;

  const rows = await identityDb("employee_master")
    .whereIn("employee_id", employeeIds)
    .select("employee_id", "full_name", "company_email_id", "designation", "department")
    .catch(() => []);

  for (const row of rows as Record<string, unknown>[]) {
    map.set(String(row.employee_id), {
      fullName: row.full_name ? String(row.full_name) : null,
      email: row.company_email_id ? String(row.company_email_id) : null,
      designation: row.designation ? String(row.designation) : null,
      department: row.department ? String(row.department) : null,
    });
  }
  return map;
}

/** Hours logged per person on this project, for the actual-cost side. */
async function loggedHoursByUser(projectId: string): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const rows = await projectDb("project_timesheets")
    .where("project_id", projectId)
    .groupBy("user_id")
    .select("user_id")
    .sum({ hours: "hours_logged" })
    .catch(() => []);

  for (const row of rows as Record<string, unknown>[]) {
    map.set(String(row.user_id), Number(row.hours ?? 0));
  }
  return map;
}

// ─── Totals ────────────────────────────────────────────────────────

export interface TeamTotals {
  headcount: number;
  plannedDays: number;
  plannedCostInr: number;
  plannedBillableInr: number;
  actualDays: number;
  actualCostInr: number;
  burnPercent: number | null;
}

export function teamTotals(team: TeamMember[]): TeamTotals {
  const totals = team.reduce(
    (acc, member) => {
      acc.plannedDays += member.cost?.plannedDays ?? 0;
      acc.plannedCostInr += member.cost?.plannedCostInr ?? 0;
      acc.plannedBillableInr += member.cost?.plannedBillableInr ?? 0;
      acc.actualDays += member.cost?.actualDays ?? 0;
      acc.actualCostInr += member.cost?.actualCostInr ?? 0;
      return acc;
    },
    { plannedDays: 0, plannedCostInr: 0, plannedBillableInr: 0, actualDays: 0, actualCostInr: 0 }
  );

  return {
    headcount: team.length,
    plannedDays: round2(totals.plannedDays),
    plannedCostInr: round2(totals.plannedCostInr),
    plannedBillableInr: round2(totals.plannedBillableInr),
    actualDays: round2(totals.actualDays),
    actualCostInr: round2(totals.actualCostInr),
    burnPercent:
      totals.plannedCostInr > 0
        ? Math.round((totals.actualCostInr / totals.plannedCostInr) * 100)
        : null,
  };
}

// ─── Is this person already spoken for? ────────────────────────────
//
// Allocation only means something across the whole portfolio. Somebody
// at 50% here may be at 80% on two other projects for the same weeks,
// and the row in front of you says nothing about it. These helpers
// answer "what else are they committed to over this window?".

export interface Commitment {
  memberId: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  roleInProject: string | null;
  allocationPercent: number;
  startDate: string | null;
  endDate: string | null;
}

export interface AllocationPicture {
  /** Every overlapping commitment, this project's included unless excluded. */
  commitments: Commitment[];
  /** Their allocation already committed over the window, as a percentage. */
  committedPercent: number;
  /** committedPercent plus whatever is being proposed. */
  totalPercent: number;
  /** True when the total exceeds 100. */
  overAllocated: boolean;
}

/**
 * Two date ranges overlap unless one finishes before the other starts.
 * A missing date is open-ended, which is the honest reading of a row
 * nobody has bounded: it could be running now.
 */
function rangesOverlap(
  aStart: string | null,
  aEnd: string | null,
  bStart: string | null,
  bEnd: string | null
): boolean {
  if (aEnd && bStart && aEnd < bStart) return false;
  if (bEnd && aStart && bEnd < aStart) return false;
  return true;
}

/**
 * What else these people are committed to over the given window.
 *
 * Keyed by employee_id. Assignments on `excludeProjectId` are left out
 * so a project does not count itself, and `excludeMemberId` drops the
 * row being edited so changing an allocation is not compared against
 * its own old value.
 */
export async function commitmentsFor(
  employeeIds: string[],
  window: {
    startDate?: string | null;
    endDate?: string | null;
    excludeProjectId?: string;
    excludeMemberId?: string;
  } = {}
): Promise<Map<string, Commitment[]>> {
  const map = new Map<string, Commitment[]>();
  const ids = employeeIds.filter(Boolean);
  if (ids.length === 0) return map;

  let query = projectDb("project_team_members as ptm")
    .join("projects as p", "p.id", "ptm.project_id")
    .whereIn("ptm.employee_id", ids)
    .andWhere("ptm.is_active", true)
    // A closed, cancelled or scrapped project is not a claim on
    // anybody's time. This has to agree with the allocation report, or
    // the clash warning and the report will contradict each other.
    .whereNull("p.scrapped_at")
    .andWhereNot("p.status", "closed")
    .andWhereNot("p.status", "cancelled")
    .select(
      "ptm.id",
      "ptm.employee_id",
      "ptm.project_id",
      "ptm.role_in_project",
      "ptm.allocation_percent",
      "ptm.start_date",
      "ptm.end_date",
      "p.code",
      "p.name"
    );

  if (window.excludeProjectId) query = query.andWhereNot("ptm.project_id", window.excludeProjectId);
  if (window.excludeMemberId) query = query.andWhereNot("ptm.id", window.excludeMemberId);

  const rows = (await query.catch(() => [])) as Record<string, unknown>[];

  const from = window.startDate ?? null;
  const to = window.endDate ?? null;

  for (const row of rows) {
    const start = toDateInput(row.start_date as string) || null;
    const end = toDateInput(row.end_date as string) || null;
    if (!rangesOverlap(from, to, start, end)) continue;

    const employeeId = String(row.employee_id);
    if (!map.has(employeeId)) map.set(employeeId, []);
    map.get(employeeId)!.push({
      memberId: String(row.id),
      projectId: String(row.project_id),
      projectCode: String(row.code ?? ""),
      projectName: String(row.name ?? ""),
      roleInProject: row.role_in_project ? String(row.role_in_project) : null,
      allocationPercent: Number(row.allocation_percent ?? 100),
      startDate: start,
      endDate: end,
    });
  }

  return map;
}

/** The same question for one person, with the proposed allocation folded in. */
export async function allocationPictureFor(
  employeeId: string,
  proposal: {
    allocationPercent: number;
    startDate?: string | null;
    endDate?: string | null;
    excludeProjectId?: string;
    excludeMemberId?: string;
  }
): Promise<AllocationPicture> {
  const map = await commitmentsFor([employeeId], {
    startDate: proposal.startDate,
    endDate: proposal.endDate,
    excludeProjectId: proposal.excludeProjectId,
    excludeMemberId: proposal.excludeMemberId,
  });

  const commitments = map.get(employeeId) ?? [];
  const committedPercent = commitments.reduce((sum, c) => sum + c.allocationPercent, 0);
  const totalPercent = committedPercent + Math.max(0, proposal.allocationPercent);

  return {
    commitments,
    committedPercent,
    totalPercent,
    overAllocated: totalPercent > 100,
  };
}

/** One line a person can act on, for an API message or a warning banner. */
export function describeOverallocation(name: string, picture: AllocationPicture): string {
  const where = picture.commitments
    .map((c) => `${c.projectCode} at ${c.allocationPercent}%`)
    .join(", ");
  return `${name} would be at ${picture.totalPercent}% over these dates — already on ${where}.`;
}

// ─── The rate band follows the person ──────────────────────────────
//
// Nobody should be picking a band by hand. A person's grade is on their
// employee-master row — it comes from Darwinbox — and the grade is what
// decides what they cost. Choosing it manually is a chance to get it
// wrong, and a chance to price the same grade two different ways on two
// different projects.
//
// Three steps, most specific first:
//
//   1. an active rate band whose level_code IS that grade
//   2. an active rate band NAMED for that grade ("Lead Consultant")
//   3. the grade's own default from DARWINBOX_GRADE_DETAILS
//
// Step 3 matters: it means staffing works on day one, before anybody
// has configured a single band, and the screen can say plainly that the
// figure is a grade default rather than a rate somebody agreed.

import {
  mapDarwinboxGradeToLevelCode,
  DARWINBOX_GRADE_DETAILS,
  type DarwinboxGrade,
} from "./darwinbox";

export interface SuggestedBand {
  /** The employee's normalised Darwinbox grade. */
  grade: DarwinboxGrade;
  /** Null when no configured band matched and the default was used. */
  rateBandId: string | null;
  bandName: string;
  dailyCostInr: number;
  dailyBillableRateInr: number | null;
  /** How it was arrived at, so the screen can be honest about it. */
  source: "level_code" | "band_name" | "grade_default";
}

/**
 * The band that fits this person, from their own details.
 *
 * `bands` is passed in rather than fetched so a list of forty candidates
 * costs one query, not forty.
 */
export function suggestBandFor(
  employee: { jobLevel?: string | null; job_level?: string | null },
  bands: RateBand[]
): SuggestedBand {
  const raw = employee.jobLevel ?? employee.job_level ?? null;
  const grade = mapDarwinboxGradeToLevelCode(raw);
  const details = DARWINBOX_GRADE_DETAILS[grade];

  const byCode = bands.find(
    (b) => b.levelCode?.trim().toUpperCase() === grade
  );
  if (byCode) {
    return {
      grade,
      rateBandId: byCode.id,
      bandName: byCode.bandName,
      dailyCostInr: byCode.dailyCostInr,
      dailyBillableRateInr: byCode.dailyBillableRateInr,
      source: "level_code",
    };
  }

  const byName = bands.find(
    (b) => b.bandName?.trim().toLowerCase() === details.name.toLowerCase()
  );
  if (byName) {
    return {
      grade,
      rateBandId: byName.id,
      bandName: byName.bandName,
      dailyCostInr: byName.dailyCostInr,
      dailyBillableRateInr: byName.dailyBillableRateInr,
      source: "band_name",
    };
  }

  return {
    grade,
    rateBandId: null,
    bandName: details.name,
    dailyCostInr: details.defaultCost,
    dailyBillableRateInr: details.defaultRate,
    source: "grade_default",
  };
}

/** One line for the screen, saying where the rate came from. */
export function describeBandSource(suggestion: SuggestedBand): string {
  switch (suggestion.source) {
    case "level_code":
      return `From their grade ${suggestion.grade} — ${suggestion.bandName}.`;
    case "band_name":
      return `Matched their grade ${suggestion.grade} to the "${suggestion.bandName}" band.`;
    default:
      return `No band is configured for grade ${suggestion.grade}, so the standard ${suggestion.bandName} rate is used. Add a band with level code ${suggestion.grade} under Master Data to override it.`;
  }
}
