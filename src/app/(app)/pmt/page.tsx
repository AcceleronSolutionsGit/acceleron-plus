import React from "react";
import { getProjects } from "@/lib/api";
import { getSession, projectsManagedBy } from "@/lib/auth";
import { canSeeProjectFinancials, redactProjectFinancials } from "@/lib/permissions";
import { ProjectListClient } from "./ProjectListClient";

export default async function PMTProjectsPage() {
  const [projects, session] = await Promise.all([getProjects(), getSession()]);
  const isAdmin = session?.role === "admin" || Boolean(session?.additionalRoles?.includes("admin"));
  const viewer = session ? { role: session.role, additionalRoles: session.additionalRoles, userId: session.userId } : null;
  const isDmOrPm =
    session?.role === "pm" ||
    session?.roleCode === "delivery_manager" ||
    Boolean(session?.additionalRoleCodes?.some((c) => /delivery.?manager/i.test(c)));
  const managed = await projectsManagedBy(session?.userId, isDmOrPm);

  // Non-admins (PM, DM, members) only see projects they are allocated to
  const targetProjects = isAdmin ? projects : projects.filter((p) => managed.has(p.id));

  const visible = targetProjects.map((p) =>
    canSeeProjectFinancials(viewer, p, managed) ? p : redactProjectFinancials(p)
  );

  // Scrapped projects never reach here — `getProjects` excludes them —
  // so the list is always the live ones.
  return <ProjectListClient projects={visible} userRole={isAdmin ? "admin" : (session?.role ?? "member")} />;
}
