// Who reports to whom, for approvals.
//
// Timesheets and allocation requests are approved by the person's
// reporting manager. Darwinbox gives us that as
// employee_master.direct_manager_employee_id — an *employee* id — while
// the app works in user ids, so this file does the translation in one
// place. employee_master.reporting_manager_user_id is honoured too, for
// anyone who was linked by hand, but nothing fills it automatically:
// relying on it alone meant no manager ever saw a single request.

import { identityDb, projectDb } from "./db";
import { normaliseProjectRole } from "./permissions";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ReportingManagerInfo {
  userId: string | null;
  employeeId: string | null;
  fullName: string | null;
  email: string | null;
}

/** The caller's Darwinbox employee id, if their account is linked to one. */
export async function employeeIdForUser(userId: string): Promise<string | null> {
  const user = (await identityDb("users")
    .where("id", userId)
    .select("darwinbox_ref", "email")
    .first()
    .catch(() => undefined)) as { darwinbox_ref?: string | null; email?: string | null } | undefined;
  if (!user) return null;
  if (user.darwinbox_ref) return String(user.darwinbox_ref).trim();
  if (!user.email) return null;
  const row = (await identityDb("employee_master")
    .whereRaw("lower(company_email_id) = ?", [String(user.email).toLowerCase()])
    .select("employee_id")
    .first()
    .catch(() => undefined)) as { employee_id?: string | null } | undefined;
  return row?.employee_id ? String(row.employee_id).trim() : null;
}

/**
 * Resolve the Reporting Manager (RM) for a given userId.
 * Checks employee_master.reporting_manager_user_id first, then resolves
 * employee_master.direct_manager_employee_id to a user account in identity_db.
 */
export async function reportingManagerFor(userId: string): Promise<ReportingManagerInfo | null> {
  if (!userId) return null;
  const user = (await identityDb("users")
    .where("id", userId)
    .select("darwinbox_ref", "email", "full_name")
    .first()
    .catch(() => undefined)) as
    | { darwinbox_ref?: string | null; email?: string | null; full_name?: string | null }
    | undefined;
  if (!user) return null;

  const empRow = (await identityDb("employee_master")
    .where((q) => {
      if (user.darwinbox_ref) q.where("employee_id", String(user.darwinbox_ref).trim());
      if (user.email) {
        if (user.darwinbox_ref) {
          q.orWhereRaw("lower(trim(company_email_id)) = ?", [String(user.email).trim().toLowerCase()]);
        } else {
          q.whereRaw("lower(trim(company_email_id)) = ?", [String(user.email).trim().toLowerCase()]);
        }
      }
    })
    .select("reporting_manager_user_id", "direct_manager_employee_id", "reporting_manager_name")
    .first()
    .catch(() => undefined)) as
    | {
        reporting_manager_user_id?: string | null;
        direct_manager_employee_id?: string | null;
        reporting_manager_name?: string | null;
      }
    | undefined;

  if (!empRow) return null;

  if (empRow.reporting_manager_user_id && empRow.reporting_manager_user_id !== userId) {
    const rmUser = (await identityDb("users")
      .where("id", empRow.reporting_manager_user_id)
      .select("id", "full_name", "email", "darwinbox_ref")
      .first()
      .catch(() => undefined)) as
      | { id: string; full_name?: string | null; email?: string | null; darwinbox_ref?: string | null }
      | undefined;
    if (rmUser) {
      return {
        userId: String(rmUser.id),
        employeeId: rmUser.darwinbox_ref ? String(rmUser.darwinbox_ref).trim() : null,
        fullName: rmUser.full_name ? String(rmUser.full_name) : empRow.reporting_manager_name ?? null,
        email: rmUser.email ? String(rmUser.email) : null,
      };
    }
  }

  const mgrEmpId = empRow.direct_manager_employee_id
    ? String(empRow.direct_manager_employee_id).trim()
    : null;
  if (!mgrEmpId) {
    return empRow.reporting_manager_name
      ? { userId: null, employeeId: null, fullName: String(empRow.reporting_manager_name), email: null }
      : null;
  }

  const mgrEmp = (await identityDb("employee_master")
    .where("employee_id", mgrEmpId)
    .select("employee_id", "full_name", "company_email_id")
    .first()
    .catch(() => undefined)) as
    | { employee_id: string; full_name?: string | null; company_email_id?: string | null }
    | undefined;

  const mgrEmail = mgrEmp?.company_email_id ? String(mgrEmp.company_email_id).trim().toLowerCase() : null;

  const rmUser = (await identityDb("users")
    .where((q) => {
      q.where("darwinbox_ref", mgrEmpId);
      if (mgrEmail) q.orWhereRaw("lower(trim(email)) = ?", [mgrEmail]);
    })
    .select("id", "full_name", "email", "darwinbox_ref")
    .first()
    .catch(() => undefined)) as
    | { id: string; full_name?: string | null; email?: string | null; darwinbox_ref?: string | null }
    | undefined;

  const rmUserId = rmUser && String(rmUser.id) !== userId ? String(rmUser.id) : null;
  return {
    userId: rmUserId,
    employeeId: mgrEmpId,
    fullName: rmUser?.full_name ?? mgrEmp?.full_name ?? empRow.reporting_manager_name ?? null,
    email: rmUser?.email ?? mgrEmp?.company_email_id ?? null,
  };
}

export async function reportingManagerUserIdFor(userId: string): Promise<string | null> {
  const info = await reportingManagerFor(userId);
  return info?.userId ?? null;
}

