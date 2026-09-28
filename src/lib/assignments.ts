// ═══════════════════════════════════════════════════════════════
// Task assignment — who is doing which work package.
//
// `wbs_items.owner_user_id` names the one person accountable. This is
// the work itself: a package split between several people, each with
// their own planned hours, status and progress.
//
// The package's progress rolls **up** from its assignees, weighted by
// planned hours, rather than being typed over the top. A package where
// one person has done 100% of 8 hours and another 0% of 32 is 20%
// complete, not 50% — and the plan should say so.
// ═══════════════════════════════════════════════════════════════

import { projectDb } from "./db";
import { toDateInput } from "./dates";
import { can, type AccessContext } from "./permissions";

export const ASSIGNMENT_STATUSES = [
  "not_started",
  "in_progress",
  "blocked",
  "completed",
] as const;

export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export interface Assignment {
  id: string;
  projectId: string;
  wbsItemId: string;
  userId: string;
  employeeId: string | null;
  userName: string | null;
  plannedHours: number | null;
  loggedHours: number;
  progressPercent: number;
  status: AssignmentStatus;
  startDate: string | null;
  dueDate: string | null;
  notes: string | null;
  completedAt: string | null;
  /** True when the person asking is the one this is allotted to. */
  isMine?: boolean;
  /** True when the person asking may change it. */
  canUpdate?: boolean;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function mapRow(row: Record<string, unknown>): Assignment {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    wbsItemId: String(row.wbs_item_id),
    userId: String(row.user_id),
    employeeId: row.employee_id ? String(row.employee_id) : null,
    userName: row.user_name ? String(row.user_name) : null,
    plannedHours:
      row.planned_hours === null || row.planned_hours === undefined
        ? null
        : Number(row.planned_hours),
    loggedHours: Number(row.logged_hours ?? 0),
    progressPercent: Number(row.progress_percent ?? 0),
    status: (row.status as AssignmentStatus) ?? "not_started",
    startDate: toDateInput(row.start_date as string) || null,
    dueDate: toDateInput(row.due_date as string) || null,
    notes: row.notes ? String(row.notes) : null,
    completedAt: row.completed_at ? new Date(row.completed_at as string).toISOString() : null,
  };
}

// ─── Reading ───────────────────────────────────────────────────────

/** Every assignment on a project, keyed by work package. */
export async function assignmentsByWbsItem(
  projectId: string
): Promise<Map<string, Assignment[]>> {
  const rows = (await projectDb("wbs_assignments")
    .where("project_id", projectId)
    .orderBy([{ column: "wbs_item_id" }, { column: "created_at" }])
    .catch(() => [])) as Record<string, unknown>[];

  const map = new Map<string, Assignment[]>();
  for (const row of rows) {
    const key = String(row.wbs_item_id);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(mapRow(row));
  }
  return map;
}

/** The assignments on one work package. */
export async function assignmentsFor(wbsItemId: string): Promise<Assignment[]> {
  const rows = (await projectDb("wbs_assignments")
    .where("wbs_item_id", wbsItemId)
    .orderBy("created_at")
    .catch(() => [])) as Record<string, unknown>[];
  return rows.map(mapRow);
}

export interface MyTask extends Assignment {
  projectCode: string;
  projectName: string;
  wbsCode: string | null;
  wbsName: string;
  wbsStatus: string | null;
  /** Days until the due date; negative when it has passed. */
  daysRemaining: number | null;
  overdue: boolean;
}

/**
 * Everything allotted to one person, across every project.
 *
 * This is the view a delivery person actually lives in — their own work
 * does not respect project boundaries, and hunting through six project
 * pages to find it is how things get forgotten.
 */
export async function tasksForUser(
  userId: string,
  options: { includeCompleted?: boolean } = {}
): Promise<MyTask[]> {
  let query = projectDb("wbs_assignments as a")
    .join("wbs_items as w", "w.id", "a.wbs_item_id")
    .join("projects as p", "p.id", "a.project_id")
    .where("a.user_id", userId)
    .whereNot("p.status", "cancelled")
    .select(
      "a.*",
      "w.code as wbs_code",
      "w.name as wbs_name",
      "w.status as wbs_status",
      "p.code as project_code",
      "p.name as project_name"
    );

  if (!options.includeCompleted) query = query.whereNot("a.status", "completed");

  const rows = (await query
    .orderBy([{ column: "a.due_date", order: "asc", nulls: "last" }, { column: "p.code" }])
    .catch(() => [])) as Record<string, unknown>[];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return rows.map((row) => {
    const base = mapRow(row);
    const due = base.dueDate ? new Date(`${base.dueDate}T00:00:00`) : null;
    const daysRemaining = due
      ? Math.round((due.getTime() - today.getTime()) / 86400000)
      : null;

    return {
      ...base,
      projectCode: String(row.project_code ?? ""),
      projectName: String(row.project_name ?? ""),
      wbsCode: row.wbs_code ? String(row.wbs_code) : null,
      wbsName: String(row.wbs_name ?? ""),
      wbsStatus: row.wbs_status ? String(row.wbs_status) : null,
      daysRemaining,
      overdue: daysRemaining !== null && daysRemaining < 0 && base.status !== "completed",
    };
  });
}

