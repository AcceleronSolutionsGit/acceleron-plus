import { NextResponse } from "next/server";
import { projectDb } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { readJson } from "@/lib/route-helpers";

export const runtime = "nodejs";

/**
 * PATCH /api/admin/external-users/[id]/allocations/[memberId]
 * Updates allocation details for a team member.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  const auth = await requireRole(["admin", "pm"]);
  if (!auth.ok) return auth.response;

  const { memberId } = await params;
  if (!memberId) {
    return NextResponse.json({ error: "Member ID is required." }, { status: 400 });
  }

  const parsed = await readJson(req);
  if (!parsed.ok) return parsed.response;

  const body = parsed.body as {
    roleInProject?: string;
    memberType?: string;
    customDailyCostInr?: number | string;
    allocationPercent?: number | string;
    startDate?: string;
    endDate?: string;
    isActive?: boolean;
    notes?: string;
  };

  try {
    const existing = await projectDb("project_team_members").where("id", memberId).first();
    if (!existing) {
      return NextResponse.json({ error: "Allocation not found." }, { status: 404 });
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date(),
    };

    if (body.roleInProject !== undefined) updates.role_in_project = body.roleInProject.trim();
    if (body.memberType !== undefined) updates.member_type = body.memberType.trim();
    if (body.customDailyCostInr !== undefined) {
      const val = body.customDailyCostInr !== "" ? Number(body.customDailyCostInr) : null;
      updates.custom_daily_cost_inr = val;
      updates.daily_cost_inr = val;
    }
    if (body.allocationPercent !== undefined) {
      updates.allocation_percent = Math.min(100, Math.max(1, Number(body.allocationPercent)));
    }
    if (body.startDate !== undefined) updates.start_date = body.startDate || null;
    if (body.endDate !== undefined) updates.end_date = body.endDate || null;
    if (body.isActive !== undefined) updates.is_active = body.isActive;
    if (body.notes !== undefined) updates.notes = body.notes.trim() || null;

    await projectDb("project_team_members").where("id", memberId).update(updates);

    return NextResponse.json({
      success: true,
      message: "Allocation updated successfully.",
    });
  } catch (err) {
    console.error("[admin.external-users.allocations.PATCH]", err);
    return NextResponse.json({ error: "Could not update allocation." }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/external-users/[id]/allocations/[memberId]
 * Deactivates or removes a project allocation.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  const auth = await requireRole(["admin", "pm"]);
  if (!auth.ok) return auth.response;

  const { memberId } = await params;
  if (!memberId) {
    return NextResponse.json({ error: "Member ID is required." }, { status: 400 });
  }

  try {
    await projectDb("project_team_members").where("id", memberId).update({
      is_active: false,
      updated_at: new Date(),
    });

    return NextResponse.json({
      success: true,
      message: "Allocation removed successfully.",
    });
  } catch (err) {
    console.error("[admin.external-users.allocations.DELETE]", err);
    return NextResponse.json({ error: "Could not remove allocation." }, { status: 500 });
  }
}
