import { NextResponse } from "next/server";
import { projectDb } from "@/lib/db";
import { requireProjectCapability } from "@/lib/auth";
import { serverError } from "@/lib/route-helpers";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string; testId: string }> };

export async function PATCH(req: Request, context: Params) {
  try {
    const { id, testId } = await context.params;
    const guard = await requireProjectCapability(id, "plan.edit"); 
    if (!guard.ok) return guard.response;

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (body.title !== undefined) updates.title = body.title;
    if (body.steps !== undefined) updates.steps = body.steps || null;
    if (body.expectedResult !== undefined) updates.expected_result = body.expectedResult || null;
    if (body.type !== undefined) updates.type = body.type;
    if (body.status !== undefined) updates.status = body.status;
    if (body.suiteId !== undefined) updates.suite_id = body.suiteId || null;
    if (body.requirementId !== undefined) updates.requirement_id = body.requirementId || null;
    if (body.wbsId !== undefined) updates.wbs_id = body.wbsId || null;
    if (body.ownerUserId !== undefined) updates.owner_user_id = body.ownerUserId || null;

    const [updated] = await projectDb("test_cases")
      .where("id", testId)
      .andWhere("project_id", guard.project.id)
      .update(updates)
      .returning("*");

    if (!updated) {
      return NextResponse.json({ error: "Test case not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, testCase: {
      id: updated.id,
      projectId: updated.project_id,
      suiteId: updated.suite_id,
      requirementId: updated.requirement_id,
      wbsId: updated.wbs_id,
      title: updated.title,
      steps: updated.steps,
      expectedResult: updated.expected_result,
      type: updated.type,
      status: updated.status,
      ownerUserId: updated.owner_user_id,
      createdAt: updated.created_at,
      updatedAt: updated.updated_at,
    } }, { status: 200 });
  } catch (error) {
    return serverError("testcases.PATCH", error);
  }
}

export async function DELETE(_req: Request, context: Params) {
  try {
    const { id, testId } = await context.params;
    const guard = await requireProjectCapability(id, "plan.edit");
    if (!guard.ok) return guard.response;

    const deleted = await projectDb("test_cases")
      .where("id", testId)
      .andWhere("project_id", guard.project.id)
      .delete();

    if (!deleted) {
      return NextResponse.json({ error: "Test case not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    return serverError("testcases.DELETE", error);
  }
}