// ─── The roll-up ───────────────────────────────────────────────────

export interface Rollup {
  assignedCount: number;
  assignedHours: number;
  progressPercent: number;
}

/**
 * Recompute a work package from its assignees and write it back.
 *
 * Progress is weighted by planned hours, so the person carrying four
 * days of the work moves the number four times as far as the person
 * carrying one. With no hours anywhere it falls back to a plain mean,
 * which is the best available reading rather than a wrong one.
 *
 * A package with nobody on it is left alone: its progress is whatever
 * somebody set by hand, and zeroing it would destroy that.
 */
export async function recalculateWbsItem(wbsItemId: string): Promise<Rollup | null> {
  const rows = (await projectDb("wbs_assignments")
    .where("wbs_item_id", wbsItemId)
    .select("planned_hours", "progress_percent", "status")
    .catch(() => [])) as Record<string, unknown>[];

  if (rows.length === 0) {
    await projectDb("wbs_items")
      .where("id", wbsItemId)
      .update({ assigned_count: 0, assigned_hours: 0, updated_at: new Date() })
      .catch(() => undefined);
    return null;
  }

  const totalHours = rows.reduce((sum, r) => sum + Number(r.planned_hours ?? 0), 0);

  const progress =
    totalHours > 0
      ? rows.reduce(
          (sum, r) => sum + Number(r.progress_percent ?? 0) * Number(r.planned_hours ?? 0),
          0
        ) / totalHours
      : rows.reduce((sum, r) => sum + Number(r.progress_percent ?? 0), 0) / rows.length;

  const rollup: Rollup = {
    assignedCount: rows.length,
    assignedHours: round2(totalHours),
    progressPercent: Math.round(progress),
  };

  // Everyone finished means the package is finished; anybody actually
  // moving means it is under way. "Blocked" is left to a human, because
  // one blocked assignee does not necessarily stop the package.
  const everyoneDone = rows.every((r) => r.status === "completed");
  const anyoneStarted = rows.some(
    (r) => r.status === "in_progress" || Number(r.progress_percent ?? 0) > 0
  );

  const update: Record<string, unknown> = {
    assigned_count: rollup.assignedCount,
    assigned_hours: rollup.assignedHours,
    progress_percent: rollup.progressPercent,
    updated_at: new Date(),
  };

  const item = await projectDb("wbs_items").where("id", wbsItemId).first();
  if (item && item.status !== "blocked") {
    if (everyoneDone) update.status = "completed";
    else if (anyoneStarted) update.status = "in_progress";
  }

  await projectDb("wbs_items").where("id", wbsItemId).update(update).catch(() => undefined);
  return rollup;
}

// ─── Who may change what ───────────────────────────────────────────

/**
 * Whether this person may update this assignment.
 *
 * Somebody with plan.edit — a PM, a lead, an admin — may update any
 * assignment on the project. Everybody else may update only their own,
 * and only the fields that describe their own work. This is what stops
 * one person quietly overwriting another's status.
 */
export function canUpdateAssignment(
  access: AccessContext,
  assignment: { userId: string },
  currentUserId: string | null
): boolean {
  if (can(access, "plan.edit")) return true;
  if (!currentUserId) return false;
  return assignment.userId === currentUserId && can(access, "plan.updateProgress");
}

/** The same question, phrased for an error message. */
export function describeUpdateRefusal(assignment: { userName: string | null }): string {
  return `That work is allotted to ${assignment.userName ?? "somebody else"}. You can update your own assignments; a project manager can update anyone's.`;
}

// ─── How loaded is somebody, in hours ──────────────────────────────

export interface AssignedLoad {
  userId: string;
  assignedHours: number;
  openAssignments: number;
}

/**
 * Hours already allotted to these people on open work, so assigning
 * more can say whether it fits what they were staffed for.
 */
export async function assignedLoadFor(
  userIds: string[],
  options: { excludeWbsItemId?: string } = {}
): Promise<Map<string, AssignedLoad>> {
  const map = new Map<string, AssignedLoad>();
  const ids = userIds.filter(Boolean);
  if (ids.length === 0) return map;

  let query = projectDb("wbs_assignments as a")
    .join("projects as p", "p.id", "a.project_id")
    .whereIn("a.user_id", ids)
    .whereNot("a.status", "completed")
    .whereNot("p.status", "closed")
    .whereNot("p.status", "cancelled");

  if (options.excludeWbsItemId) query = query.whereNot("a.wbs_item_id", options.excludeWbsItemId);

  const rows = (await query
    .groupBy("a.user_id")
    .select("a.user_id")
    .sum({ hours: "a.planned_hours" })
    .count({ n: "a.id" })
    .catch(() => [])) as Record<string, unknown>[];

  for (const row of rows) {
    map.set(String(row.user_id), {
      userId: String(row.user_id),
      assignedHours: round2(Number(row.hours ?? 0)),
      openAssignments: Number(row.n ?? 0),
    });
  }
  return map;
}
