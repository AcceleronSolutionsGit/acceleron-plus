import { NextResponse } from "next/server";
import { identityDb, projectDb } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { readJson } from "@/lib/route-helpers";

export const runtime = "nodejs";

/**
 * POST /api/admin/external-users/[id]/allocations
 * Allocates a non-Darwinbox user to a project.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(["admin", "pm"]);
  if (!auth.ok) return auth.response;

  const { id: userId } = await params;
  if (!userId) {
    return NextResponse.json({ error: "User ID is required." }, { status: 400 });
  }

  const parsed = await readJson(req);
  if (!parsed.ok) return parsed.response;

  const body = parsed.body as {
    projectId?: string;
    roleInProject?: string;
    memberType?: string;
    customDailyCostInr?: number | string;
    allocationPercent?: number | string;
    startDate?: string;
    endDate?: string;
    notes?: string;
  };

  const projectId = body.projectId?.trim();
  const roleInProject = body.roleInProject?.trim() || "Consultant";
  const memberType = body.memberType?.trim() || "consultant";
  const customDailyCostInr =
    body.customDailyCostInr !== undefined && body.customDailyCostInr !== ""
      ? Number(body.customDailyCostInr)
      : null;
  const allocationPercent =
    body.allocationPercent !== undefined && body.allocationPercent !== ""
      ? Math.min(100, Math.max(1, Number(body.allocationPercent)))
      : 100;
  const startDate = body.startDate || new Date().toISOString().split("T")[0];
  const endDate = body.endDate || null;
  const notes = body.notes?.trim() || null;

  if (!projectId) {
    return NextResponse.json({ error: "Project is required." }, { status: 400 });
  }

  try {
    // Verify user exists
    const user = await identityDb("users").where("id", userId).first();
    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    // Verify project exists
    const project = await projectDb("projects").where("id", projectId).first();
    if (!project) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    // Check if already actively allocated to this project
    const existing = await projectDb("project_team_members")
      .where("project_id", projectId)
      .where("user_id", userId)
      .where("is_active", true)
      .first();

    if (existing) {
      return NextResponse.json(
        { error: `${user.full_name} is already allocated to project ${project.name} (${project.code}).` },
        { status: 409 }
      );
    }

    const [allocation] = await projectDb("project_team_members")
      .insert({
        project_id: projectId,
        user_id: userId,
        user_name: user.full_name,
        role_in_project: roleInProject,
        member_type: memberType,
        custom_daily_cost_inr: customDailyCostInr,
        daily_cost_inr: customDailyCostInr,
        allocation_percent: allocationPercent,
        start_date: startDate,
        end_date: endDate,
        notes: notes,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning("*");

    return NextResponse.json({
      success: true,
      allocation,
      message: `${user.full_name} has been allocated to ${project.name}.`,
    });
  } catch (err) {
    console.error("[admin.external-users.allocations.POST]", err);
    return NextResponse.json({ error: "Could not create project allocation." }, { status: 500 });
  }
}
