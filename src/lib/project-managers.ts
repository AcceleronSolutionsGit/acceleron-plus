/**
 * A project's managers — reading them for many projects at once, and
 * replacing the whole list in one go.
 *
 * A project can have several PMs. There are two places that say so, and
 * both already drive permissions, so this file keeps them in step rather
 * than inventing a third:
 *
 *   - `projects.project_manager_user_id` — the lead PM, shown first.
 *   - `project_team_members` rows whose role is PM.
 *
 * Every PM chosen here is on the team with the PM role. Someone added
 * only to manage joins at 0% allocation, so naming a PM never claims a
 * week of their time in the allocation report — the Team tab is where
 * their time is set. Somebody taken off the PM list who is doing real
 * work on the project (allocation above 0) stays on the team as Team
 * Lead; somebody who was only there to manage leaves the team (or is
 * marked inactive if they have logged time, as the Team tab does).
 */
import { identityDb, projectDb, itsmDb } from "./db";
import { normaliseProjectRole } from "./permissions";
import { PM, TEAM_LEAD } from "./team-roles";
import { listRateBands, suggestBandFor, plannedCostFor } from "./staffing";
import type { ProjectManagerRef, PmCandidate } from "./types";

export type { ProjectManagerRef, PmCandidate };

export class ManagerInputError extends Error {}

const MAX_MANAGERS = 12;

interface UserLike {
  id: string;
  fullName?: string;
  darwinboxRef?: string;
  jobLevel?: string;
}

// ─── Reading ──────────────────────────────────────────────────────

/**
 * The managers of every project passed in, lead first then the team
 * PMs by name. One query for the whole list, whatever its length.
 */
export async function managersForProjects(
  rows: { id: string; project_manager_user_id?: string | null }[],
  userMap: Map<string, UserLike>
): Promise<Map<string, ProjectManagerRef[]>> {
  const out = new Map<string, ProjectManagerRef[]>();
  if (rows.length === 0) return out;

  const teamRows = (await projectDb("project_team_members")
    .whereIn(
      "project_id",
      rows.map((r) => r.id)
    )
    .andWhere("is_active", true)
    .whereNotNull("role_in_project")
    .select("project_id", "user_id", "employee_id", "user_name", "role_in_project")
    .catch(() => [])) as {
    project_id: string;
    user_id: string | null;
    employee_id: string | null;
    user_name: string | null;
    role_in_project: string | null;
  }[];

  const teamPmsByProject = new Map<string, typeof teamRows>();
  for (const row of teamRows) {
    if (normaliseProjectRole(row.role_in_project) !== "manager") continue;
    const list = teamPmsByProject.get(row.project_id) ?? [];
    list.push(row);
    teamPmsByProject.set(row.project_id, list);
  }

  for (const project of rows) {
    const list: ProjectManagerRef[] = [];
    const seen = new Set<string>();
    const remember = (ids: (string | null | undefined)[]) =>
      ids.forEach((id) => id && seen.add(String(id)));

    const leadId = project.project_manager_user_id ? String(project.project_manager_user_id) : null;
    if (leadId) {
      const user = userMap.get(leadId);
      const employeeId = user?.darwinboxRef ?? null;
      list.push({
        key: employeeId ? `emp:${employeeId}` : `user:${leadId}`,
        employeeId,
        userId: leadId,
        fullName: user?.fullName ?? "Unknown person",
        jobLevel: user?.jobLevel ?? null,
        isLead: true,
      });
      remember([leadId, employeeId, user?.id]);
    }

    const team = (teamPmsByProject.get(project.id) ?? []).slice().sort((a, b) =>
      String(a.user_name ?? "").localeCompare(String(b.user_name ?? ""))
    );
    for (const row of team) {
      if (seen.has(String(row.user_id)) || (row.employee_id && seen.has(String(row.employee_id)))) continue;
      const user = userMap.get(String(row.employee_id ?? "")) ?? userMap.get(String(row.user_id ?? ""));
      const employeeId = row.employee_id ?? user?.darwinboxRef ?? null;
      list.push({
        key: employeeId ? `emp:${employeeId}` : `user:${row.user_id}`,
        employeeId,
        userId: row.user_id ?? null,
        fullName: row.user_name ?? user?.fullName ?? "Unknown person",
        jobLevel: user?.jobLevel ?? null,
        isLead: false,
      });
      remember([row.user_id, row.employee_id, user?.id]);
    }

    out.set(project.id, list);
  }

  return out;
}

/**
 * Everyone who can be picked: active employees, plus app accounts that
 * have no employee record (they can be the lead PM, not a team PM).
 */
