import { NextResponse } from "next/server";
import { getProjectWBS } from "@/lib/api";
import { projectDb } from "@/lib/db";
import { requireProjectCapability } from "@/lib/auth";
import { notifyAsync, events } from "@/lib/notifications";
import { WBS_FIELDS } from "@/lib/pmt-fields";
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

    const wbs = await getProjectWBS(guard.project.id);
    return NextResponse.json({ success: true, wbs }, { status: 200 });
  } catch (err) {
    return serverError("wbs.GET", err);
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

    const { values, errors } = coerceFields(parsed.body, WBS_FIELDS, "create");
    if (errors.length > 0) return validationError(errors);

    // A parent must belong to this project — otherwise the tree could be
    // grafted onto someone else's plan.
    if (values.parent_wbs_id) {
      const parent = await projectDb("wbs_items")
        .where({ id: values.parent_wbs_id as string, project_id: project.id })
        .first();
      if (!parent) {
        return validationError(["The parent work package does not belong to this project."]);
      }
    }

    // PATCH validated this; POST was relying on the database check
    // constraint, which surfaced as an opaque 500.
    if (
      values.start_date &&
      values.end_date &&
      new Date(values.end_date as Date) < new Date(values.start_date as Date)
    ) {
      return validationError(["The end date cannot fall before the start date."]);
    }

    // Default the sequence to the end of the list.
    if (values.sequence === undefined) {
      const last = await projectDb("wbs_items")
        .where("project_id", project.id)
        .max("sequence as max")
        .first<{ max: number | null }>();
      values.sequence = (last?.max ?? 0) + 1;
    }

    if (!values.code) {
      values.code = `WBS-${String(values.sequence).padStart(3, "0")}`;
    }

    const [newItem] = await projectDb("wbs_items")
      .insert({
        ...values,
        project_id: project.id,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning("*");

    if (newItem.status && newItem.status !== "not_started") {
      notifyAsync(
        events.wbsStatusChanged(
          project.id,
          newItem.id,
          newItem.name,
          newItem.status,
          session.userId
        )
      );
    }

    return NextResponse.json({ success: true, wbsItem: newItem }, { status: 201 });
  } catch (err) {
    return serverError("wbs.POST", err);
  }
}
