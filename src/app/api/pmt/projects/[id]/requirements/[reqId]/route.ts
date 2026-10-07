import { NextResponse } from "next/server";
import { projectDb } from "@/lib/db";
import { requireProjectCapability } from "@/lib/auth";
import { serverError } from "@/lib/route-helpers";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string; reqId: string }> };

export async function PATCH(req: Request, context: Params) {
  try {
    const { id, reqId } = await context.params;
    const guard = await requireProjectCapability(id, "plan.edit"); // Or qa.manage
    if (!guard.ok) return guard.response;

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (body.title !== undefined) updates.title = body.title;
    if (body.description !== undefined) updates.description = body.description || null;
    if (body.state !== undefined) updates.state = body.state;
    if (body.priority !== undefined) updates.priority = body.priority;
    if (body.type !== undefined) updates.type = body.type;
    if (body.folderId !== undefined) updates.folder_id = body.folderId || null;
    if (body.ownerUserId !== undefined) updates.owner_user_id = body.ownerUserId || null;

    const [updated] = await projectDb("requirements")
      .where("id", reqId)
      .andWhere("project_id", guard.project.id)
      .update(updates)
      .returning("*");

    if (!updated) {
      return NextResponse.json({ error: "Requirement not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, requirement: {
      id: updated.id,
      projectId: updated.project_id,
      folderId: updated.folder_id,
      title: updated.title,
      description: updated.description,
      state: updated.state,
      priority: updated.priority,
      type: updated.type,
      ownerUserId: updated.owner_user_id,
      createdAt: updated.created_at,
      updatedAt: updated.updated_at,
    } }, { status: 200 });
  } catch (error) {
    return serverError("requirements.PATCH", error);
  }
}

export async function DELETE(_req: Request, context: Params) {
  try {
    const { id, reqId } = await context.params;
    const guard = await requireProjectCapability(id, "plan.edit");
    if (!guard.ok) return guard.response;

    const deleted = await projectDb("requirements")
      .where("id", reqId)
      .andWhere("project_id", guard.project.id)
      .delete();

    if (!deleted) {
      return NextResponse.json({ error: "Requirement not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    return serverError("requirements.DELETE", error);
  }
}