export async function listPmCandidates(): Promise<PmCandidate[]> {
  const [employees, users] = await Promise.all([
    identityDb("employee_master")
      .where("is_active", true)
      .select(
        "employee_id",
        "full_name",
        "company_email_id",
        "job_level",
        "designation",
        "department",
        "internal_department",
        "office_location"
      )
      .orderBy("full_name", "asc")
      .catch(() => [] as Record<string, unknown>[]),
    identityDb("users")
      .select("*")
      .catch(() => [] as Record<string, unknown>[]),
  ]);

  const userByEmail = new Map<string, Record<string, unknown>>();
  const userByRef = new Map<string, Record<string, unknown>>();
  for (const u of users) {
    if (u.email) userByEmail.set(String(u.email).toLowerCase(), u);
    if (u.darwinbox_ref) userByRef.set(String(u.darwinbox_ref), u);
  }

  const claimedUsers = new Set<string>();
  const out: PmCandidate[] = [];

  for (const e of employees) {
    const employeeId = String(e.employee_id);
    const email = e.company_email_id ? String(e.company_email_id) : null;
    const user = userByRef.get(employeeId) ?? (email ? userByEmail.get(email.toLowerCase()) : undefined);
    if (user) claimedUsers.add(String(user.id));
    out.push({
      key: `emp:${employeeId}`,
      employeeId,
      userId: user ? String(user.id) : null,
      fullName: String(e.full_name ?? employeeId),
      email,
      jobLevel: (e.job_level as string | null) ?? null,
      designation: (e.designation as string | null) ?? null,
      department: ((e.internal_department ?? e.department) as string | null) ?? null,
      location: (e.office_location as string | null) ?? null,
    });
  }

  for (const u of users) {
    if (claimedUsers.has(String(u.id)) || u.is_active === false) continue;
    out.push({
      key: `user:${u.id}`,
      employeeId: null,
      userId: String(u.id),
      fullName: String(u.full_name ?? u.email ?? "Unnamed account"),
      email: u.email ? String(u.email) : null,
      jobLevel: null,
      designation: null,
      department: null,
      location: null,
    });
  }

  return out.sort((a, b) => a.fullName.localeCompare(b.fullName));
}

// ─── Writing ──────────────────────────────────────────────────────

function parseKey(raw: unknown): { kind: "emp" | "user"; id: string } {
  const text = String(raw ?? "").trim();
  const match = /^(emp|user):(.{1,120})$/.exec(text);
  if (!match) throw new ManagerInputError("Each manager must be a person picked from the list.");
  return { kind: match[1] as "emp" | "user", id: match[2] };
}

/**
 * Replace a project's PM list. `keys` is ordered — the first person is
 * the lead PM. An empty list clears every PM. Permission checks are the
 * caller's job; this only does the writing.
 */
