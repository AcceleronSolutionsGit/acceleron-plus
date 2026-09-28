import { NextResponse } from "next/server";
import { projectDb } from "@/lib/db";
import { serverError } from "@/lib/route-helpers";
import { randomUUID } from "crypto";
import { requireSession, requireCapabilityGlobally } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");

    let query = projectDb("governance_reviews")
      .join("projects", "governance_reviews.project_id", "projects.id")
      .select(
        "governance_reviews.*",
        "projects.name as project_name",
        "projects.code as project_code",
        "projects.client_company_name",
        "projects.status as project_status"
      )
      .orderBy("governance_reviews.review_date", "desc");

    if (projectId) {
      query = query.where("governance_reviews.project_id", projectId);
    }

    const reviews = await query;

    // Calculate Governance KPIs
    const totalReviews = reviews.length;
    const passedReviews = reviews.filter((r) => r.outcome === "pass").length;
    const conditionalReviews = reviews.filter((r) => r.outcome === "conditional_pass").length;
    const failedReviews = reviews.filter((r) => r.outcome === "fail").length;
    const pendingReviews = reviews.filter((r) => !r.outcome).length;

    const complianceRate = totalReviews > 0
      ? Math.round(((passedReviews + conditionalReviews * 0.5) / totalReviews) * 100)
      : 100;

    return NextResponse.json({
      success: true,
      data: {
        reviews,
        stats: {
          totalReviews,
          passedReviews,
          conditionalReviews,
          failedReviews,
          pendingReviews,
          complianceRate,
        },
      },
    });
  } catch (error) {
    return serverError("governanceOverview", error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireCapabilityGlobally("governance.record");
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { project_id, review_type, review_date, outcome, notes } = body;

    if (!project_id || !review_type || !review_date) {
      return NextResponse.json(
        { success: false, error: "Missing required fields (project_id, review_type, review_date)" },
        { status: 400 }
      );
    }

    const newReview = {
      id: randomUUID(),
      project_id,
      review_type,
      review_date,
      outcome: outcome || null,
      notes: notes || null,
      created_at: new Date().toISOString(),
    };

    await projectDb("governance_reviews").insert(newReview);

    return NextResponse.json({ success: true, data: newReview });
  } catch (error) {
    return serverError("governanceOverview", error);
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireCapabilityGlobally("governance.record");
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { id, outcome, notes, review_date, review_type } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Missing review ID" },
        { status: 400 }
      );
    }

    const updates: Record<string, any> = {};
    if (outcome !== undefined) updates.outcome = outcome;
    if (notes !== undefined) updates.notes = notes;
    if (review_date !== undefined) updates.review_date = review_date;
    if (review_type !== undefined) updates.review_type = review_type;

    await projectDb("governance_reviews").where("id", id).update(updates);

    return NextResponse.json({ success: true, message: "Governance review updated" });
  } catch (error) {
    return serverError("governanceOverview", error);
  }
}
