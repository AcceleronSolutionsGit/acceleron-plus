import { NextResponse } from "next/server";
import { getProjectGovernanceReviews } from "@/lib/api";
import { projectDb } from "@/lib/db";
import { requireProjectCapability } from "@/lib/auth";
import { notifyAsync, events } from "@/lib/notifications";
import { GOVERNANCE_FIELDS } from "@/lib/pmt-fields";
import {
  coerceFields,
  validationError,
  readJson,
  serverError,
} from "@/lib/route-helpers";

export const runtime = "nodejs";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const guard = await requireProjectCapability(id, "governance.view");
    if (!guard.ok) return guard.response;

    const reviews = await getProjectGovernanceReviews(guard.project.id);
    return NextResponse.json({ success: true, reviews }, { status: 200 });
  } catch (err) {
    return serverError("governance.GET", err);
  }
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    // Recording a stage-gate outcome is a PM/admin decision.
    const { id } = await context.params;
    const guard = await requireProjectCapability(id, "governance.record");
    if (!guard.ok) return guard.response;
    const { project, session } = guard;

    const parsed = await readJson(req);
    if (!parsed.ok) return parsed.response;

    const { values, errors } = coerceFields(parsed.body, GOVERNANCE_FIELDS, "create");
    if (errors.length > 0) return validationError(errors);

    const [review] = await projectDb("governance_reviews")
      .insert({ ...values, project_id: project.id, created_at: new Date() })
      .returning("*");

    notifyAsync(
      events.governanceRecorded(
        project.id,
        review.id,
        review.review_type,
        review.outcome ?? null,
        session.userId
      )
    );

    return NextResponse.json({ success: true, review }, { status: 201 });
  } catch (err) {
    return serverError("governance.POST", err);
  }
}