export async function setProjectManagers(projectId: string, rawKeys: unknown): Promise<void> {
  if (!Array.isArray(rawKeys)) throw new ManagerInputError("Send the managers as a list.");
  const parsed = rawKeys.map(parseKey);
  const keys = parsed.filter(
    (k, i) => parsed.findIndex((o) => o.kind === k.kind && o.id === k.id) === i
  );
  if (keys.length > MAX_MANAGERS) {
    throw new ManagerInputError(`A project can have at most ${MAX_MANAGERS} PMs.`);
  }

  const employeeIds = keys.filter((k) => k.kind === "emp").map((k) => k.id);
  const accountIds = keys.filter((k) => k.kind === "user").map((k) => k.id);

  const [employees, accounts] = await Promise.all([
    employeeIds.length
      ? identityDb("employee_master").whereIn("employee_id", employeeIds).select("*")
      : Promise.resolve([] as Record<string, unknown>[]),
    accountIds.length
      ? identityDb("users").whereIn("id", accountIds).select("id", "full_name", "email")
      : Promise.resolve([] as Record<string, unknown>[]),
  ]);

  const employeeById = new Map(employees.map((e: Record<string, unknown>) => [String(e.employee_id), e]));
  const missingEmployee = employeeIds.find((id) => !employeeById.has(id));
  if (missingEmployee) {
    throw new ManagerInputError(
      `Employee ${missingEmployee} is not in the employee master. Run the Darwinbox sync first.`
    );
  }
  const accountById = new Map(accounts.map((u: Record<string, unknown>) => [String(u.id), u]));
  if (accountIds.some((id) => !accountById.has(id))) {
    throw new ManagerInputError("One of the chosen people no longer has an account.");
  }
  // An account with no employee record cannot be put on the team, so it
  // can only be the lead PM named on the project.
  const extraAccount = keys.find((k, i) => k.kind === "user" && i > 0);
  if (extraAccount) {
    const name = String(accountById.get(extraAccount.id)?.full_name ?? "That person");
    throw new ManagerInputError(
      `${name} has no employee record, so they can only be the lead PM. Move them to the top or remove them.`
    );
  }

  // Timesheets and permissions key off identity_db.users.id; fall back
  // to the employee id for somebody who has never signed in — the same
  // rule the Team tab uses.
  const emails = employees
    .map((e: Record<string, unknown>) => String(e.company_email_id ?? "").trim().toLowerCase())
    .filter(Boolean);
  const users = emails.length
    ? await identityDb("users")
        .whereRaw(`lower(email) in (${emails.map(() => "?").join(", ")})`, emails)
        .select("id", "email")
    : [];
  const userIdByEmail = new Map(users.map((u: Record<string, unknown>) => [String(u.email).toLowerCase(), String(u.id)]));
  const userIdFor = (e: Record<string, unknown>) =>
    userIdByEmail.get(String(e.company_email_id ?? "").trim().toLowerCase()) ?? String(e.employee_id);

  const project = await projectDb("projects")
    .where("id", projectId)
    .first<{ id: string; start_date: string | null; planned_end_date: string | null } | undefined>();
  if (!project) throw new ManagerInputError("That project no longer exists.");

  const bands = employeeIds.length ? await listRateBands() : [];
  const now = new Date();
  const lead = keys[0];
  const leadUserId = !lead ? null : lead.kind === "user" ? lead.id : userIdFor(employeeById.get(lead.id)!);

  await projectDb.transaction(async (trx) => {
    const teamRows = (await trx("project_team_members")
      .where("project_id", projectId)
      .select("id", "user_id", "employee_id", "role_in_project", "allocation_percent", "is_active")) as {
      id: string;
      user_id: string | null;
      employee_id: string | null;
      role_in_project: string | null;
      allocation_percent: number | null;
      is_active: boolean | null;
    }[];

    const chosenRowIds = new Set<string>();

    for (const key of keys) {
      if (key.kind !== "emp") continue;
      const employee = employeeById.get(key.id)!;
      const userId = userIdFor(employee);
      const existing = teamRows.find(
        (r) => r.employee_id === key.id || r.user_id === key.id || r.user_id === userId
      );

      if (existing) {
        chosenRowIds.add(existing.id);
        if (normaliseProjectRole(existing.role_in_project) !== "manager" || existing.is_active === false) {
          await trx("project_team_members")
            .where("id", existing.id)
            .update({ role_in_project: PM, is_active: true, updated_at: now });
        }
        continue;
      }

      const band = suggestBandFor(employee as { job_level?: string | null }, bands);
      const planned = plannedCostFor({
        startDate: project.start_date,
        endDate: project.planned_end_date,
        allocationPercent: 0,
        dailyCostInr: band.dailyCostInr,
        dailyBillableRateInr: band.dailyBillableRateInr,
      });
      const [inserted] = await trx("project_team_members")
        .insert({
          project_id: projectId,
          user_id: userId,
          employee_id: key.id,
          user_name: employee.full_name ?? null,
          rate_band_id: band.rateBandId || null,
          rate_band_name: band.bandName ?? null,
          role_in_project: PM,
          allocation_percent: 0,
          start_date: null,
          end_date: null,
          daily_cost_inr: band.dailyCostInr ?? null,
          daily_billable_rate_inr: band.dailyBillableRateInr ?? null,
          planned_days: planned.plannedDays,
          planned_cost_inr: planned.plannedCostInr,
          planned_billable_inr: planned.plannedBillableInr,
          notes: "Added as PM from the Projects list.",
          is_active: true,
          created_at: now,
          updated_at: now,
        })
        .returning("id");
      const insertedId = inserted && typeof inserted === "object" ? (inserted as { id: string }).id : inserted;
      chosenRowIds.add(String(insertedId));
    }

    // PMs no longer on the list.
    for (const row of teamRows) {
      if (chosenRowIds.has(row.id)) continue;
      if (row.is_active === false) continue;
      if (normaliseProjectRole(row.role_in_project) !== "manager") continue;

      if (Number(row.allocation_percent ?? 0) > 0) {
        await trx("project_team_members")
          .where("id", row.id)
          .update({ role_in_project: TEAM_LEAD, updated_at: now });
        continue;
      }

      const logged = await trx("project_timesheets")
        .where({ project_id: projectId, user_id: String(row.user_id) })
        .count("* as n")
        .first<{ n: string }>()
        .catch(() => ({ n: "0" }));
      if (Number(logged?.n ?? 0) > 0) {
        await trx("project_team_members")
          .where("id", row.id)
          .update({ is_active: false, updated_at: now });
      } else {
        await trx("project_team_members").where("id", row.id).del();
      }
    }

    // The lead PM on the project row.
    await trx("projects")
      .where("id", projectId)
      .update({ project_manager_user_id: leadUserId, updated_at: now });
  });

  // The ITSM context mirrors the lead PM. Not worth failing the save over.
  await itsmDb("project_contexts")
    .where("project_db_id", projectId)
    .update({ pm_user_id: leadUserId, updated_at: now })
    .catch(() => undefined);
}
