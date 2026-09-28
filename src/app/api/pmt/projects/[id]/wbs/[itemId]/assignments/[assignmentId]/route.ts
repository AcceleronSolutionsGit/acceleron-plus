// PATCH  .../assignments/<assignmentId>  — update an assignment
// DELETE .../assignments/<assignmentId>  — take it back
//
// This is the route a delivery person uses every day, so the rule it
// enforces matters: you may update your own work; a project manager may
// update anyone's. Planning fields — who has it, how many hours, the
// dates — stay with whoever can edit the plan.

import { NextResponse } from "next/server";
import { projectDb } from "@/lib/db";
import { requireProjectCapability, can } from "@/lib/auth";
import { readJson, validationError, serverError } from "@/lib/route-helpers";
import {
  recalculateWbsItem,
  canUpdateAssignment,
  describeUpdateRefusal,
  ASSIGNMENT_STATUSES,
  type AssignmentStatus,
} from "@/lib/assignments";
import { toDateInput } from "@/lib/dates";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string; itemId: string; assignmentId: string }> };

export async function PATCH(req: Request, context: Params) {
  try {
    const { id, itemId, assignmentId } = await context.params;
    // Resolve with the read capability; which rights this needs depends
    // on whose assignment it is and what is being changed.
    const guard = await requireProjectCapability(id, "plan.view");
    if (!guard.ok) return guard.response;
    const { project, access } = guard;

    const existing = await projectDb("wbs_assignments")
      .where({ id: assignmentId, wbs_item_id: itemId, project_id: project.id })
      .first<Record<string, unknown> | undefined>();
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "That assignment is not on this work package." },
        { status: 404 }
      );
    }

    const mine = { userId: String(existing.user_id), userName: existing.user_name as string | null };
    if (!canUpdateAssignment(access, mine, access.userId)) {
      return NextResponse.json(
        {
          success: false,
          error: describeUpdateRefusal(mine),
          assignedTo: mine.userName,
        },
        { status: 403 }
      );
    }

    const parsed = await readJson(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.body as Record<string, unknown>;

    const isPlanner = can(access, "plan.edit");
    const updates: Record<string, unknown> = { updated_at: new Date() };
    const errors: string[] = [];

    // ── What the assignee owns ────────────────────────────────
    if (body.progressPercent !== undefined) {
      const progress = Number(body.progressPercent);
      if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
        errors.push("Progress must be a whole number between 0 and 100.");
      } else {
        updates.progress_percent = progress;
      }
    }

    if (body.status !== undefined) {
      const status = String(body.status);
      if (!ASSIGNMENT_STATUSES.includes(status as AssignmentStatus)) {
        errors.push(`Status must be one of: ${ASSIGNMENT_STATUSES.join(", ")}.`);
      } else {
        updates.status = status;
      }
    }

    if (body.notes !== undefined) updates.notes = String(body.notes).trim() || null;

    // ── What only a planner owns ──────────────────────────────
    const plannerFields = ["plannedHours", "startDate", "dueDate"];
    const attempted = plannerFields.filter((f) => body[f] !== undefined);
    if (attempted.length > 0 && !isPlanner) {
      return NextResponse.json(
        {
          success: false,
          error:
            "You can update your progress, status and notes. Changing the hours or the dates is a project manager's call.",
          refusedFields: attempted,
        },
        { status: 403 }
      );
    }

    if (body.plannedHours !== undefined) {
      if (body.plannedHours === null || body.plannedHours === "") {
        updates.planned_hours = null;
      } else {
        const hours = Number(body.plannedHours);
        if (!Number.isFinite(hours) || hours < 0 || hours > 10000) {
          errors.push("Planned hours must be between 0 and 10000.");
        } else {
          updates.planned_hours = hours;
        }
      }
    }
    if (body.startDate !== undefined) updates.start_date = toDateInput(body.startDate as string) || null;
    if (body.dueDate !== undefined) updates.due_date = toDateInput(body.dueDate as string) || null;

    const start = (updates.start_date ?? toDateInput(existing.start_date as string)) as string | null;
    const due = (updates.due_date ?? toDateInput(existing.due_date as string)) as string | null;
    if (start && due && due < start) {
      errors.push("The due date cannot fall before the start date.");
    }

    if (errors.length > 0) return validationError(errors);
    if (Object.keys(updates).length === 1) {
      return validationError(["No editable fields were supplied."]);
    }

    // Finishing implies 100%; reopening undoes both, so the two can
    // never disagree on a screen.
    if (updates.status === "completed" && updates.progress_percent === undefined) {
      updates.progress_percent = 100;
    }
    if (updates.progress_percent === 100 && updates.status === undefined) {
      updates.status = "completed";
    }
    if (updates.status === "completed") {
      updates.completed_at = existing.completed_at ?? new Date();
    } else if (updates.status !== undefined) {
      updates.completed_at = null;
    }

    const [updated] = await projectDb("wbs_assignments")
      .where("id", assignmentId)
      .update(updates)
      .returning("*");

    // The package follows its people, not the other way round.
    const rollup = await recalculateWbsItem(itemId);

    return NextResponse.json({ success: true, assignment: updated, rollup });
  } catch (err) {
    return serverError("assignments.item.PATCH", err);
  }
}

export async function DELETE(_req: Request, context: Params) {
  try {
    const { id, itemId, assignmentId } = await context.params;
    const guard = await requireProjectCapability(id, "plan.edit");
    if (!guard.ok) return guard.response;

    const existing = await projectDb("wbs_assignments")
      .where({ id: assignmentId, wbs_item_id: itemId, project_id: guard.project.id })
      .first<Record<string, unknown> | undefined>();
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "That assignment is not on this work package." },
        { status: 404 }
      );
    }

    await projectDb("wbs_assignments").where("id", assignmentId).del();
    const rollup = await recalculateWbsItem(itemId);

    return NextResponse.json({ success: true, deletedId: assignmentId, rollup });
  } catch (err) {
    return serverError("assignments.item.DELETE", err);
  }
}
