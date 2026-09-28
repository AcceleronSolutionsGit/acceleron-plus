// GET  .../wbs/<itemId>/assignments  — who is on this work package
// POST .../wbs/<itemId>/assignments  — allot it to somebody

import { NextResponse } from "next/server";
import { projectDb } from "@/lib/db";
import { requireProjectCapability, can } from "@/lib/auth";
import { readJson, validationError, serverError } from "@/lib/route-helpers";
import {
  assignmentsFor,
  recalculateWbsItem,
  canUpdateAssignment,
} from "@/lib/assignments";
import { toDateInput } from "@/lib/dates";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string; itemId: string }> };

async function requireItem(projectId: string, itemId: string) {
  return projectDb("wbs_items")
    .where({ id: itemId, project_id: projectId })
    .first<Record<string, unknown> | undefined>();
}

export async function GET(_req: Request, context: Params) {
  try {
    const { id, itemId } = await context.params;
    const guard = await requireProjectCapability(id, "plan.view");
    if (!guard.ok) return guard.response;

    const item = await requireItem(guard.project.id, itemId);
    if (!item) {
      return NextResponse.json(
        { success: false, error: "Work package not found" },
        { status: 404 }
      );
    }

    const assignments = await assignmentsFor(itemId);
    const me = guard.access.userId;

    return NextResponse.json({
      success: true,
      assignments: assignments.map((a) => ({
        ...a,
        isMine: a.userId === me,
        canUpdate: canUpdateAssignment(guard.access, a, me),
      })),
      canAssign: can(guard.access, "plan.edit"),
      totals: {
        people: assignments.length,
        plannedHours: assignments.reduce((sum, a) => sum + (a.plannedHours ?? 0), 0),
        estimatedHours: item.estimated_hours === null ? null : Number(item.estimated_hours),
      },
    });
  } catch (err) {
    return serverError("assignments.GET", err);
  }
}

export async function POST(req: Request, context: Params) {
  try {
    const { id, itemId } = await context.params;
    // Handing work out is a planning act, not a progress update.
    const guard = await requireProjectCapability(id, "plan.edit");
    if (!guard.ok) return guard.response;
    const { project, session } = guard;

    const item = await requireItem(project.id, itemId);
    if (!item) {
      return NextResponse.json(
        { success: false, error: "Work package not found" },
        { status: 404 }
      );
    }

    const parsed = await readJson(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.body as Record<string, unknown>;

    const memberId = String(body.teamMemberId ?? "").trim();
    const userId = String(body.userId ?? "").trim();
    if (!memberId && !userId) {
      return validationError(["Choose somebody from the project team."]);
    }

    // Work is allotted to people who are *on* the project. Assigning
    // somebody who was never staffed would give them work with no
    // rate, no allocation and no place in the cost.
    const member = await projectDb("project_team_members")
      .where({ project_id: project.id, is_active: true })
      .andWhere(function () {
        if (memberId) this.where("id", memberId);
        else this.where("user_id", userId);
      })
      .first<Record<string, unknown> | undefined>();

    if (!member) {
      return validationError([
        "That person is not on this project's team. Add them under Team & Resources first.",
      ]);
    }

    const already = await projectDb("wbs_assignments")
      .where({ wbs_item_id: itemId, user_id: String(member.user_id) })
      .first();
    if (already) {
      return NextResponse.json(
        {
          success: false,
          error: `${member.user_name ?? "That person"} already has this work package.`,
        },
        { status: 409 }
      );
    }

    const errors: string[] = [];
    const plannedHours =
      body.plannedHours === undefined || body.plannedHours === null || body.plannedHours === ""
        ? null
        : Number(body.plannedHours);
    if (plannedHours !== null && (!Number.isFinite(plannedHours) || plannedHours < 0 || plannedHours > 10000)) {
      errors.push("Planned hours must be between 0 and 10000.");
    }

    const startDate = toDateInput(body.startDate as string) || null;
    const dueDate = toDateInput(body.dueDate as string) || null;
    if (startDate && dueDate && dueDate < startDate) {
      errors.push("The due date cannot fall before the start date.");
    }

    // Default the window to the package's own, which is nearly always
    // what is meant and saves retyping it for each person.
    const effectiveStart = startDate ?? (toDateInput(item.start_date as string) || null);
    const effectiveDue = dueDate ?? (toDateInput(item.end_date as string) || null);

    if (errors.length > 0) return validationError(errors);

    const [assignment] = await projectDb("wbs_assignments")
      .insert({
        project_id: project.id,
        wbs_item_id: itemId,
        user_id: String(member.user_id),
        employee_id: member.employee_id ?? null,
        user_name: member.user_name ?? null,
        planned_hours: plannedHours,
        progress_percent: 0,
        status: "not_started",
        start_date: effectiveStart,
        due_date: effectiveDue,
        notes: String(body.notes ?? "").trim() || null,
        assigned_by_user_id: session.userId,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning("*");

    const rollup = await recalculateWbsItem(itemId);

    // Over-committing shows up as a note rather than a refusal: hours
    // are an estimate, and a PM juggling a week does not need a wall.
    let warning: string | null = null;
    const estimated = item.estimated_hours === null ? null : Number(item.estimated_hours);
    if (estimated && rollup && rollup.assignedHours > estimated) {
      const tidy = (n: number) => Math.round(n * 100) / 100;
      warning =
        `The package is estimated at ${tidy(estimated)}h but ${tidy(rollup.assignedHours)}h are now allotted across ${rollup.assignedCount} people.`;
    }

    return NextResponse.json({ success: true, assignment, rollup, warning }, { status: 201 });
  } catch (err) {
    return serverError("assignments.POST", err);
  }
}
