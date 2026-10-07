import { NextResponse } from "next/server";
import { projectDb } from "@/lib/db";
import { requireSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function PATCH(req: Request, context: { params: Promise<{ id: string, sprintId: string }> }) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;
    if (auth.session.role !== "admin" && auth.session.role !== "pm") {
      return NextResponse.json({ error: "Only admins and PMs can edit sprints" }, { status: 403 });
    }

    const { id: projectId, sprintId } = await context.params;
    const body = await req.json().catch(() => null);

    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (body.name !== undefined) updates.name = body.name;
    if (body.goal !== undefined) updates.goal = body.goal || null;
    if (body.start_date !== undefined) updates.start_date = body.start_date || null;
    if (body.end_date !== undefined) updates.end_date = body.end_date || null;
    if (body.status !== undefined) updates.status = body.status;

    const [sprint] = await projectDb("sprints")
      .where("id", sprintId)
      .andWhere("project_id", projectId)
      .update(updates)
      .returning("*");

    if (!sprint) {
      return NextResponse.json({ error: "Sprint not found" }, { status: 404 });
    }

    return NextResponse.json({ sprint }, { status: 200 });
  } catch (error) {
    console.error("Failed to update sprint:", error);
    return NextResponse.json({ error: "Failed to update sprint" }, { status: 500 });
  }
}

export async function DELETE(req: Request, context: { params: Promise<{ id: string, sprintId: string }> }) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;
    if (auth.session.role !== "admin" && auth.session.role !== "pm") {
      return NextResponse.json({ error: "Only admins and PMs can delete sprints" }, { status: 403 });
    }

    const { id: projectId, sprintId } = await context.params;

    // Remove sprint from WBS items before deleting sprint
    await projectDb("wbs_items")
      .where("sprint_id", sprintId)
      .update({ sprint_id: null });

    const deleted = await projectDb("sprints")
      .where("id", sprintId)
      .andWhere("project_id", projectId)
      .delete();

    if (!deleted) {
      return NextResponse.json({ error: "Sprint not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("Failed to delete sprint:", error);
    return NextResponse.json({ error: "Failed to delete sprint" }, { status: 500 });
  }
}
