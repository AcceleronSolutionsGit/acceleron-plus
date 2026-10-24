import { NextRequest, NextResponse } from "next/server";
import { projectDb } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * PATCH /api/admin/masters/project-roles/[id]
 * Update a custom project role.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(["admin"]);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Role ID is required." }, { status: 400 });
  }

  try {
    const existing = await projectDb("project_custom_roles").where("id", id).first();
    if (!existing) {
      return NextResponse.json({ error: "Role not found." }, { status: 404 });
    }

    const body = await req.json();
    const updates: Record<string, unknown> = {
      updated_at: new Date(),
    };

    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) return NextResponse.json({ error: "Role name cannot be empty." }, { status: 400 });
      updates.name = name;
      updates.code = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "role";
    }

    if (body.description !== undefined) {
      updates.description = body.description ? String(body.description).trim() : null;
    }

    if (body.baseRole !== undefined) {
      updates.base_role = ["Developer", "Team Lead", "PM"].includes(body.baseRole)
        ? body.baseRole
        : "Developer";
    }

    if (body.projectId !== undefined) {
      updates.project_id = body.projectId ? String(body.projectId).trim() : null;
    }

    if (body.isActive !== undefined) {
      updates.is_active = Boolean(body.isActive);
    }

    await projectDb("project_custom_roles").where("id", id).update(updates);

    return NextResponse.json({
      success: true,
      message: "Custom project role updated successfully.",
    });
  } catch (err) {
    console.error("[admin.masters.project-roles.PATCH]", err);
    return NextResponse.json({ error: "Failed to update custom project role." }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/masters/project-roles/[id]
 * Delete a custom project role.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(["admin"]);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Role ID is required." }, { status: 400 });
  }

  try {
    const existing = await projectDb("project_custom_roles").where("id", id).first();
    if (!existing) {
      return NextResponse.json({ error: "Role not found." }, { status: 404 });
    }

    // Check if role is currently assigned to any team member
    const inUse = await projectDb("project_team_members")
      .where("role_in_project", existing.name)
      .where("is_active", true)
      .first("id", "user_name", "project_id");

    if (inUse) {
      // Instead of hard deleting, deactivate
      await projectDb("project_custom_roles").where("id", id).update({
        is_active: false,
        updated_at: new Date(),
      });
      return NextResponse.json({
        success: true,
        message: `Role "${existing.name}" is assigned to active team members, so it has been deactivated instead of deleted.`,
      });
    }

    await projectDb("project_custom_roles").where("id", id).delete();

    return NextResponse.json({
      success: true,
      message: `Role "${existing.name}" deleted successfully.`,
    });
  } catch (err) {
    console.error("[admin.masters.project-roles.DELETE]", err);
    return NextResponse.json({ error: "Failed to delete custom project role." }, { status: 500 });
  }
}
