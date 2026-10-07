import { NextResponse } from "next/server";
import { projectDb } from "@/lib/db";
import { requireSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const { id: projectId } = await context.params;

    const sprints = await projectDb("sprints")
      .where("project_id", projectId)
      .orderBy("start_date", "asc")
      .orderBy("created_at", "asc");

    return NextResponse.json({ sprints });
  } catch (error) {
    console.error("Failed to fetch sprints:", error);
    return NextResponse.json({ error: "Failed to fetch sprints" }, { status: 500 });
  }
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;
    if (auth.session.role !== "admin" && auth.session.role !== "pm") {
      return NextResponse.json({ error: "Only admins and PMs can create sprints" }, { status: 403 });
    }

    const { id: projectId } = await context.params;
    const body = await req.json().catch(() => null);

    if (!body || !body.name) {
      return NextResponse.json({ error: "Sprint name is required" }, { status: 400 });
    }

    const [sprint] = await projectDb("sprints")
      .insert({
        project_id: projectId,
        name: body.name,
        goal: body.goal || null,
        start_date: body.start_date || null,
        end_date: body.end_date || null,
        status: body.status || "planned",
      })
      .returning("*");

    return NextResponse.json({ sprint }, { status: 201 });
  } catch (error) {
    console.error("Failed to create sprint:", error);
    return NextResponse.json({ error: "Failed to create sprint" }, { status: 500 });
  }
}
