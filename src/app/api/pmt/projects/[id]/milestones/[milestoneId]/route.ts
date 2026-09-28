import { NextResponse } from "next/server";
import { projectDb } from "@/lib/db";
import { requireProjectCapability } from "@/lib/auth";
import { notifyAsync, events } from "@/lib/notifications";
import { MILESTONE_FIELDS } from "@/lib/pmt-fields";
import {
  coerceFields,
  validationError,
  readJson,
  serverError,
} from "@/lib/route-helpers";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string; milestoneId: string }> };

export async function PATCH(req: Request, context: Params) {
  try {
    const { id, milestoneId } = await context.params;
    const guard = await requireProjectCapability(id, "plan.edit");
    if (!guard.ok) return guard.response;
    const { project, session } = guard;

    const existing = await projectDb("milestones")
      .where({ id: milestoneId, project_id: project.id })
      .first();
    if (!existing) {
      return NextResponse.json({ success: false, error: "Milestone not found" }, { status: 404 });
    }

    const parsed = await readJson(req);
    if (!parsed.ok) return parsed.response;

    const { values, errors } = coerceFields(parsed.body, MILESTONE_FIELDS, "update");
    if (errors.length > 0) return validationError(errors);

    if (Object.keys(values).length === 0) {
      return validationError(["No editable fields were supplied."]);
    }

    // Completing a milestone stamps the time; reopening it clears the stamp.
    const becameComplete = values.status === "completed" && existing.status !== "completed";
    if (becameComplete && values.completed_at === undefined) {
      values.completed_at = new Date();
    }
    if (values.status !== undefined && values.status !== "completed") {
      values.completed_at = null;
    }

    const [updated] = await projectDb("milestones")
      .where({ id: milestoneId, project_id: project.id })
      .update({ ...values, updated_at: new Date() })
      .returning("*");

    if (becameComplete) {
      notifyAsync(
        events.milestoneCompleted(project.id, updated.id, updated.name, session.userId)
      );
    }

    return NextResponse.json({ success: true, milestone: updated });
  } catch (err) {
    return serverError("milestones.item.PATCH", err);
  }
}

export async function DELETE(_req: Request, context: Params) {
  try {
    const { id, milestoneId } = await context.params;
    const guard = await requireProjectCapability(id, "plan.delete");
    if (!guard.ok) return guard.response;

    const deleted = await projectDb("milestones")
      .where({ id: milestoneId, project_id: guard.project.id })
      .del();

    if (deleted === 0) {
      return NextResponse.json({ success: false, error: "Milestone not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, deletedId: milestoneId });
  } catch (err) {
    return serverError("milestones.item.DELETE", err);
  }
}
