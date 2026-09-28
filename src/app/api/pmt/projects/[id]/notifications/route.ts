import { NextRequest, NextResponse } from "next/server";
import { projectDb } from "@/lib/db";
import { serverError } from "@/lib/route-helpers";
import { randomUUID } from "crypto";
import { requireProjectCapability } from "@/lib/auth";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const guard = await requireProjectCapability(id, "project.view");
    if (!guard.ok) return guard.response;
    const project = guard.project;

    const notifications = await projectDb("project_notifications")
      .where("project_id", project.id)
      .orderBy("created_at", "desc");

    return NextResponse.json({ success: true, data: notifications });
  } catch (error) {
    return serverError("projectNotifications", error);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const guard = await requireProjectCapability(id, "project.edit");
    if (!guard.ok) return guard.response;
    const project = guard.project;

    const body = await req.json();
    const { title, message, event_type = "manual_update", recipient_user_id } = body;

    if (!title || !message) {
      return NextResponse.json(
        { success: false, error: "Title and message are required" },
        { status: 400 }
      );
    }

    const newNotification = {
      id: randomUUID(),
      tenant_id: "acceleron",
      recipient_user_id: recipient_user_id || "10000000-0000-0000-0000-000000000001",
      project_id: project.id,
      project_code: project.code,
      title,
      message,
      event_type,
      action_url: `/pmt/${project.code}`,
      is_read: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await projectDb("project_notifications").insert(newNotification);

    return NextResponse.json({ success: true, data: newNotification });
  } catch (error) {
    return serverError("projectNotifications", error);
  }
}
