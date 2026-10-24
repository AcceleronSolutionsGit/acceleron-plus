import React from "react";
import { getSession } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { identityDb, projectDb } from "@/lib/db";
import { getProjects } from "@/lib/api";
import { AllocateUserClient } from "./AllocateUserClient";

export default async function AllocateExternalUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  const isAdmin = session?.role === "admin" || Boolean(session?.additionalRoles?.includes("admin"));
  const isPm = session?.role === "pm";

  if (!session || (!isAdmin && !isPm)) {
    redirect("/pmt");
  }

  const { id: userId } = await params;

  const [user, userRoles, allProjects, userAllocations] = await Promise.all([
    identityDb("users as u")
      .leftJoin("roles as r", "r.id", "u.role_id")
      .where("u.id", userId)
      .whereNull("u.darwinbox_ref")
      .select(
        "u.id",
        "u.email",
        "u.full_name",
        "u.mobile_phone",
        "u.is_active",
        identityDb.ref("r.code").as("primary_role_code"),
        identityDb.ref("r.name").as("primary_role_name")
      )
      .first(),
    identityDb("user_roles as ur")
      .join("roles as r", "r.id", "ur.role_id")
      .where("ur.user_id", userId)
      .select("r.code", "r.name"),
    getProjects(),
    projectDb("project_team_members")
      .where("user_id", userId)
      .where("is_active", true)
      .select("project_id", "role_in_project", "allocation_percent", "member_type", "custom_daily_cost_inr", "start_date", "end_date"),
  ]);

  if (!user) {
    notFound();
  }

  const roleNames = userRoles.length > 0 ? userRoles.map((r) => r.name) : [user.primary_role_name || "Member"];

  return (
    <AllocateUserClient
      user={{
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        mobilePhone: user.mobile_phone,
        isActive: user.is_active,
        roleNames,
        allocations: userAllocations.map((a) => ({
          projectId: a.project_id,
          roleInProject: a.role_in_project,
          allocationPercent: Number(a.allocation_percent || 100),
          memberType: a.member_type,
          startDate: a.start_date,
          endDate: a.end_date,
        })),
      }}
      initialProjects={allProjects}
    />
  );
}
