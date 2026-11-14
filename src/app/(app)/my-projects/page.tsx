import React from "react";
import { getProjects } from "@/lib/api";
import { getSession, projectsManagedBy, projectsAllocatedTo } from "@/lib/auth";
import { canSeeProjectFinancials, redactProjectFinancials } from "@/lib/permissions";
import { ProjectListClient } from "../pmt/ProjectListClient";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function MyProjectsPage() {
  const session = await getSession();
  if (!session) redirect("/auth/sign-in");

  const isAdmin = session.role === "admin" || Boolean(session.additionalRoles?.includes("admin"));
  const isDmOrPm =
    session.role === "pm" ||
    session.roleCode === "delivery_manager" ||
    Boolean(session.additionalRoleCodes?.some((c) => /delivery.?manager/i.test(c)));

  const [projects, managed, allocated] = await Promise.all([
    getProjects(),
    projectsManagedBy(session.userId, isDmOrPm),
    projectsAllocatedTo(session.userId),
  ]);

  const allocatedProjects = isAdmin
    ? projects
    : projects.filter((p) => managed.has(p.id) || allocated.has(p.id));

  const viewer = { role: session.role, additionalRoles: session.additionalRoles, userId: session.userId };
  const visible = allocatedProjects.map((p) =>
    canSeeProjectFinancials(viewer, p, managed) ? p : redactProjectFinancials(p)
  );

  return (
    <ProjectListClient
      projects={visible}
      userRole={isAdmin ? "admin" : (session.role ?? "member")}
      isMyProjects={true}
      title="My Projects"
      subtitle={`${visible.length} project${visible.length === 1 ? "" : "s"} allocated to you.`}
    />
  );
}
