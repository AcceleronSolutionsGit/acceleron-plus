import { NextResponse } from "next/server";
import { getProjectMilestones } from "@/lib/api";
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

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const guard = await requireProjectCapability(id, "plan.view");
    if (!guard.ok) return guard.response;

    const milestones = await getProjectMilestones(guard.project.id);
    return NextResponse.json({ success: true, milestones }, { status: 200 });
  } catch (err) {
    return serverError("milestones.GET", err);
  }
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const guard = await requireProjectCapability(id, "plan.create");
    if (!guard.ok) return guard.response;
    const { project, session } = guard;

    const parsed = await readJson(req);
    if (!parsed.ok) return parsed.response;

    const { values, errors } = coerceFields(parsed.body, MILESTONE_FIELDS, "create");
    if (errors.length > 0) return validationError(errors);

    if (values.status === undefined) values.status = "pending";

    const [milestone] = await projectDb("milestones")
      .insert({
        ...values,
        project_id: project.id,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning("*");

    notifyAsync(
      events.milestoneCreated(
        project.id,
        milestone.id,
        milestone.name,
        milestone.due_date ? new Date(milestone.due_date).toISOString() : null,
        session.userId
      )
    );

    return NextResponse.json({ success: true, milestone }, { status: 201 });
  } catch (err) {
    return serverError("milestones.POST", err);
  }
}
