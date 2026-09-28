import { NextRequest, NextResponse } from "next/server";
import { projectDb } from "@/lib/db";
import { serverError } from "@/lib/route-helpers";
import { randomUUID } from "crypto";
import { requireProjectCapability } from "@/lib/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const guard = await requireProjectCapability(id, "plan.view");
    if (!guard.ok) return guard.response;
    const projectId = guard.project.id;

    const { searchParams } = new URL(req.url);
    const wbsItemId = searchParams.get("wbsItemId");

    let query = projectDb("wbs_client_comments")
      .where("project_id", projectId)
      .orderBy("created_at", "asc");

    if (wbsItemId) {
      query = query.where("wbs_item_id", wbsItemId);
    }

    const comments = await query;

    return NextResponse.json({ success: true, data: comments });
  } catch (error) {
    return serverError("wbsComments", error);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    // Commenting is how a client gives feedback, so plan.view is enough.
    const guard = await requireProjectCapability(id, "plan.view");
    if (!guard.ok) return guard.response;
    const projectId = guard.project.id;

    const body = await req.json();
    const { wbs_item_id, author_name, author_role = "client", comment_text } = body;

    if (!wbs_item_id || !comment_text) {
      return NextResponse.json(
        { success: false, error: "Missing required fields (wbs_item_id, comment_text)" },
        { status: 400 }
      );
    }

    const newComment = {
      id: randomUUID(),
      project_id: projectId,
      wbs_item_id,
      author_name: author_name || "Client Stakeholder",
      author_role,
      comment_text,
      status: "open",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await projectDb("wbs_client_comments").insert(newComment);

    return NextResponse.json({ success: true, data: newComment });
  } catch (error) {
    return serverError("wbsComments", error);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    // Closing off a comment is a delivery-side action, not a client one.
    const guard = await requireProjectCapability(id, "plan.edit");
    if (!guard.ok) return guard.response;

    const body = await req.json();
    const { commentId, status } = body;

    if (!commentId || !status) {
      return NextResponse.json({ success: false, error: "Missing commentId or status" }, { status: 400 });
    }

    const changed = await projectDb("wbs_client_comments")
      .where({ id: commentId, project_id: guard.project.id })
      .update({
        status,
        updated_at: new Date().toISOString(),
      });

    if (changed === 0) {
      return NextResponse.json(
        { success: false, error: "That comment does not belong to this project." },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, message: "Comment status updated" });
  } catch (error) {
    return serverError("wbsComments", error);
  }
}
