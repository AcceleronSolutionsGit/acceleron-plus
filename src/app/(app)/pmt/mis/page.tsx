import React from "react";
import { getProjects } from "@/lib/api";
import { getSession, projectsManagedBy, projectsAllocatedTo } from "@/lib/auth";
import { projectDb } from "@/lib/db";
import { mapMilestoneRow } from "@/lib/row-mapper";
import { canSeeProjectFinancials } from "@/lib/permissions";
import { MisClient, type ProjectMisItem, type MisMilestone } from "./MisClient";

export const metadata = {
  title: "Project MIS | PMT",
};

export default async function PMTMisPage() {
  const session = await getSession();
  const isAdmin = session?.role === "admin" || Boolean(session?.additionalRoles?.includes("admin"));
  const isDmOrPm =
    session?.role === "pm" ||
    session?.roleCode === "delivery_manager" ||
    Boolean(session?.additionalRoleCodes?.some((c) => /delivery.?manager/i.test(c)));

  const [managed, allocated, allProjects] = await Promise.all([
    projectsManagedBy(session?.userId, isDmOrPm),
    projectsAllocatedTo(session?.userId),
    getProjects(),
  ]);

  // Determine user scoping
  // Non-admins see ONLY projects they manage OR are staffed on
  const userScope: "admin" | "pm" | "member" = isAdmin
    ? "admin"
    : isDmOrPm || managed.size > 0
    ? "pm"
    : "member";

  const visibleProjects = isAdmin
    ? allProjects
    : allProjects.filter((p) => managed.has(p.id) || allocated.has(p.id));

  const projectIds = visibleProjects.map((p) => p.id);

  // Fetch all milestones for the scoped projects
  const milestoneRows =
    projectIds.length > 0
      ? await projectDb("milestones")
          .whereIn("project_id", projectIds)
          .orderBy("due_date", "asc")
          .catch(() => [])
      : [];

  const allMilestones = milestoneRows.map(mapMilestoneRow);

  // Fetch team member allocations count per project
  const teamMemberRows =
    projectIds.length > 0
      ? await projectDb("project_team_members")
          .whereIn("project_id", projectIds)
          .select("project_id", "user_id")
          .catch(() => [])
      : [];

  const teamCountByProject = new Map<string, number>();
  for (const row of teamMemberRows) {
    teamCountByProject.set(
      row.project_id,
      (teamCountByProject.get(row.project_id) ?? 0) + 1
    );
  }

  // Fetch actual project timesheet costs with rate bands & individual salaries
  let timesheetCostsWithRates: Array<{ project_id: string; cost: number | string }> = [];
  try {
    if (projectIds.length > 0) {
      timesheetCostsWithRates = await projectDb("project_timesheets")
        .join("project_team_members", function () {
          this.on("project_timesheets.project_id", "=", "project_team_members.project_id")
              .andOn("project_timesheets.user_id", "=", "project_team_members.user_id");
        })
        .leftJoin("employee_rate_bands", "project_team_members.rate_band_id", "employee_rate_bands.id")
        .where("project_timesheets.status", "approved")
        .whereIn("project_timesheets.project_id", projectIds)
        .select("project_timesheets.project_id")
        .select(
          projectDb.raw(
            "COALESCE(SUM(project_timesheets.hours_logged * (COALESCE(project_team_members.custom_daily_cost_inr, project_team_members.daily_cost_inr, employee_rate_bands.daily_cost_inr, 0) / 8.0)), 0) as cost"
          )
        )
        .groupBy("project_timesheets.project_id");
    }
  } catch (err) {
    console.error("[pmt.mis] Failed to aggregate timesheet costs:", err);
    timesheetCostsWithRates = [];
  }

  const timesheetCostByProject = new Map<string, number>();
  for (const c of timesheetCostsWithRates) {
    timesheetCostByProject.set(c.project_id, Number(c.cost) || 0);
  }

  const viewer = {
    role: session?.role ?? "member",
    additionalRoles: session?.additionalRoles,
    userId: session?.userId,
  };

  // Pre-calculate project metrics
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  // Create lookup map of project by id for quick reference
  const projectMap = new Map(visibleProjects.map((p) => [p.id, p]));

  const misItems: ProjectMisItem[] = visibleProjects.map((p) => {
    const canSeeCost = canSeeProjectFinancials(viewer, p, managed);
    const actualCost = canSeeCost ? (timesheetCostByProject.get(p.id) ?? 0) : null;
    const budget = canSeeCost && p.budgetInr ? Number(p.budgetInr) : null;
    const costVariance = budget !== null && actualCost !== null ? budget - actualCost : null;
    const costConsumedPercent =
      budget !== null && budget > 0 && actualCost !== null
        ? (actualCost / budget) * 100
        : null;
    const isOverBudget =
      budget !== null && budget > 0 && actualCost !== null && actualCost > budget;
    const costOverrunInr = isOverBudget && actualCost !== null && budget !== null ? actualCost - budget : 0;
    const pMilestones = allMilestones.filter((m) => m.projectId === p.id);
    const totalMilestones = pMilestones.length;
    const completedMilestones = pMilestones.filter((m) => m.status === "completed").length;

    const overdueMilestones = pMilestones.filter((m) => {
      if (m.status === "completed") return false;
      if (m.status === "missed") return true;
      if (m.dueDate) {
        return new Date(m.dueDate).getTime() < todayStart;
      }
      return false;
    });

    const atRiskMilestones = pMilestones.filter((m) => m.status === "at_risk");
    const upcomingMilestones = pMilestones.filter((m) => {
      if (m.status === "completed" || m.status === "missed") return false;
      if (m.dueDate) {
        return new Date(m.dueDate).getTime() >= todayStart;
      }
      return true;
    });

    // Milestone completion percentage
    let completionPercent = 0;
    if (totalMilestones > 0) {
      completionPercent = Math.round((completedMilestones / totalMilestones) * 100);
    } else {
      if (p.status === "closed") completionPercent = 100;
      else if (p.status === "active") completionPercent = 35;
      else completionPercent = 10;
    }

    // Schedule dates and duration
    let plannedDurationDays: number | null = null;
    let elapsedDays: number | null = null;
    let daysRemaining: number | null = null;
    let timelineProgressPercent = 0;
    let projectDelayDays = 0;

    if (p.startDate && p.plannedEndDate) {
      const startMs = new Date(p.startDate).getTime();
      const endMs = new Date(p.plannedEndDate).getTime();
      const totalMs = Math.max(86400000, endMs - startMs);
      plannedDurationDays = Math.max(1, Math.round(totalMs / 86400000));

      if (todayStart >= startMs) {
        elapsedDays = Math.round((todayStart - startMs) / 86400000);
        timelineProgressPercent = Math.min(
          100,
          Math.round((elapsedDays / plannedDurationDays) * 100)
        );
      } else {
        elapsedDays = 0;
        timelineProgressPercent = 0;
      }

      daysRemaining = Math.round((endMs - todayStart) / 86400000);

      if (p.status !== "closed" && todayStart > endMs) {
        projectDelayDays = Math.round((todayStart - endMs) / 86400000);
      }
    }

    // Overdue milestones delay
    let milestoneDelayDays = 0;
    for (const om of overdueMilestones) {
      if (om.dueDate) {
        const diff = Math.round((todayStart - new Date(om.dueDate).getTime()) / 86400000);
        if (diff > milestoneDelayDays) milestoneDelayDays = diff;
      }
    }

    const delayDays = Math.max(projectDelayDays, milestoneDelayDays);

    // Schedule health categorization
    let scheduleHealth: "delayed" | "at_risk" | "on_track" | "completed" = "on_track";
    if (p.status === "closed") {
      scheduleHealth = "completed";
    } else if (delayDays > 0 || overdueMilestones.length > 0) {
      scheduleHealth = "delayed";
    } else if (
      atRiskMilestones.length > 0 ||
      (daysRemaining !== null && daysRemaining <= 14 && completionPercent < 75)
    ) {
      scheduleHealth = "at_risk";
    } else {
      scheduleHealth = "on_track";
    }

    return {
      project: p,
      teamCount: teamCountByProject.get(p.id) ?? 0,
      milestones: pMilestones,
      metrics: {
        totalMilestones,
        completedMilestones,
        overdueMilestones: overdueMilestones.length,
        atRiskMilestones: atRiskMilestones.length,
        upcomingMilestones: upcomingMilestones.length,
        completionPercent,
        scheduleHealth,
        delayDays,
        daysRemaining,
        plannedDurationDays,
        elapsedDays,
        timelineProgressPercent,
        canSeeCost,
        budget,
        actualCost,
        costVariance,
        costConsumedPercent,
        isOverBudget,
        costOverrunInr,
      },
    };
  });

  // Flat list of all milestones decorated with project details for the Milestones Radar
  const decoratedMilestones: MisMilestone[] = allMilestones.map((m) => {
    const prj = projectMap.get(m.projectId);
    const dueTime = m.dueDate ? new Date(m.dueDate).getTime() : null;
    let daysDiff: number | null = null;
    let isOverdue = false;

    if (dueTime) {
      daysDiff = Math.round((dueTime - todayStart) / 86400000);
      isOverdue = m.status !== "completed" && (m.status === "missed" || daysDiff < 0);
    }

    return {
      ...m,
      projectCode: prj?.code ?? "PRJ",
      projectName: prj?.name ?? "Unknown Project",
      projectClient: prj?.clientCompanyName ?? "—",
      projectPhase: prj?.currentPhase ?? "Discovery",
      projectStatus: prj?.status ?? "active",
      projectManagers: prj?.managers ?? [],
      daysDiff,
      isOverdue,
    };
  });

  // Extract distinct PM names for filter options
  const pmSet = new Set<string>();
  for (const p of visibleProjects) {
    if (p.projectManager?.fullName) pmSet.add(p.projectManager.fullName);
    for (const m of p.managers ?? []) {
      if (m.fullName) pmSet.add(m.fullName);
    }
  }
  const availablePms = Array.from(pmSet).sort();

  return (
    <MisClient
      items={misItems}
      milestones={decoratedMilestones}
      userScope={userScope}
      userName={session?.fullName ?? session?.email ?? "User"}
      userRole={isAdmin ? "admin" : (session?.role ?? "member")}
      availablePms={availablePms}
    />
  );
}
