import { NextResponse } from "next/server";
import { getReleases } from "@/lib/api";
import { itsmDb } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const releases = await getReleases();
    return NextResponse.json({ releases }, { status: 200 });
  } catch (error) {
    console.error("Failed to fetch releases:", error);
    return NextResponse.json({ error: "Failed to fetch releases" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    const releaseNumber = `REL-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;

    const [newRelease] = await itsmDb("releases")
      .insert({
        tenant_id: body.tenant_id || body.tenantId || "8434da2c-a300-433f-83fd-57249690ad09",
        release_number: releaseNumber,
        subject: body.subject,
        description: body.description || null,
        release_type: body.releaseType || body.release_type || "minor",
        status: body.status || "planned",
        priority: body.priority || "medium",
        planned_start: body.plannedStart || body.planned_start || null,
        planned_end: body.plannedEnd || body.planned_end || null,
        agent_user_id: body.agentUserId || body.agent_user_id || null,
      })
      .returning("*");

    return NextResponse.json({ release: newRelease }, { status: 201 });
  } catch (error) {
    console.error("Failed to create release:", error);
    return NextResponse.json({ error: "Failed to create release" }, { status: 500 });
  }
}
