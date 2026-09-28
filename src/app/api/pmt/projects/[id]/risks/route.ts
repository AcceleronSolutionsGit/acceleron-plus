import { NextResponse } from "next/server";
import { getProjectRisks } from "@/lib/api";
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

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const guard = await requireProjectCapability(id, "risk.view");
    if (!guard.ok) return guard.response;

    const risks = await getProjectRisks(guard.project.id);
    return NextResponse.json({ success: true, risks }, { status: 200 });
  } catch (err) {
    return serverError("risks.GET", err);
  }
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const guard = await requireProjectCapability(id, "risk.create");
    if (!guard.ok) return guard.response;
    const { project, session } = guard;

    const parsed = await readJson(req);
    if (!parsed.ok) return parsed.response;

    const { values, errors } = coerceFields(parsed.body, RISK_FIELDS, "create");
    if (errors.length > 0) return validationError(errors);

    if (values.status === undefined) values.status = "open";

    const [risk] = await projectDb("risks")
      .insert({
        ...values,
        project_id: project.id,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning("*");

    notifyAsync(
      events.riskRaised(
        project.id,
        risk.id,
        risk.title,
        risk.probability ?? null,
        risk.impact ?? null,
        session.userId
      )
    );

    return NextResponse.json({ success: true, risk }, { status: 201 });
  } catch (err) {
    return serverError("risks.POST", err);
  }
}
