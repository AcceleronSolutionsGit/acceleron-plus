import { NextResponse } from "next/server";
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

type Params = { params: Promise<{ id: string; reviewId: string }> };

export async function PATCH(req: Request, context: Params) {
  try {
    const { id, reviewId } = await context.params;
    const guard = await requireProjectCapability(id, "governance.record");
    if (!guard.ok) return guard.response;
    const { project, session } = guard;

    const existing = await projectDb("governance_reviews")
      .where({ id: reviewId, project_id: project.id })
      .first();
    if (!existing) {
      return NextResponse.json({ success: false, error: "Review not found" }, { status: 404 });
    }

    const parsed = await readJson(req);
    if (!parsed.ok) return parsed.response;

    const { values, errors } = coerceFields(parsed.body, GOVERNANCE_FIELDS, "update");
    if (errors.length > 0) return validationError(errors);

    if (Object.keys(values).length === 0) {
      return validationError(["No editable fields were supplied."]);
    }

    const [updated] = await projectDb("governance_reviews")
      .where({ id: reviewId, project_id: project.id })
      .update(values)
      .returning("*");

    // Only announce a change of outcome, not a notes tidy-up.
    if (values.outcome !== undefined && values.outcome !== existing.outcome) {
      notifyAsync(
        events.governanceRecorded(
          project.id,
          updated.id,
          updated.review_type,
          updated.outcome ?? null,
          session.userId
        )
      );
    }

    return NextResponse.json({ success: true, review: updated });
  } catch (err) {
    return serverError("governance.item.PATCH", err);
  }
}

export async function DELETE(_req: Request, context: Params) {
  try {
    // Stage-gate reviews are an audit record: governance.delete is an
    // admin-only capability.
    const { id, reviewId } = await context.params;
    const guard = await requireProjectCapability(id, "governance.delete");
    if (!guard.ok) return guard.response;

    const deleted = await projectDb("governance_reviews")
      .where({ id: reviewId, project_id: guard.project.id })
      .del();

    if (deleted === 0) {
      return NextResponse.json({ success: false, error: "Review not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, deletedId: reviewId });
  } catch (err) {
    return serverError("governance.item.DELETE", err);
  }
}
