import React from "react";
import { DashboardClient } from "./DashboardClient";
import { projectDb } from "@/lib/db";
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
  const budgets = await projectDb("projects")
    .whereIn("id", projectIds)
    .select("id", "code", "name", "budget_inr");
  
  const timesheetCosts = projectIds.length > 0
    ? await projectDb("project_timesheets")
        .whereIn("project_id", projectIds)
        .where("status", "approved")
        .select("project_id")
        .sum("hours_logged as total_hours")
        .groupBy("project_id")
    : [];
    
  // Since cost_inr isn't stored directly on project_timesheets in our updated schema,
  // we'll approximate the cost for the dashboard based on a blended rate, 
  // or we can join with bands. For simplicity in the dashboard overview, 
  // we join employee_rate_bands to calculate actual burned cost.
  
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

  return (
    <DashboardClient
      projects={projects}
      milestones={milestones}
      costData={costData}
      financeScope={viewer?.role === "admin" ? "all" : "managed"}
    />
  );
}
