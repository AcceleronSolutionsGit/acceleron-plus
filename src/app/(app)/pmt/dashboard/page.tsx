import React from "react";
import { DashboardClient } from "./DashboardClient";
import { projectDb, itsmDb } from "@/lib/db";
import { mapProjectRow } from "@/lib/row-mapper";
import { getSession, projectsManagedBy } from "@/lib/auth";
import { canSeeProjectFinancials, redactProjectFinancials } from "@/lib/permissions";

export const metadata = {
  title: "PM Dashboard | PMT",
};

export default async function PMTDashboardPage() {
  // Fetch active projects
  const activeProjectRows = await projectDb("projects")
    .whereIn("status", ["initiated", "active", "on_hold"])
    .orderBy("start_date", "asc");

  const session = await getSession();
  const viewer = session ? { role: session.role, userId: session.userId } : null;

  const allProjects = activeProjectRows.map((r: any) => mapProjectRow(r));

  // Money is per project: the named PM sees their own projects' budget
  // and burn, an admin sees all of them, everyone else sees none. The
  // budget is stripped from what reaches the browser, not just hidden.
  const managed = await projectsManagedBy(session?.userId);
  const financeIds = new Set(
    allProjects.filter((p) => canSeeProjectFinancials(viewer, p, managed)).map((p) => p.id)
  );
  const projects = allProjects.map((p) => (financeIds.has(p.id) ? p : redactProjectFinancials(p)));

  // Fetch all milestones for these projects
  const projectIds = projects.map(p => p.id);
  const milestones = projectIds.length > 0 
    ? await projectDb("milestones").whereIn("project_id", projectIds).orderBy("due_date", "asc")
    : [];

  // Fetch cost summaries (budget vs actual)
  const timesheetCostsWithRates = projectIds.length > 0 ? await projectDb("project_timesheets")
    .join("project_team_members", function() {
      this.on("project_timesheets.project_id", "=", "project_team_members.project_id")
          .andOn("project_timesheets.user_id", "=", "project_team_members.user_id")
    })
    .join("employee_rate_bands", "project_team_members.rate_band_id", "employee_rate_bands.id")
    .where("project_timesheets.status", "approved")
    .whereIn("project_timesheets.project_id", projectIds)
    .select("project_timesheets.project_id")
    .sum({ cost: projectDb.raw("project_timesheets.hours_logged * (employee_rate_bands.daily_cost_inr / 8)") })
    .groupBy("project_timesheets.project_id") : [];

  const costData = allProjects.filter((p) => financeIds.has(p.id)).map(p => {
    const tsCost = timesheetCostsWithRates.find((c: any) => c.project_id === p.id);
    const actualCost = tsCost ? Number(tsCost.cost) : 0;
    const budget = p.budgetInr ? Number(p.budgetInr) : 0;
    return {
      projectId: p.id,
      code: p.code,
      name: p.name,
      budget,
      actualCost,
      consumedPercent: budget > 0 ? (actualCost / budget) * 100 : 0
    };
  });

  // ── New chart data ──────────────────────────────────────────────

  // 1. Phase distribution (pie chart)
  const PHASES = [
    "Discovery", "Design", "Build", "Execution",
    "Testing", "UAT", "Go-Live", "Closure",
  ];
  const phaseCounts: Record<string, number> = {};
  for (const p of allProjects) {
    const phase = p.currentPhase || "Discovery";
    phaseCounts[phase] = (phaseCounts[phase] || 0) + 1;
  }
  const phaseDistribution = PHASES
    .filter((ph) => (phaseCounts[ph] || 0) > 0)
    .map((ph) => ({ name: ph, value: phaseCounts[ph] || 0 }));

  // 2. Ticket priority breakdown (bar chart)
  let ticketPriorityBreakdown: { name: string; value: number }[] = [];
  try {
    const rows = await itsmDb("tickets")
      .whereNotIn("status", ["closed", "resolved", "cancelled"])
      .select("priority")
      .count("* as count")
      .groupBy("priority");

    const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
    ticketPriorityBreakdown = rows
      .map((r: any) => ({
        name: (r.priority as string)?.charAt(0).toUpperCase() + (r.priority as string)?.slice(1),
        value: Number(r.count),
        _order: priorityOrder[r.priority as string] ?? 4,
      }))
      .sort((a: any, b: any) => a._order - b._order)
      .map(({ name, value }: any) => ({ name, value }));
  } catch {
    // ITSM database may not be available — that's fine
  }

  // 3. Monthly ticket trend (line chart — last 6 months)
  let monthlyTicketTrend: { month: string; created: number; resolved: number }[] = [];
  try {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    const isoStart = sixMonthsAgo.toISOString().slice(0, 10);

    const createdRows = await itsmDb("tickets")
      .where("created_at", ">=", isoStart)
      .select(itsmDb.raw("to_char(created_at, 'YYYY-MM') as month"))
      .count("* as count")
      .groupBy("month")
      .orderBy("month");

    const resolvedRows = await itsmDb("tickets")
      .whereIn("status", ["resolved", "closed"])
      .where("updated_at", ">=", isoStart)
      .select(itsmDb.raw("to_char(updated_at, 'YYYY-MM') as month"))
      .count("* as count")
      .groupBy("month")
      .orderBy("month");

    // Build 6 months of data
    const months: string[] = [];
    const cursor = new Date(sixMonthsAgo);
    for (let i = 0; i < 6; i++) {
      months.push(
        cursor.toLocaleDateString("en-US", { month: "short", year: "2-digit" })
      );
      const key = cursor.toISOString().slice(0, 7);
      const created = createdRows.find((r: any) => r.month === key);
      const resolved = resolvedRows.find((r: any) => r.month === key);
      monthlyTicketTrend.push({
        month: cursor.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
        created: created ? Number((created as any).count) : 0,
        resolved: resolved ? Number((resolved as any).count) : 0,
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
  } catch {
    // ITSM database may not be available
  }

  // 4. Project status counts (for future use)
  const statusCounts: Record<string, number> = {};
  for (const p of allProjects) {
    statusCounts[p.status] = (statusCounts[p.status] || 0) + 1;
  }
  const projectStatusCounts = Object.entries(statusCounts).map(([name, value]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1).replace(/_/g, " "),
    value,
  }));

  return (
    <DashboardClient
      projects={projects}
      milestones={milestones}
      costData={costData}
      financeScope={viewer?.role === "admin" ? "all" : "managed"}
      phaseDistribution={phaseDistribution}
      monthlyTicketTrend={monthlyTicketTrend}
      ticketPriorityBreakdown={ticketPriorityBreakdown}
      projectStatusCounts={projectStatusCounts}
    />
  );
}
