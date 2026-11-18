// GET  /api/pmt/timesheets/missing  — team members NOT filling timesheets in PM's projects
// POST /api/pmt/timesheets/missing  — send in-app + email reminder to selected team member(s)
//
// Admins see missing timesheets across all active projects.
// PMs / DMs see allocated team members who haven't filled timesheets on their managed projects.
// RMs also see their direct reports who haven't filled timesheets on their allocated projects.

import { NextResponse } from "next/server";
import { identityDb, projectDb } from "@/lib/db";
import { requireSession, projectsManagedBy } from "@/lib/auth";
import { directReportUserIds } from "@/lib/reportees";
import { toDateInput } from "@/lib/dates";
import { readJson, serverError } from "@/lib/route-helpers";
import { notify } from "@/lib/notifications";

export const runtime = "nodejs";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function todayIST(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function getMondayAndSunday(anchorStr: string): { weekStart: string; weekEnd: string } {
  const clean = /^\d{4}-\d{2}-\d{2}$/.test(anchorStr) ? anchorStr : todayIST();
  const [y, m, d] = clean.split("-").map(Number);
  const anchor = new Date(Date.UTC(y, m - 1, d));
  const dow = anchor.getUTCDay();
  const monday = new Date(anchor);
  monday.setUTCDate(monday.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  const sunday = new Date(monday);
  sunday.setUTCDate(sunday.getUTCDate() + 6);
  return {
    weekStart: monday.toISOString().slice(0, 10),
    weekEnd: sunday.toISOString().slice(0, 10),
  };
}

export async function GET(req: Request) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;
    const userId = auth.session.userId;
    const isAdmin =
      auth.session.role === "admin" ||
      Boolean(auth.session.additionalRoles?.includes("admin"));

    const url = new URL(req.url);
    const weekParam = url.searchParams.get("week") || todayIST();
    const projectFilter = url.searchParams.get("project") || "";
    const search = (url.searchParams.get("search") || "").trim().toLowerCase();
    const { weekStart, weekEnd } = getMondayAndSunday(weekParam);

    const [reportees, managedSet] = isAdmin
      ? [[], new Set<string>()]
      : await Promise.all([
          directReportUserIds(userId),
          projectsManagedBy(userId),
        ]);
    const reporteeSet = new Set(reportees);
    const managedProjectIds = Array.from(managedSet);

    if (!isAdmin && reportees.length === 0 && managedProjectIds.length === 0) {
      return NextResponse.json({
        success: true,
        weekStart,
        weekEnd,
        individuals: [],
        summary: {
          totalAllocated: 0,
          missingCount: 0,
          notLoggedCount: 0,
          draftOnlyCount: 0,
          compliantCount: 0,
        },
        projects: [],
      });
    }

    // 1. Fetch active allocations on live projects
    let allocQuery = projectDb("project_team_members as m")
      .join("projects as p", "p.id", "m.project_id")
      .where(function () {
        this.where("m.is_active", true).orWhereNull("m.is_active");
      })
      .whereNotIn("p.status", ["closed", "cancelled", "scrapped"])
      .select(
        "m.id as member_id",
        "m.project_id",
        "p.code as project_code",
        "p.name as project_name",
        "m.user_id",
        "m.employee_id",
        "m.user_name",
        "m.role_in_project",
        "m.allocation_percent",
        "m.start_date",
        "m.end_date"
      );

    if (projectFilter) {
      allocQuery = allocQuery.where("m.project_id", projectFilter);
    }

    if (!isAdmin) {
      // Narrow in SQL to managed projects OR reportees (if we also check reportee employee IDs below,
      // fetch allocations for managed projects + all reportees' user/emp IDs)
      const reporteeUsers =
        reportees.length > 0
          ? ((await identityDb("users")
              .whereIn("id", reportees)
              .select("id", "darwinbox_ref", "full_name")
              .catch(() => [])) as Array<{ id: string; darwinbox_ref?: string | null; full_name?: string | null }>)
          : [];
      const reporteeKeys = new Set<string>(reportees);
      for (const u of reporteeUsers) {
        if (u.darwinbox_ref) reporteeKeys.add(String(u.darwinbox_ref).trim());
      }
      const keyArr = [...reporteeKeys];

      allocQuery = allocQuery.where((q) => {
        let applied = false;
        if (managedProjectIds.length > 0) {
          q.whereIn("m.project_id", managedProjectIds);
          applied = true;
        }
        if (keyArr.length > 0) {
          if (applied) {
            q.orWhereIn("m.user_id", keyArr).orWhereIn("m.employee_id", keyArr);
          } else {
            q.whereIn("m.user_id", keyArr).orWhereIn("m.employee_id", keyArr);
          }
        }
      });
    }

    const rawAllocations = (await allocQuery.catch(() => [])) as Record<string, unknown>[];

    // Filter out allocations outside this week's date window
    const activeAllocations = rawAllocations.filter((a) => {
      const start = a.start_date ? toDateInput(a.start_date as string) : null;
      const end = a.end_date ? toDateInput(a.end_date as string) : null;
      if (start && start > weekEnd) return false;
      if (end && end < weekStart) return false;
      return true;
    });

    if (activeAllocations.length === 0) {
      return NextResponse.json({
        success: true,
        weekStart,
        weekEnd,
        individuals: [],
        summary: {
          totalAllocated: 0,
          missingCount: 0,
          notLoggedCount: 0,
          draftOnlyCount: 0,
          compliantCount: 0,
        },
        projects: [],
      });
    }

    // 2. Load identity_db.users + employee_master to resolve every allocation to a canonical user
    const [allUsers, allEmployees] = await Promise.all([
      identityDb("users")
        .where(function () {
          this.where("is_active", true).orWhereNull("is_active");
        })
        .select("id", "email", "full_name", "darwinbox_ref")
        .catch(() => []),
      identityDb("employee_master")
        .select("employee_id", "company_email_id", "full_name", "designation")
        .catch(() => []),
    ]);

    interface UserProfile {
      userId: string;
      fullName: string;
      email: string | null;
      employeeId: string | null;
      designation: string | null;
    }

    const empById = new Map<string, Record<string, unknown>>();
    const empByEmail = new Map<string, Record<string, unknown>>();
    for (const e of allEmployees as Record<string, unknown>[]) {
      if (e.employee_id) empById.set(String(e.employee_id).trim(), e);
      if (e.company_email_id) empByEmail.set(String(e.company_email_id).trim().toLowerCase(), e);
    }

    const profileByUuid = new Map<string, UserProfile>();
    const profileByRef = new Map<string, UserProfile>();
    const profileByName = new Map<string, UserProfile>();

    for (const u of allUsers as Record<string, unknown>[]) {
      const uid = String(u.id);
      const email = u.email ? String(u.email).trim() : null;
      const ref = u.darwinbox_ref ? String(u.darwinbox_ref).trim() : null;
      const emp =
        (ref ? empById.get(ref) : undefined) ||
        (email ? empByEmail.get(email.toLowerCase()) : undefined);
      const empId = emp?.employee_id ? String(emp.employee_id).trim() : ref;
      const fullName = String(u.full_name || emp?.full_name || "Unknown").trim();
      const profile: UserProfile = {
        userId: uid,
        fullName,
        email,
        employeeId: empId,
        designation: emp?.designation ? String(emp.designation).trim() : null,
      };
      profileByUuid.set(uid, profile);
      if (empId) profileByRef.set(empId, profile);
      if (ref) profileByRef.set(ref, profile);
      if (fullName) profileByName.set(fullName.toLowerCase(), profile);
    }

    const resolveMember = (a: Record<string, unknown>) => {
      const rawUid = a.user_id ? String(a.user_id).trim().replace(/^(user|emp):/i, "") : "";
      const rawEmpId = a.employee_id ? String(a.employee_id).trim() : "";
      const rawName = a.user_name ? String(a.user_name).trim() : "";

      const matched =
        (rawUid && UUID_REGEX.test(rawUid) ? profileByUuid.get(rawUid) : undefined) ||
        (rawUid ? profileByRef.get(rawUid) : undefined) ||
        (rawEmpId ? profileByRef.get(rawEmpId) : undefined) ||
        (rawName ? profileByName.get(rawName.toLowerCase()) : undefined);

      if (matched) {
        return {
          key: matched.userId,
          userId: matched.userId,
          canRemind: UUID_REGEX.test(matched.userId),
          fullName: matched.fullName,
          email: matched.email,
          employeeId: matched.employeeId || rawEmpId || null,
          designation: matched.designation,
        };
      }

      const fallbackEmp = rawEmpId ? empById.get(rawEmpId) : undefined;
      const fallbackKey = rawUid || rawEmpId || rawName.toLowerCase() || String(a.member_id);
      return {
        key: fallbackKey,
        userId: rawUid || fallbackKey,
        canRemind: UUID_REGEX.test(rawUid),
        fullName: rawName || (fallbackEmp?.full_name ? String(fallbackEmp.full_name) : "Unknown"),
        email: fallbackEmp?.company_email_id ? String(fallbackEmp.company_email_id) : null,
        employeeId: rawEmpId || (fallbackEmp?.employee_id ? String(fallbackEmp.employee_id) : null),
        designation: fallbackEmp?.designation ? String(fallbackEmp.designation) : null,
      };
    };

    // 3. Query timesheets logged during [weekStart, weekEnd] AND last logged date per user
    const projectIdsInScope = [...new Set(activeAllocations.map((a) => String(a.project_id)))];
    const [weekTimesheets, lastLoggedRows] = await Promise.all([
      projectDb("project_timesheets")
        .whereIn("project_id", projectIdsInScope)
        .whereBetween("log_date", [weekStart, weekEnd])
        .select("project_id", "user_id", "hours_logged", "status")
        .catch(() => []),
      projectDb("project_timesheets")
        .select("user_id")
        .max("log_date as last_log_date")
        .groupBy("user_id")
        .catch(() => []),
    ]);

    const lastLoggedMap = new Map<string, string>();
    for (const r of lastLoggedRows as { user_id?: string | null; last_log_date?: string | Date | null }[]) {
      if (r.user_id && r.last_log_date) {
        lastLoggedMap.set(String(r.user_id), toDateInput(r.last_log_date as string));
      }
    }

    // Map (projectId::userId) -> { submittedOrApproved, draft, rejected }
    const hoursMap = new Map<
      string,
      { submittedOrApproved: number; draft: number; rejected: number }
    >();

    for (const ts of weekTimesheets as Record<string, unknown>[]) {
      const k = `${String(ts.project_id)}::${String(ts.user_id)}`;
      const rec = hoursMap.get(k) ?? { submittedOrApproved: 0, draft: 0, rejected: 0 };
      const hrs = Number(ts.hours_logged ?? 0);
      const st = String(ts.status ?? "draft");
      if (st === "submitted" || st === "pending" || st === "approved") {
        rec.submittedOrApproved = round2(rec.submittedOrApproved + hrs);
      } else if (st === "draft") {
        rec.draft = round2(rec.draft + hrs);
      } else if (st === "rejected") {
        rec.rejected = round2(rec.rejected + hrs);
      }
      hoursMap.set(k, rec);
    }

    // 4. Evaluate each allocated member per project and group missing ones by individual
    const allUniquePeople = new Set<string>();
    const projectListMap = new Map<string, { id: string; code: string; name: string }>();

    interface MissingProjectItem {
      projectId: string;
      projectCode: string;
      projectName: string;
      roleInProject: string | null;
      allocationPercent: number;
      draftHours: number;
      rejectedHours: number;
      status: "not_logged" | "draft_only" | "rejected_only";
    }

    const missingMap = new Map<
      string,
      {
        userId: string;
        canRemind: boolean;
        userName: string;
        employeeId: string | null;
        email: string | null;
        designation: string | null;
        isDirectReport: boolean;
        totalDraftHours: number;
        totalRejectedHours: number;
        lastLoggedDate: string | null;
        missingProjects: MissingProjectItem[];
        seenProjectIds: Set<string>;
      }
    >();

    for (const a of activeAllocations) {
      const pid = String(a.project_id);
      const pCode = String(a.project_code ?? "");
      const pName = String(a.project_name ?? "");
      projectListMap.set(pid, { id: pid, code: pCode, name: pName });

      const person = resolveMember(a);
      // Scope guard for non-admins: must either manage this project OR person is their direct report
      if (!isAdmin && !managedSet.has(pid) && !reporteeSet.has(person.userId)) {
        continue;
      }

      allUniquePeople.add(person.key);

      const stats = hoursMap.get(`${pid}::${person.userId}`) ?? {
        submittedOrApproved: 0,
        draft: 0,
        rejected: 0,
      };

      // Compliant on this project if they have submitted/approved hours > 0
      if (stats.submittedOrApproved > 0) continue;

      if (search) {
        const hay = `${person.fullName} ${person.employeeId ?? ""} ${person.email ?? ""} ${pCode} ${pName}`.toLowerCase();
        if (!hay.includes(search)) continue;
      }

      const projStatus: "not_logged" | "draft_only" | "rejected_only" =
        stats.draft > 0
          ? "draft_only"
          : stats.rejected > 0
          ? "rejected_only"
          : "not_logged";

      let entry = missingMap.get(person.key);
      if (!entry) {
        entry = {
          userId: person.userId,
          canRemind: person.canRemind,
          userName: person.fullName,
          employeeId: person.employeeId,
          email: person.email,
          designation: person.designation,
          isDirectReport: reporteeSet.has(person.userId),
          totalDraftHours: 0,
          totalRejectedHours: 0,
          lastLoggedDate: lastLoggedMap.get(person.userId) ?? null,
          missingProjects: [],
          seenProjectIds: new Set(),
        };
        missingMap.set(person.key, entry);
      }

      if (entry.seenProjectIds.has(pid)) continue;
      entry.seenProjectIds.add(pid);

      entry.totalDraftHours = round2(entry.totalDraftHours + stats.draft);
      entry.totalRejectedHours = round2(entry.totalRejectedHours + stats.rejected);
      entry.missingProjects.push({
        projectId: pid,
        projectCode: pCode,
        projectName: pName,
        roleInProject: a.role_in_project ? String(a.role_in_project) : null,
        allocationPercent: Number(a.allocation_percent ?? 100),
        draftHours: stats.draft,
        rejectedHours: stats.rejected,
        status: projStatus,
      });
    }

    const individuals = [...missingMap.values()]
      .map((m) => {
        const hasNotLogged = m.missingProjects.some((p) => p.status === "not_logged");
        const hasDraft = m.missingProjects.some((p) => p.status === "draft_only");
        const overallStatus: "not_logged" | "draft_only" | "rejected_only" = hasNotLogged
          ? "not_logged"
          : hasDraft
          ? "draft_only"
          : "rejected_only";

        return {
          userId: m.userId,
          canRemind: m.canRemind,
          userName: m.userName,
          employeeId: m.employeeId,
          email: m.email,
          designation: m.designation,
          isDirectReport: m.isDirectReport,
          status: overallStatus,
          totalDraftHours: m.totalDraftHours,
          totalRejectedHours: m.totalRejectedHours,
          lastLoggedDate: m.lastLoggedDate,
          missingProjectCount: m.missingProjects.length,
          missingProjects: m.missingProjects.sort((a, b) =>
            a.projectCode.localeCompare(b.projectCode)
          ),
        };
      })
      .sort((a, b) => {
        // Put "not_logged" first, then "draft_only", then alphabetically
        const order = { not_logged: 0, draft_only: 1, rejected_only: 2 };
        return order[a.status] - order[b.status] || a.userName.localeCompare(b.userName);
      });

    const notLoggedCount = individuals.filter((i) => i.status === "not_logged").length;
    const draftOnlyCount = individuals.filter((i) => i.status === "draft_only").length;
    const totalAllocated = allUniquePeople.size;
    const missingCount = individuals.length;

    return NextResponse.json({
      success: true,
      weekStart,
      weekEnd,
      individuals,
      summary: {
        totalAllocated,
        missingCount,
        notLoggedCount,
        draftOnlyCount,
        compliantCount: Math.max(0, totalAllocated - missingCount),
      },
      projects: [...projectListMap.values()].sort((a, b) => a.code.localeCompare(b.code)),
    });
  } catch (err) {
    return serverError("pmt.timesheets.missing.GET", err);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;
    const callerId = auth.session.userId;
    const isAdmin =
      auth.session.role === "admin" ||
      Boolean(auth.session.additionalRoles?.includes("admin"));

    const parsed = await readJson(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.body as Record<string, unknown>;

    const recipients = Array.isArray(body.recipients)
      ? (body.recipients as Array<{ userId: string; projectId: string; projectName?: string }>)
      : [];
    const weekStart = String(body.weekStart ?? "");
    const weekEnd = String(body.weekEnd ?? "");

    if (recipients.length === 0) {
      return NextResponse.json({ success: false, error: "No recipients selected." }, { status: 400 });
    }

    const [reportees, managedSet] = isAdmin
      ? [[], new Set<string>()]
      : await Promise.all([
          directReportUserIds(callerId),
          projectsManagedBy(callerId),
        ]);
    const reporteeSet = new Set(reportees);

    let sent = 0;
    const today = todayIST();

    for (const r of recipients) {
      if (!r.userId || !UUID_REGEX.test(r.userId) || !r.projectId) continue;
      if (!isAdmin && !managedSet.has(r.projectId) && !reporteeSet.has(r.userId)) continue;

      const weekLabel = weekStart && weekEnd ? ` (${weekStart} to ${weekEnd})` : "";
      const res = await notify({
        project: r.projectId,
        eventType: "manual_update",
        title: "Timesheet reminder",
        message: `${auth.session.fullName || "Your Project Manager"} reminded you to log and submit your timesheet${weekLabel}${r.projectName ? ` for ${r.projectName}` : ""}.`,
        severity: "warning",
        audience: [],
        extraRecipients: [r.userId],
        actorUserId: callerId,
        actionUrl: weekStart ? `/my-timesheet?week=${weekStart}` : "/my-timesheet",
        dedupeKey: `ts_remind:${r.projectId}:${r.userId}:${today}`,
      }).catch(() => ({ created: 0 }));

      if (res.created > 0) sent += 1;
    }

    return NextResponse.json({
      success: true,
      sent,
      message:
        sent > 0
          ? `Sent ${sent} timesheet ${sent === 1 ? "reminder" : "reminders"}.`
          : "Reminder already sent today (or user has no active notification channel).",
    });
  } catch (err) {
    return serverError("pmt.timesheets.missing.POST", err);
  }
}
