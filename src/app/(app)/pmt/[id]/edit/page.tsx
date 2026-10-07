import React from "react";
import { notFound } from "next/navigation";
import { getProject } from "@/lib/api";
import { getSession, getProjectAccess } from "@/lib/auth";
import { can, describeAccess, redactProjectFinancials } from "@/lib/permissions";
import { ProjectEditClient } from "./ProjectEditClient";

export default async function ProjectEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();

  const session = await getSession();

  const access = await getProjectAccess(project.id, session);
  const permissions = {
    canChangeProjectManager: access.role === "admin" || access.isProjectManager === true,
    canViewFinancials: can(access, "financials.view"),
  };

  const visibleProject = permissions.canViewFinancials ? project : redactProjectFinancials(project);

  return (
    <ProjectEditClient
      project={visibleProject}
      permissions={permissions}
    />
  );
}
