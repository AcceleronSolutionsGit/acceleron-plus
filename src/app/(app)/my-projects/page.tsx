import React from "react";
import { getProjects } from "@/lib/api";
import { getSession, projectsManagedBy } from "@/lib/auth";
import { canSeeProjectFinancials, redactProjectFinancials } from "@/lib/permissions";
import { ProjectListClient } from "../pmt/ProjectListClient";
import { redirect } from "next/navigation";
import { projectDb, identityDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function MyProjectsPage() {
  const session = await getSession();
  if (!session) redirect("/auth/sign-in");

  const [projects, user] = await Promise.all([
    getProjects(),
    identityDb("users")
      .where("id", session.userId)
      .select("darwinbox_ref", "employee_id", "email")
      .first<{ darwinbox_ref?: string | null; employee_id?: string | null; email?: string } | undefined>()
      .catch(() => undefined),
  ]);

  const isAdmin = session.role === "admin" || Boolean(session.additionalRoles?.includes("admin"));
  const isDmOrPm =
    session.role === "pm" ||
    session.roleCode === "delivery_manager" ||
    Boolean(session.additionalRoleCodes?.some((c) => /delivery.?manager/i.test(c)));
  const managed = await projectsManagedBy(session.userId, isDmOrPm);

  const empId = user?.employee_id || user?.darwinbox_ref || null;
  const userKeys = [session.userId, `user:${session.userId}`, empId, empId ? `emp:${empId}` : null].filter(Boolean) as string[];
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const pmUserIds = userKeys.filter((k) => UUID_REGEX.test(k));

  // Find all projects where the user is allocated on the active team or named as PM/DM
  const [teamProjectRows, namedPmRows, namedDmRows] = await Promise.all([
    projectDb("project_team_members")
      .where("is_active", true)
      .andWhere(function () {
        this.whereIn("user_id", userKeys);
        if (empId) {
          this.orWhereIn("employee_id", userKeys);
        }
      })
      .pluck("project_id")
      .catch(() => []),
    pmUserIds.length > 0
      ? projectDb("projects").whereIn("project_manager_user_id", pmUserIds).pluck("id").catch(() => [])
      : Promise.resolve([]),
    projectDb("projects")
      .whereIn("delivery_manager_user_id", pmUserIds.length > 0 ? pmUserIds : userKeys)
      .pluck("id")
      .catch(() => []),
  ]);

  const allocatedIds = new Set<string>([
    ...teamProjectRows.map(String),
    ...namedPmRows.map(String),
    ...namedDmRows.map(String),
    ...Array.from(managed),
  ]);

  const allocatedProjects = projects.filter((p) => allocatedIds.has(p.id));

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
