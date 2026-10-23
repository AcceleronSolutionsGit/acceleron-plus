import React from "react";
import { projectDb } from "@/lib/db";
import { getSession, projectsManagedBy } from "@/lib/auth";
import { GovernanceDashboardClient } from "./GovernanceDashboardClient";

export const dynamic = "force-dynamic";

export default async function GovernancePage() {
  const session = await getSession();

  // Fetch reviews with joined project info
  const reviews = await projectDb("governance_reviews")
    .join("projects", "governance_reviews.project_id", "projects.id")
    .select(
      "governance_reviews.*",
      "projects.name as project_name",
      "projects.code as project_code",
      "projects.client_company_name",
      "projects.status as project_status"
    )
    .orderBy("governance_reviews.review_date", "desc");

  // Fetch active projects for modal dropdown
  const projects = await projectDb("projects")
    .select("id", "code", "name", "client_company_name")
    .orderBy("code", "asc");

  // Format ISO strings to prevent date hydration issues
  const formattedReviews = reviews.map((r) => ({
    ...r,
    review_date: r.review_date ? new Date(r.review_date).toISOString() : "",
    created_at: r.created_at ? new Date(r.created_at).toISOString() : "",
  }));

  const isAdmin = session?.role === "admin" || Boolean(session?.additionalRoles?.includes("admin"));
  const isDmOrPm =
    session?.role === "pm" ||
    session?.roleCode === "delivery_manager" ||
    Boolean(session?.additionalRoleCodes?.some((c: string) => /delivery.?manager/i.test(c)));
  const managed = await projectsManagedBy(session?.userId, isDmOrPm);

  const targetProjects = isAdmin ? projects : projects.filter((p) => managed.has(p.id));
  const targetReviews = isAdmin ? formattedReviews : formattedReviews.filter((r) => managed.has(r.project_id));

  const totalReviews = targetReviews.length;
  const passedReviews = targetReviews.filter((r) => r.outcome === "pass").length;
  const conditionalReviews = targetReviews.filter((r) => r.outcome === "conditional_pass").length;
  const failedReviews = targetReviews.filter((r) => r.outcome === "fail").length;
  const pendingReviews = targetReviews.filter((r) => !r.outcome).length;

  const complianceRate = totalReviews > 0
    ? Math.round(((passedReviews + conditionalReviews * 0.5) / totalReviews) * 100)
    : 100;

  const initialStats = {
    totalReviews,
    passedReviews,
    conditionalReviews,
    failedReviews,
    pendingReviews,
    complianceRate,
  };

  return (
    <GovernanceDashboardClient
      initialReviews={targetReviews}
      initialStats={initialStats}
      projects={targetProjects}
      userRole={session?.role ?? "member"}
    />
  );
}
