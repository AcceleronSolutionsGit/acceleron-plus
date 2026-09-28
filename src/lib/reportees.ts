// Who reports to whom, for approvals.
//
// Timesheets and allocation requests are approved by the person's
// reporting manager. Darwinbox gives us that as
// employee_master.direct_manager_employee_id — an *employee* id — while
// the app works in user ids, so this file does the translation in one
// place. employee_master.reporting_manager_user_id is honoured too, for
// anyone who was linked by hand, but nothing fills it automatically:
// relying on it alone meant no manager ever saw a single request.

import { identityDb } from "./db";

/** The caller's Darwinbox employee id, if their account is linked to one. */
export async function employeeIdForUser(userId: string): Promise<string | null> {
  const user = (await identityDb("users")
    .where("id", userId)
    .select("darwinbox_ref", "email")
    .first()
    .catch(() => undefined)) as { darwinbox_ref?: string | null; email?: string | null } | undefined;
  if (!user) return null;
  if (user.darwinbox_ref) return String(user.darwinbox_ref);
  if (!user.email) return null;
  const row = (await identityDb("employee_master")
    .whereRaw("lower(company_email_id) = ?", [String(user.email).toLowerCase()])
    .select("employee_id")
    .first()
    .catch(() => undefined)) as { employee_id?: string | null } | undefined;
  return row?.employee_id ? String(row.employee_id) : null;
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
