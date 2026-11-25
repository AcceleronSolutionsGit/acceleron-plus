// GET  /api/pmt/timesheets        — grouped timesheets for approval (RM / PM / Admin view)
// POST /api/pmt/timesheets        — bulk approve/reject
//
// Rules:
// 1. Nobody reviews or approves their own timesheets (self-approval blocked).
// 2. If a submitter is a PM/DM on the project they logged time to, their
//    timesheet goes to their Reporting Manager (RM) (or an Admin), NOT to
//    themselves or peer PMs on that project.
// 3. Regular team members' timesheets can be approved by the project's PM,
//    the person's RM, or an Admin.

import { NextResponse } from "next/server";
import { identityDb, projectDb } from "@/lib/db";
import { requireSession, projectsManagedBy } from "@/lib/auth";
import { readJson, serverError } from "@/lib/route-helpers";
import { toDateInput } from "@/lib/dates";
import { directReportUserIds, projectManagersByProject } from "@/lib/reportees";

export const runtime = "nodejs";

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function getMondayAndSunday(anchorStr: string): { monday: string; sunday: string } | null {
  const parts = anchorStr.split("-").map(Number);
  if (parts.length !== 3 || parts.some((p) => Number.isNaN(p))) return null;
  const anchor = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  if (Number.isNaN(anchor.getTime())) return null;
  const dow = anchor.getUTCDay(); // 0=Sun..6=Sat
  const monday = new Date(anchor);
  monday.setUTCDate(monday.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  const sunday = new Date(monday);
  sunday.setUTCDate(sunday.getUTCDate() + 6);
  return {
    monday: monday.toISOString().slice(0, 10),
    sunday: sunday.toISOString().slice(0, 10),
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
    const statusFilter = url.searchParams.get("status") || "submitted";
    const projectFilter = url.searchParams.get("project") || "";
    const weekFilter = url.searchParams.get("week") || "";
    const search = (url.searchParams.get("search") || "").trim().toLowerCase();

    // ── Resolve reportees & managed projects ───────────────────────
    const [reporteeList, managedSet] = await Promise.all([
      directReportUserIds(userId),
      projectsManagedBy(userId),
    ]);
    const reporteeSet = new Set(reporteeList);
    const managedProjectIds = Array.from(managedSet);

    if (!isAdmin && reporteeList.length === 0 && managedProjectIds.length === 0) {
      return NextResponse.json({
        success: true,
        individuals: [],
        entries: [],
        summary: {
          totalPeople: 0,
          pendingPeople: 0,
          pendingHours: 0,
          approvedHours: 0,
          rejectedEntries: 0,
          totalHours: 0,
        },
        meta: { total: 0, totalPeople: 0, page: 1, limit: 100, totalPages: 0 },
        projects: [],
        viewer: {
          isAdmin: false,
          isPm: false,
          isRm: false,
          managedProjectCount: 0,
          reporteeCount: 0,
        },
      });
    }

    let query = projectDb("project_timesheets as ts")
      .join("projects as p", "p.id", "ts.project_id")
      // Strictly never show caller's own timesheets in the approval queue
      .whereNot("ts.user_id", userId);

    if (statusFilter && statusFilter !== "all") {
      if (statusFilter === "submitted" || statusFilter === "pending") {
        query = query.whereIn("ts.status", ["submitted", "pending"]);
      } else {
        query = query.where("ts.status", statusFilter);
      }
    } else {
      // "all" shows reviewable/reviewed statuses (exclude unsubmitted drafts)
      query = query.whereIn("ts.status", ["submitted", "pending", "approved", "rejected"]);
    }

    if (projectFilter) {
      query = query.where("ts.project_id", projectFilter);
    }

    if (weekFilter) {
      const range = getMondayAndSunday(weekFilter);
      if (range) {
        query = query.whereBetween("ts.log_date", [range.monday, range.sunday]);
      }
    }

    if (!isAdmin) {
      query = query.where((q) => {
        let applied = false;
        if (reporteeList.length > 0) {
          q.whereIn("ts.user_id", reporteeList);
          applied = true;
        }
        if (managedProjectIds.length > 0) {
          if (applied) {
            q.orWhereIn("ts.project_id", managedProjectIds);
          } else {
            q.whereIn("ts.project_id", managedProjectIds);
          }
        }
      });
    }

    const selectCols = [
      "ts.id",
      "ts.project_id",
      "p.code as project_code",
      "p.name as project_name",
      "ts.user_id",
      "ts.user_name",
      "ts.wbs_name",
      "ts.log_date",
      "ts.hours_logged",
      "ts.activity_type",
      "ts.notes",
      "ts.extra_hours_reason",
      "ts.status",
      "ts.submitted_at",
      "ts.reviewed_by_user_id",
      "ts.reviewed_at",
      "ts.rejection_reason",
      "ts.wbs_item_id",
    ];

    let rawRows: Record<string, unknown>[] = [];
    try {
      rawRows = (await query
        .clone()
        .select(...selectCols)
        .orderBy([
          { column: "ts.log_date", order: "desc" },
          { column: "ts.submitted_at", order: "asc" },
        ])) as Record<string, unknown>[];
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("extra_hours_reason")) {
        await projectDb
          .raw("ALTER TABLE project_timesheets ADD COLUMN IF NOT EXISTS extra_hours_reason text")
          .catch(() => {});
        rawRows = (await query
          .clone()
          .select(...selectCols.filter((c) => c !== "ts.extra_hours_reason"))
          .orderBy([
            { column: "ts.log_date", order: "desc" },
            { column: "ts.submitted_at", order: "asc" },
          ])
          .catch(() => [])) as Record<string, unknown>[];
      }
    }

    // ── Determine which submitters are PMs on each project ─────────
    const rowProjectIds = [...new Set(rawRows.map((r) => String(r.project_id)))];
    const pmMap = await projectManagersByProject(rowProjectIds);

    // Filter out PM-on-own-project entries if the caller is neither Admin nor that PM's RM
    const authorizedRows = rawRows.filter((r) => {
      const uid = String(r.user_id);
      const pid = String(r.project_id);
      if (uid === userId) return false;
      const isPmOnThisProject = pmMap.get(pid)?.has(uid) ?? false;
      if (isPmOnThisProject) {
        // PM's timesheet on their own project MUST go to their RM (or Admin)
        return isAdmin || reporteeSet.has(uid);
      }
      return true;
    });

    // ── Enrich user profiles (employeeId, email, designation) ──────
    const distinctUserIds = [...new Set(authorizedRows.map((r) => String(r.user_id)))];
    const userInfoMap = new Map<
      string,
      { fullName: string; email: string | null; employeeId: string | null; designation: string | null }
    >();

    if (distinctUserIds.length > 0) {
      const users = (await identityDb("users")
        .whereIn("id", distinctUserIds)
        .select("id", "full_name", "email", "darwinbox_ref")
        .catch(() => [])) as Record<string, unknown>[];

      const emails = users
        .map((u) => String(u.email ?? "").trim().toLowerCase())
        .filter(Boolean);
      const refs = users
        .map((u) => String(u.darwinbox_ref ?? "").trim())
        .filter(Boolean);

      const empRows =
        emails.length > 0 || refs.length > 0
          ? ((await identityDb("employee_master")
              .where((q) => {
                if (emails.length) q.whereRaw("lower(trim(company_email_id)) = ANY(?)", [emails]);
                if (refs.length) {
                  if (emails.length) q.orWhereIn("employee_id", refs);
                  else q.whereIn("employee_id", refs);
                }
              })
              .select("employee_id", "company_email_id", "designation", "full_name")
              .catch(() => [])) as Record<string, unknown>[])
          : [];

      const empByEmail = new Map<string, Record<string, unknown>>();
      const empById = new Map<string, Record<string, unknown>>();
      for (const e of empRows) {
        if (e.company_email_id) empByEmail.set(String(e.company_email_id).trim().toLowerCase(), e);
        if (e.employee_id) empById.set(String(e.employee_id).trim(), e);
      }

      for (const u of users) {
        const uid = String(u.id);
        const email = u.email ? String(u.email).trim() : null;
        const ref = u.darwinbox_ref ? String(u.darwinbox_ref).trim() : null;
        const emp =
          (ref ? empById.get(ref) : undefined) ||
          (email ? empByEmail.get(email.toLowerCase()) : undefined);
        userInfoMap.set(uid, {
          fullName: String(u.full_name || emp?.full_name || "Unknown"),
          email,
          employeeId: emp?.employee_id ? String(emp.employee_id).trim() : ref,
          designation: emp?.designation ? String(emp.designation).trim() : null,
        });
      }
    }

    // ── Resolve team member allocations for projects in view ──────
    const teamAllocations =
      rowProjectIds.length > 0
        ? ((await projectDb("project_team_members")
            .whereIn("project_id", rowProjectIds)
            .andWhere(function () {
              this.where("is_active", true).orWhereNull("is_active");
            })
            .select(
              "project_id",
              "user_id",
              "employee_id",
              "user_name",
              "allocation_percent",
              "planned_days"
            )
            .catch(() => [])) as Record<string, unknown>[])
        : [];

    const allocLookup = new Map<string, number>();
    for (const m of teamAllocations) {
      const pid = String(m.project_id);
      const pct = Number(m.allocation_percent ?? 100);
      if (m.user_id) allocLookup.set(`${pid}:uid:${m.user_id}`, pct);
      if (m.employee_id) allocLookup.set(`${pid}:emp:${String(m.employee_id).trim()}`, pct);
      if (m.user_name) allocLookup.set(`${pid}:name:${String(m.user_name).trim().toLowerCase()}`, pct);
    }

    const getAllocationPercent = (pid: string, uid: string): number => {
      const uInfo = userInfoMap.get(uid);
      if (allocLookup.has(`${pid}:uid:${uid}`)) return allocLookup.get(`${pid}:uid:${uid}`)!;
      if (uInfo?.employeeId && allocLookup.has(`${pid}:emp:${uInfo.employeeId}`)) {
        return allocLookup.get(`${pid}:emp:${uInfo.employeeId}`)!;
      }
      if (uInfo?.fullName && allocLookup.has(`${pid}:name:${uInfo.fullName.trim().toLowerCase()}`)) {
        return allocLookup.get(`${pid}:name:${uInfo.fullName.trim().toLowerCase()}`)!;
      }
      return 100;
    };

    // ── Format flat entries + group by Individual -> Project ───────
    interface EntryItem {
      id: string;
      projectId: string;
      projectCode: string;
      projectName: string;
      userId: string;
      userName: string;
      employeeId: string | null;
      logDate: string;
      hours: number;
      activityType: string;
      wbsName: string | null;
      notes: string | null;
      extraHoursReason: string | null;
      status: string;
      submittedAt: string | null;
      reviewedAt: string | null;
      rejectionReason: string | null;
      isPmOnProject: boolean;
      approvalVia: "rm" | "pm" | "admin";
      allocatedDailyHours: number;
      isOverDailyAllocation: boolean;
    }

    const formattedEntries: EntryItem[] = [];
    for (const r of authorizedRows) {
      const uid = String(r.user_id);
      const pid = String(r.project_id);
      const uInfo = userInfoMap.get(uid);
      const userName = String(r.user_name || uInfo?.fullName || "Unknown");
      const employeeId = uInfo?.employeeId ?? null;
      const projectCode = String(r.project_code ?? "");
      const projectName = String(r.project_name ?? "");

      if (search) {
        const hay = `${userName} ${employeeId ?? ""} ${projectCode} ${projectName} ${r.notes ?? ""} ${r.extra_hours_reason ?? ""}`.toLowerCase();
        if (!hay.includes(search)) continue;
      }

      const isPmOnProject = pmMap.get(pid)?.has(uid) ?? false;
      const approvalVia: "rm" | "pm" | "admin" = reporteeSet.has(uid)
        ? "rm"
        : managedSet.has(pid) && !isPmOnProject
        ? "pm"
        : "admin";

      const allocPct = getAllocationPercent(pid, uid);
      const allocatedDailyHours = round2(8 * (allocPct / 100));
      const hours = Number(r.hours_logged ?? 0);
      const logDate = toDateInput(r.log_date as string);
      const extraHoursReason = r.extra_hours_reason ? String(r.extra_hours_reason).trim() : null;
      const isOverDailyAllocation = hours > allocatedDailyHours;

      formattedEntries.push({
        id: String(r.id),
        projectId: pid,
        projectCode,
        projectName,
        userId: uid,
        userName,
        employeeId,
        logDate,
        hours,
        activityType: r.activity_type ? String(r.activity_type) : "development",
        wbsName: r.wbs_name ? String(r.wbs_name) : null,
        notes: r.notes ? String(r.notes) : null,
        extraHoursReason,
        status: String(r.status ?? "submitted"),
        submittedAt: r.submitted_at ? new Date(String(r.submitted_at)).toISOString() : null,
        reviewedAt: r.reviewed_at ? new Date(String(r.reviewed_at)).toISOString() : null,
        rejectionReason: r.rejection_reason ? String(r.rejection_reason) : null,
        isPmOnProject,
        approvalVia,
        allocatedDailyHours,
        isOverDailyAllocation,
      });
    }

    // Group by individual -> project
    const individualMap = new Map<
      string,
      {
        userId: string;
        userName: string;
        employeeId: string | null;
        email: string | null;
        designation: string | null;
        isDirectReport: boolean;
        hasPmRoutedEntries: boolean;
        totalHours: number;
        pendingHours: number;
        approvedHours: number;
        rejectedHours: number;
        pendingEntryIds: string[];
        totalEntries: number;
        dateRange: { min: string; max: string };
        projectMap: Map<
          string,
          {
            projectId: string;
            projectCode: string;
            projectName: string;
            allocationPercent: number;
            dailyAllocatedHours: number;
            weeklyAllocatedHours: number;
            totalHours: number;
            pendingHours: number;
            approvedHours: number;
            rejectedHours: number;
            pendingEntryIds: string[];
            isPmOnProject: boolean;
            entries: EntryItem[];
          }
        >;
      }
    >();

    let summaryPendingHours = 0;
    let summaryApprovedHours = 0;
    let summaryRejectedEntries = 0;
    let summaryTotalHours = 0;

    for (const e of formattedEntries) {
      const isPending = e.status === "submitted" || e.status === "pending";
      const isApproved = e.status === "approved";
      const isRejected = e.status === "rejected";

      summaryTotalHours += e.hours;
      if (isPending) summaryPendingHours += e.hours;
      if (isApproved) summaryApprovedHours += e.hours;
      if (isRejected) summaryRejectedEntries += 1;

      let ind = individualMap.get(e.userId);
      if (!ind) {
        const uInfo = userInfoMap.get(e.userId);
        ind = {
          userId: e.userId,
          userName: e.userName,
          employeeId: uInfo?.employeeId ?? e.employeeId,
          email: uInfo?.email ?? null,
          designation: uInfo?.designation ?? null,
          isDirectReport: reporteeSet.has(e.userId),
          hasPmRoutedEntries: false,
          totalHours: 0,
          pendingHours: 0,
          approvedHours: 0,
          rejectedHours: 0,
          pendingEntryIds: [],
          totalEntries: 0,
          dateRange: { min: e.logDate, max: e.logDate },
          projectMap: new Map(),
        };
        individualMap.set(e.userId, ind);
      }

      ind.totalHours = round2(ind.totalHours + e.hours);
      ind.totalEntries += 1;
      if (e.isPmOnProject) ind.hasPmRoutedEntries = true;
      if (isPending) {
        ind.pendingHours = round2(ind.pendingHours + e.hours);
        ind.pendingEntryIds.push(e.id);
      } else if (isApproved) {
        ind.approvedHours = round2(ind.approvedHours + e.hours);
      } else if (isRejected) {
        ind.rejectedHours = round2(ind.rejectedHours + e.hours);
      }
      if (e.logDate < ind.dateRange.min) ind.dateRange.min = e.logDate;
      if (e.logDate > ind.dateRange.max) ind.dateRange.max = e.logDate;

      let proj = ind.projectMap.get(e.projectId);
      if (!proj) {
        const allocPct = getAllocationPercent(e.projectId, e.userId);
        const dailyAlloc = round2(8 * (allocPct / 100));
        const weeklyAlloc = round2(40 * (allocPct / 100));
        proj = {
          projectId: e.projectId,
          projectCode: e.projectCode,
          projectName: e.projectName,
          allocationPercent: allocPct,
          dailyAllocatedHours: dailyAlloc,
          weeklyAllocatedHours: weeklyAlloc,
          totalHours: 0,
          pendingHours: 0,
          approvedHours: 0,
          rejectedHours: 0,
          pendingEntryIds: [],
          isPmOnProject: e.isPmOnProject,
          entries: [],
        };
        ind.projectMap.set(e.projectId, proj);
      }

      proj.totalHours = round2(proj.totalHours + e.hours);
      if (e.isPmOnProject) proj.isPmOnProject = true;
      if (isPending) {
        proj.pendingHours = round2(proj.pendingHours + e.hours);
        proj.pendingEntryIds.push(e.id);
      } else if (isApproved) {
        proj.approvedHours = round2(proj.approvedHours + e.hours);
      } else if (isRejected) {
        proj.rejectedHours = round2(proj.rejectedHours + e.hours);
      }
      proj.entries.push(e);
    }

    const individuals = [...individualMap.values()]
      .map((ind) => {
        const projList = [...ind.projectMap.values()].map((proj) => {
          const extraHoursReasons = Array.from(
            new Set(
              proj.entries
                .map((en) => en.extraHoursReason)
                .filter((r): r is string => Boolean(r && r.trim()))
            )
          );
          // Calculated strictly from daily over-allocations (effective from 2026-11-25)
          const extraHours = round2(
            proj.entries.reduce(
              (sum, en) =>
                sum + (en.isOverDailyAllocation ? Math.max(0, en.hours - en.allocatedDailyHours) : 0),
              0
            )
          );
          const isOverAllocated =
            proj.entries.some((en) => en.isOverDailyAllocation) ||
            extraHoursReasons.length > 0;

          return {
            projectId: proj.projectId,
            projectCode: proj.projectCode,
            projectName: proj.projectName,
            allocationPercent: proj.allocationPercent,
            dailyAllocatedHours: proj.dailyAllocatedHours,
            weeklyAllocatedHours: proj.weeklyAllocatedHours,
            totalHours: proj.totalHours,
            pendingHours: proj.pendingHours,
            approvedHours: proj.approvedHours,
            rejectedHours: proj.rejectedHours,
            pendingEntryIds: proj.pendingEntryIds,
            isPmOnProject: proj.isPmOnProject,
            isOverAllocated,
            extraHours,
            extraHoursReasons,
            entries: proj.entries,
          };
        }).sort(
          (a, b) => b.totalHours - a.totalHours || a.projectCode.localeCompare(b.projectCode)
        );

        const totalAllocatedHours = round2(
          projList.reduce((sum, p) => sum + (p.weeklyAllocatedHours ?? 0), 0)
        );
        const extraHours = round2(
          projList.reduce((sum, p) => sum + (p.extraHours ?? 0), 0)
        );
        const extraHoursReasons = Array.from(
          new Set(projList.flatMap((p) => p.extraHoursReasons ?? []))
        );
        const isOverAllocated = projList.some((p) => p.isOverAllocated);
        const extraHoursCount = projList.reduce(
          (sum, p) =>
            sum +
            p.entries.filter(
              (en) => en.isOverDailyAllocation || Boolean(en.extraHoursReason)
            ).length,
          0
        );

        return {
          userId: ind.userId,
          userName: ind.userName,
          employeeId: ind.employeeId,
          email: ind.email,
          designation: ind.designation,
          isDirectReport: ind.isDirectReport,
          hasPmRoutedEntries: ind.hasPmRoutedEntries,
          totalHours: ind.totalHours,
          totalAllocatedHours,
          isOverAllocated,
          extraHours,
          extraHoursCount,
          extraHoursReasons,
          pendingHours: ind.pendingHours,
          approvedHours: ind.approvedHours,
          rejectedHours: ind.rejectedHours,
          pendingEntryIds: ind.pendingEntryIds,
          totalEntries: ind.totalEntries,
          dateRange: ind.dateRange,
          projectCount: ind.projectMap.size,
          projects: projList,
        };
      })
      .sort(
        (a, b) =>
          b.pendingHours - a.pendingHours ||
          b.totalHours - a.totalHours ||
          a.userName.localeCompare(b.userName)
      );

    // Projects for filter dropdown (scoped to what this viewer can manage/review)
    let projectsQuery = projectDb("projects")
      .whereNotIn("status", ["cancelled", "scrapped"])
      .orderBy("code")
      .select("id", "code", "name");

    if (!isAdmin) {
      const relevantProjectIds = [
        ...new Set([...managedProjectIds, ...formattedEntries.map((e) => e.projectId)]),
      ];
      if (relevantProjectIds.length > 0) {
        projectsQuery = projectsQuery.whereIn("id", relevantProjectIds);
      } else {
        projectsQuery = projectsQuery.whereRaw("1 = 0");
      }
    }

    const projects = (await projectsQuery.catch(() => [])) as Record<string, unknown>[];

    return NextResponse.json({
      success: true,
      individuals,
      entries: formattedEntries,
      summary: {
        totalPeople: individuals.length,
        pendingPeople: individuals.filter((i) => i.pendingEntryIds.length > 0).length,
        pendingHours: round2(summaryPendingHours),
        approvedHours: round2(summaryApprovedHours),
        rejectedEntries: summaryRejectedEntries,
        totalHours: round2(summaryTotalHours),
      },
      meta: {
        total: formattedEntries.length,
        totalPeople: individuals.length,
        page: 1,
        limit: formattedEntries.length || 50,
        totalPages: 1,
      },
      projects: projects.map((p) => ({
        id: String(p.id),
        code: String(p.code),
        name: String(p.name),
      })),
      viewer: {
        isAdmin,
        isPm: managedProjectIds.length > 0,
        isRm: reporteeList.length > 0,
        managedProjectCount: managedProjectIds.length,
        reporteeCount: reporteeList.length,
      },
    });
  } catch (err) {
    return serverError("pmt.timesheets.GET", err);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;
    const reviewerId = auth.session.userId;
    const isAdmin =
      auth.session.role === "admin" ||
      Boolean(auth.session.additionalRoles?.includes("admin"));

    const parsed = await readJson(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.body as Record<string, unknown>;

    const ids = Array.isArray(body.ids) ? (body.ids as string[]) : [];
    const action = String(body.action ?? "").trim();
    const rejectionReason = body.rejectionReason
      ? String(body.rejectionReason).trim()
      : null;

    if (ids.length === 0) {
      return NextResponse.json({ success: false, error: "No entries selected." }, { status: 400 });
    }
    if (action !== "approve" && action !== "reject") {
      return NextResponse.json({ success: false, error: 'Action must be "approve" or "reject".' }, { status: 400 });
    }
    if (action === "reject" && !rejectionReason) {
      return NextResponse.json({ success: false, error: "A reason is required when rejecting." }, { status: 400 });
    }

    const newStatus = action === "approve" ? "approved" : "rejected";

    const [reportees, managedSet] = isAdmin
      ? [[], new Set<string>()]
      : await Promise.all([
          directReportUserIds(reviewerId),
          projectsManagedBy(reviewerId),
        ]);
    const reporteeSet = new Set(reportees);

    if (!isAdmin && reportees.length === 0 && managedSet.size === 0) {
      return NextResponse.json(
        { success: false, error: "You can only review timesheets from your direct reports or projects you manage." },
        { status: 403 }
      );
    }

    // Fetch candidate entries so we can enforce self-approval & PM -> RM routing accurately
    const candidates = (await projectDb("project_timesheets")
      .whereIn("id", ids)
      .select("id", "project_id", "user_id", "status")) as Array<{
      id: string;
      project_id: string;
      user_id: string;
      status: string;
    }>;

    // Check if caller tried to act exclusively on their own entries
    if (candidates.length > 0 && candidates.every((c) => String(c.user_id) === reviewerId)) {
      return NextResponse.json(
        {
          success: false,
          error: "Self-approval is not allowed. Your timesheets must be approved by your Reporting Manager.",
        },
        { status: 403 }
      );
    }

    const candidateProjectIds = [...new Set(candidates.map((c) => String(c.project_id)))];
    const pmMap = await projectManagersByProject(candidateProjectIds);

    const allowedIds: string[] = [];
    let pmSelfRoutedBlocked = 0;

    for (const c of candidates) {
      const uid = String(c.user_id);
      const pid = String(c.project_id);
      const st = String(c.status);

      // Must be pending/submitted and NEVER caller's own entry
      if (st !== "submitted" && st !== "pending") continue;
      if (uid === reviewerId) continue;

      if (isAdmin) {
        allowedIds.push(String(c.id));
        continue;
      }

      const isPmOnProject = pmMap.get(pid)?.has(uid) ?? false;
      if (isPmOnProject) {
        // PM's own project timesheet -> MUST be approved by their RM
        if (reporteeSet.has(uid)) {
          allowedIds.push(String(c.id));
        } else {
          pmSelfRoutedBlocked += 1;
        }
      } else if (reporteeSet.has(uid) || managedSet.has(pid)) {
        allowedIds.push(String(c.id));
      }
    }

    if (allowedIds.length === 0 && pmSelfRoutedBlocked > 0) {
      return NextResponse.json(
        {
          success: false,
          error: "A Project Manager's timesheet on their own project must be approved by their Reporting Manager.",
        },
        { status: 403 }
      );
    }

    let updatedCount = 0;
    if (allowedIds.length > 0) {
      const updated = await projectDb("project_timesheets")
        .whereIn("id", allowedIds)
        .update({
          status: newStatus,
          reviewed_by_user_id: reviewerId,
          approved_by_user_id: reviewerId,
          reviewed_at: new Date(),
          rejection_reason: action === "reject" ? rejectionReason : null,
          updated_at: new Date(),
        });
      updatedCount = Number(updated ?? 0);
    }

    const skipped = ids.length - updatedCount;
    return NextResponse.json({
      success: true,
      action,
      count: updatedCount,
      skipped,
    });
  } catch (err) {
    return serverError("pmt.timesheets.POST", err);
  }
}
