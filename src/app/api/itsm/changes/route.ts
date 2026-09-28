import { NextResponse } from "next/server";
import { getChangeRequests } from "@/lib/api";
import { itsmDb } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const changes = await getChangeRequests();
    return NextResponse.json({ changes }, { status: 200 });
  } catch (error) {
    console.error("Failed to fetch changes:", error);
    return NextResponse.json({ error: "Failed to fetch changes" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    const changeNumber = `CHG-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;

    const [newChange] = await itsmDb("change_requests")
      .insert({
        tenant_id: body.tenant_id || body.tenantId || "8434da2c-a300-433f-83fd-57249690ad09",
        change_number: changeNumber,
        subject: body.subject,
        description: body.description || null,
        change_type: body.changeType || body.change_type || "standard",
        status: body.status || "draft",
        priority: body.priority || "medium",
        impact: body.impact || "medium",
        risk: body.risk || "low",
        project_code: body.projectCode || body.project_code || null,
        agent_user_id: body.agentUserId || body.agent_user_id || null,
        approval_required: body.approvalRequired ?? true,
        release_required: body.releaseRequired ?? false,
      })
      .returning("*");

    return NextResponse.json({ change: newChange }, { status: 201 });
  } catch (error) {
    console.error("Failed to create change:", error);
    return NextResponse.json({ error: "Failed to create change" }, { status: 500 });
  }
}
