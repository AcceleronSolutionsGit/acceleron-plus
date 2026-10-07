import React from "react";
import { projectDb } from "@/lib/db";
import { getSession } from "@/lib/auth";
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

  const totalReviews = formattedReviews.length;
  const passedReviews = formattedReviews.filter((r) => r.outcome === "pass").length;
  const conditionalReviews = formattedReviews.filter((r) => r.outcome === "conditional_pass").length;
  const failedReviews = formattedReviews.filter((r) => r.outcome === "fail").length;
  const pendingReviews = formattedReviews.filter((r) => !r.outcome).length;

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
      initialReviews={formattedReviews}
      initialStats={initialStats}
      projects={projects}
      userRole={session?.role ?? "member"}
    />
  );
}
