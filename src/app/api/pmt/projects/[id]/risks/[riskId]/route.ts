import { NextResponse } from "next/server";
import { projectDb } from "@/lib/db";
import { requireProjectCapability } from "@/lib/auth";
import { notifyAsync, events } from "@/lib/notifications";
import { RISK_FIELDS } from "@/lib/pmt-fields";
import {
  coerceFields,
  validationError,
  readJson,
  serverError,
} from "@/lib/route-helpers";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string; riskId: string }> };

export async function PATCH(req: Request, context: Params) {
  try {
    const { id, riskId } = await context.params;
    const guard = await requireProjectCapability(id, "risk.edit");
    if (!guard.ok) return guard.response;
    const { project, session } = guard;

    const existing = await projectDb("risks").where({ id: riskId, project_id: project.id }).first();
    if (!existing) {
      return NextResponse.json({ success: false, error: "Risk not found" }, { status: 404 });
    }

    const parsed = await readJson(req);
    if (!parsed.ok) return parsed.response;

    const { values, errors } = coerceFields(parsed.body, RISK_FIELDS, "update");
    if (errors.length > 0) return validationError(errors);

    if (Object.keys(values).length === 0) {
      return validationError(["No editable fields were supplied."]);
    }

    const [updated] = await projectDb("risks")
      .where({ id: riskId, project_id: project.id })
      .update({ ...values, updated_at: new Date() })
      .returning("*");

    // Alert only on the transition INTO high/high, not on every later edit.
    const wasSevere = existing.probability === "high" && existing.impact === "high";
    const isSevere = updated.probability === "high" && updated.impact === "high";
    const stillOpen = updated.status !== "closed" && updated.status !== "accepted";

    if (!wasSevere && isSevere && stillOpen) {
      notifyAsync(events.riskEscalated(project.id, updated.id, updated.title, session.userId));
    }

    return NextResponse.json({ success: true, risk: updated });
  } catch (err) {
    return serverError("risks.item.PATCH", err);
  }
}

export async function DELETE(_req: Request, context: Params) {
  try {
    const { id, riskId } = await context.params;
    const guard = await requireProjectCapability(id, "risk.delete");
    if (!guard.ok) return guard.response;

    const deleted = await projectDb("risks")
      .where({ id: riskId, project_id: guard.project.id })
      .del();

    if (deleted === 0) {
      return NextResponse.json({ success: false, error: "Risk not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, deletedId: riskId });
  } catch (err) {
    return serverError("risks.item.DELETE", err);
  }
}
