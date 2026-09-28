import React from "react";
import { notFound } from "next/navigation";
import {
  getProject,
  getProjectWBS,
  getProjectMilestones,
  getProjectRisks,
  getProjectGovernanceReviews,
  getTickets,
} from "@/lib/api";
import { getSession, getProjectAccess } from "@/lib/auth";
import { can, describeAccess, redactProjectFinancials } from "@/lib/permissions";
import { getPreDeliveryStages } from "@/lib/lifecycle";
import { ProjectDetailClient } from "./ProjectDetailClient";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();

  const session = await getSession();
  // ProjectDetailClient already had a userRole prop, but nothing ever passed
  // it — so Timesheets, Financials and Documents saw "member" for everyone.
  const userRole = session?.role ?? "member";

  // One resolution of "what may this person do here", shared by every tab,
  // so the buttons on screen match what the API will actually accept.
  const access = await getProjectAccess(project.id, session);
  const permissions = {
    canReschedule: can(access, "plan.reschedule"),
    canCreatePlan: can(access, "plan.create"),
    canEditPlan: can(access, "plan.edit"),
    canUpdateProgress: can(access, "plan.updateProgress"),
    canExportFinancials: can(access, "export.financials"),
    // Budget, cost, margin and invoices: the project's named PM and
    // admins only. Decided here and on every API behind those tabs.
    canViewFinancials: can(access, "financials.view"),
    canManageInvoices: can(access, "invoice.manage"),
    // Naming the PM is what unlocks the money, so only an admin or the
    // outgoing PM may change it (the PATCH route enforces the same).
    canChangeProjectManager: access.role === "admin" || access.isProjectManager === true,
    summary: describeAccess(access),
  };

  const [wbsItems, milestones, risks, reviews, tickets, preDelivery] = await Promise.all([
    getProjectWBS(project.id),
    getProjectMilestones(project.id),
    getProjectRisks(project.id),
    getProjectGovernanceReviews(project.id),
    getTickets({ projectCode: project.code }),
    getPreDeliveryStages(project),
  ]);

  // The project is serialised into the page, so the money has to be
  // removed here — hiding it in the component would still ship it.
  const visibleProject = permissions.canViewFinancials ? project : redactProjectFinancials(project);

  return (
    <ProjectDetailClient
      project={visibleProject}
      preDelivery={preDelivery}
      wbsItems={wbsItems}
      milestones={milestones}
      risks={risks}
      reviews={reviews}
      tickets={tickets}
      userRole={userRole}
      permissions={permissions}
    />
  );
}
