import { NextResponse } from "next/server";
import { projectDb } from "@/lib/db";
import { requireProjectCapability, capabilityDenied, can } from "@/lib/auth";
import { notifyAsync, events } from "@/lib/notifications";
import { WBS_FIELDS } from "@/lib/pmt-fields";
import {
  coerceFields,
  validationError,
  readJson,
  serverError,
} from "@/lib/route-helpers";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string; itemId: string }> };

/** Walk up the tree to make sure a move doesn't create a cycle. */
async function wouldCycle(projectId: string, itemId: string, newParentId: string): Promise<boolean> {
  let cursor: string | null = newParentId;
  const seen = new Set<string>();

  while (cursor) {
    if (cursor === itemId) return true;
    if (seen.has(cursor)) return true; // pre-existing loop; refuse anyway
    seen.add(cursor);

    const row: { parent_wbs_id: string | null } | undefined = await projectDb("wbs_items")
      .where({ id: cursor, project_id: projectId })
      .select("parent_wbs_id")
      .first();
    cursor = row?.parent_wbs_id ?? null;
  }
  return false;
}

export async function GET(_req: Request, context: Params) {
  try {
    const { id, itemId } = await context.params;
    const guard = await requireProjectCapability(id, "plan.view");
    if (!guard.ok) return guard.response;

    const item = await projectDb("wbs_items")
      .where({ id: itemId, project_id: guard.project.id })
      .first();
    if (!item) {
      return NextResponse.json({ success: false, error: "Work package not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, wbsItem: item });
  } catch (err) {
    return serverError("wbs.item.GET", err);
  }
}

export async function PATCH(req: Request, context: Params) {
  try {
    const { id, itemId } = await context.params;
    // Resolve the project and the caller's access first; which capability
    // this edit needs depends on what the body is actually changing.
    const guard = await requireProjectCapability(id, "plan.view");
    if (!guard.ok) return guard.response;
    const { project, access, session } = guard;

    const existing = await projectDb("wbs_items")
      .where({ id: itemId, project_id: project.id })
      .first();
    if (!existing) {
      return NextResponse.json({ success: false, error: "Work package not found" }, { status: 404 });
    }

    const parsed = await readJson(req);
    if (!parsed.ok) return parsed.response;

    const { values, errors } = coerceFields(parsed.body, WBS_FIELDS, "update");
    if (errors.length > 0) return validationError(errors);

    if (Object.keys(values).length === 0) {
      return validationError(["No editable fields were supplied."]);
    }

    // A contributor may move their own progress bar but not the schedule,
    // so the required capability comes from the fields being written.
    const touched = Object.keys(values);
    const required = touched.every((field) => field === "progress_percent")
      ? "plan.updateProgress"
      : touched.every((field) => field === "start_date" || field === "end_date")
        ? "plan.reschedule"
        : "plan.edit";
    if (!can(access, required)) return capabilityDenied(access, required);

    // Re-parenting checks.
    if (values.parent_wbs_id !== undefined && values.parent_wbs_id !== null) {
      const parentId = values.parent_wbs_id as string;
      if (parentId === itemId) {
        return validationError(["A work package cannot be its own parent."]);
      }
      const parent = await projectDb("wbs_items")
        .where({ id: parentId, project_id: project.id })
        .first();
      if (!parent) {
        return validationError(["The parent work package does not belong to this project."]);
      }
      if (await wouldCycle(project.id, itemId, parentId)) {
        return validationError(["That move would make the work breakdown circular."]);
      }
    }

    // Validate the date window against whatever the row will hold afterwards.
    const start = (values.start_date as Date | null | undefined) ?? existing.start_date;
    const end = (values.end_date as Date | null | undefined) ?? existing.end_date;
    if (start && end && new Date(end) < new Date(start)) {
      return validationError(["The end date cannot fall before the start date."]);
    }

    // Completing a work package implies 100%; reopening it undoes that.
    if (values.status === "completed" && values.progress_percent === undefined) {
      values.progress_percent = 100;
    }
    if (values.progress_percent === 100 && values.status === undefined && existing.status !== "completed") {
      values.status = "completed";
    }

    const [updated] = await projectDb("wbs_items")
      .where({ id: itemId, project_id: project.id })
      .update({ ...values, updated_at: new Date() })
      .returning("*");

    if (values.status !== undefined && values.status !== existing.status) {
      notifyAsync(
        events.wbsStatusChanged(
          project.id,
          updated.id,
          updated.name,
          String(values.status),
          session.userId
        )
      );
    }

    return NextResponse.json({ success: true, wbsItem: updated });
  } catch (err) {
    return serverError("wbs.item.PATCH", err);
  }
}

export async function DELETE(_req: Request, context: Params) {
  try {
    const { id, itemId } = await context.params;
    const guard = await requireProjectCapability(id, "plan.delete");
    if (!guard.ok) return guard.response;
    const { project } = guard;

    const existing = await projectDb("wbs_items")
      .where({ id: itemId, project_id: project.id })
      .first();
    if (!existing) {
      return NextResponse.json({ success: false, error: "Work package not found" }, { status: 404 });
    }

    const children = await projectDb("wbs_items")
      .where({ parent_wbs_id: itemId, project_id: project.id })
      .count("* as n")
      .first<{ n: string }>();
    if (Number(children?.n ?? 0) > 0) {
      return NextResponse.json(
        {
          success: false,
          error: "This work package has child items. Delete or re-parent them first.",
        },
        { status: 409 }
      );
    }

    // Timesheets reference wbs_item_id; removing the row would orphan them.
    const logged = await projectDb("project_timesheets")
      .where("wbs_item_id", itemId)
      .count("* as n")
      .first<{ n: string }>()
      .catch(() => ({ n: "0" }));
    if (Number(logged?.n ?? 0) > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `This work package has ${logged!.n} timesheet entries against it and cannot be deleted. Mark it blocked or completed instead.`,
        },
        { status: 409 }
      );
    }

    await projectDb("wbs_items").where({ id: itemId, project_id: project.id }).del();

    return NextResponse.json({ success: true, deletedId: itemId });
  } catch (err) {
    return serverError("wbs.item.DELETE", err);
  }
}