/** User ids of everyone who reports directly to `userId`. Never includes the caller. */
export async function directReportUserIds(userId: string): Promise<string[]> {
  const myEmployeeId = await employeeIdForUser(userId);

  const reportees = (await identityDb("employee_master")
    .where((q) => {
      q.where("reporting_manager_user_id", userId);
      if (myEmployeeId) q.orWhere("direct_manager_employee_id", myEmployeeId);
    })
    .select("employee_id", "company_email_id")
    .catch(() => [])) as { employee_id?: string | null; company_email_id?: string | null }[];

  const emails = reportees
    .map((r) => String(r.company_email_id ?? "").toLowerCase())
    .filter(Boolean);
  const employeeIds = reportees.map((r) => String(r.employee_id ?? "")).filter(Boolean);
  if (emails.length === 0 && employeeIds.length === 0) return [];

  const users = (await identityDb("users")
    .where((q) => {
      if (emails.length) q.whereRaw("lower(email) = ANY(?)", [emails]);
      if (employeeIds.length) q.orWhereIn("darwinbox_ref", employeeIds);
    })
    .select("id")
    .catch(() => [])) as { id: string }[];

  return [...new Set(users.map((u) => String(u.id)))].filter((id) => id !== userId);
}

export async function hasDirectReports(userId: string): Promise<boolean> {
  return (await directReportUserIds(userId)).length > 0;
}

/**
 * For a list of projectIds, returns a Map<projectId, Set<userId>> identifying
 * all Project Managers / Delivery Managers of each project (named on `projects`
 * or holding a PM/manager role on `project_team_members`).
 *
 * Used to route PM timesheets to their Reporting Manager (RM) instead of
 * allowing self-approval or peer PM approval.
 */
export async function projectManagersByProject(
  projectIds: string[]
): Promise<Map<string, Set<string>>> {
  const map = new Map<string, Set<string>>();
  const uniqueIds = [...new Set(projectIds.filter(Boolean))];
  if (uniqueIds.length === 0) return map;

  for (const pid of uniqueIds) map.set(pid, new Set());

  const [projRows, teamRows] = await Promise.all([
    projectDb("projects")
      .whereIn("id", uniqueIds)
      .select("id", "project_manager_user_id", "delivery_manager_user_id")
      .catch(() => []),
    projectDb("project_team_members")
      .whereIn("project_id", uniqueIds)
      .andWhere(function () {
        this.where("is_active", true).orWhereNull("is_active");
      })
      .select("project_id", "user_id", "employee_id", "role_in_project")
      .catch(() => []),
  ]);

  const nonUuidKeys = new Set<string>();
  const pendingResolution: Array<{ projectId: string; key: string }> = [];

  const addRawKey = (projectId: string, rawKey: unknown) => {
    if (!rawKey) return;
    const clean = String(rawKey).trim().replace(/^(user|emp):/i, "");
    if (!clean) return;
    if (UUID_REGEX.test(clean)) {
      map.get(projectId)?.add(clean);
    } else {
      nonUuidKeys.add(clean);
      pendingResolution.push({ projectId, key: clean });
    }
  };

  for (const p of projRows as Record<string, unknown>[]) {
    const pid = String(p.id);
    addRawKey(pid, p.project_manager_user_id);
    addRawKey(pid, p.delivery_manager_user_id);
  }

  for (const m of teamRows as Record<string, unknown>[]) {
    const pRole = normaliseProjectRole(m.role_in_project as string | null);
    if (pRole === "manager") {
      const pid = String(m.project_id);
      addRawKey(pid, m.user_id);
      addRawKey(pid, m.employee_id);
    }
  }

  if (nonUuidKeys.size > 0) {
    const keys = [...nonUuidKeys];
    const [usersByRef, empsById] = await Promise.all([
      identityDb("users")
        .whereIn("darwinbox_ref", keys)
        .select("id", "darwinbox_ref")
        .catch(() => []),
      identityDb("employee_master")
        .whereIn("employee_id", keys)
        .select("employee_id", "company_email_id")
        .catch(() => []),
    ]);

    const keyToUuid = new Map<string, string>();
    for (const u of usersByRef as { id: string; darwinbox_ref?: string | null }[]) {
      if (u.darwinbox_ref) keyToUuid.set(String(u.darwinbox_ref).trim(), String(u.id));
    }

    const empEmails = (empsById as { employee_id: string; company_email_id?: string | null }[])
      .map((e) => String(e.company_email_id ?? "").trim().toLowerCase())
      .filter(Boolean);
    if (empEmails.length > 0) {
      const usersByEmail = (await identityDb("users")
        .whereRaw("lower(trim(email)) = ANY(?)", [empEmails])
        .select("id", "email")
        .catch(() => [])) as { id: string; email?: string | null }[];
      const emailToUuid = new Map<string, string>();
      for (const u of usersByEmail) {
        if (u.email) emailToUuid.set(String(u.email).trim().toLowerCase(), String(u.id));
      }
      for (const e of empsById as { employee_id: string; company_email_id?: string | null }[]) {
        const em = String(e.company_email_id ?? "").trim().toLowerCase();
        if (em && emailToUuid.has(em) && !keyToUuid.has(String(e.employee_id).trim())) {
          keyToUuid.set(String(e.employee_id).trim(), emailToUuid.get(em)!);
        }
      }
    }

    for (const item of pendingResolution) {
      const resolved = keyToUuid.get(item.key);
      if (resolved) map.get(item.projectId)?.add(resolved);
    }
  }

  return map;
}
