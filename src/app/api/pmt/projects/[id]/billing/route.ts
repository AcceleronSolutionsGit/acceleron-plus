import { NextResponse } from "next/server";
import { projectDb } from "@/lib/db";
import { requireProjectCapability } from "@/lib/auth";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const guard = await requireProjectCapability(id, "invoice.manage");
    if (!guard.ok) return guard.response;

    const body = await req.json();
    
    // Simulate creating a billing notification in the database
    const [notification] = await projectDb("billing_notifications")
      .insert({
        project_id: guard.project.id,
        billing_milestone_id: "00000000-0000-0000-0000-000000000000", // placeholder
        notification_type: "in_app",
        recipient_type: "finance",
        message: body.message || "Billing milestone achieved.",
      })
      .returning("*");

    return NextResponse.json({ success: true, notification }, { status: 200 });
  } catch (error) {
    console.error("Failed to dispatch billing notification:", error);
    return NextResponse.json({ error: "Failed to dispatch billing" }, { status: 500 });
  }
}
