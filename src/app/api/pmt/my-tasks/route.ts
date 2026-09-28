// GET   /api/pmt/my-tasks  — everything allotted to me, across projects
// PATCH /api/pmt/my-tasks  — update one of mine without opening its project
//
// Delivery work does not respect project boundaries. Somebody on three
// projects should not have to visit three pages to find out what they
// owe this week, so this reads across all of them at once.

import { NextResponse } from "next/server";
import { projectDb } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { readJson, validationError, serverError } from "@/lib/route-helpers";
import {
  tasksForUser,
  recalculateWbsItem,
  ASSIGNMENT_STATUSES,
  type AssignmentStatus,
} from "@/lib/assignments";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const url = new URL(req.url);
    const includeCompleted = url.searchParams.get("includeCompleted") === "true";

    const tasks = await tasksForUser(auth.session.userId, { includeCompleted });

    const open = tasks.filter((t) => t.status !== "completed");
    const summary = {
      total: tasks.length,
      open: open.length,
      overdue: tasks.filter((t) => t.overdue).length,
      dueThisWeek: open.filter(
        (t) => t.daysRemaining !== null && t.daysRemaining >= 0 && t.daysRemaining <= 7
      ).length,
      plannedHours:
        Math.round(open.reduce((sum, t) => sum + (t.plannedHours ?? 0), 0) * 100) / 100,
      projects: new Set(tasks.map((t) => t.projectCode)).size,
    };

    return NextResponse.json({ success: true, tasks, summary });
  } catch (err) {
    return serverError("myTasks.GET", err);
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const parsed = await readJson(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.body as Record<string, unknown>;

    const assignmentId = String(body.assignmentId ?? "").trim();
    if (!assignmentId) return validationError(["Which assignment?"]);

    // Scoped to the caller's own row, so this endpoint cannot be used
    // to reach anybody else's work regardless of what is passed in.
    const existing = await projectDb("wbs_assignments")
      .where({ id: assignmentId, user_id: auth.session.userId })
      .first<Record<string, unknown> | undefined>();
    if (!existing) {
      return NextResponse.json(
        {
          success: false,
          error: "That assignment is not one of yours. Open the project to update somebody else's.",
        },
        { status: 404 }
      );
    }

    const updates: Record<string, unknown> = { updated_at: new Date() };
    const errors: string[] = [];

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

    if (errors.length > 0) return validationError(errors);
    if (Object.keys(updates).length === 1) {
      return validationError(["Send a progress, a status or a note."]);
    }

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

    const rollup = await recalculateWbsItem(String(existing.wbs_item_id));

    return NextResponse.json({ success: true, assignment: updated, rollup });
  } catch (err) {
    return serverError("myTasks.PATCH", err);
  }
}
