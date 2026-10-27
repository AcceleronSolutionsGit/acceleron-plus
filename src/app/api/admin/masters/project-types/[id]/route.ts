import { NextRequest, NextResponse } from "next/server";
import { projectDb } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * PATCH /api/admin/masters/project-types/[id]
 * Updates a project type.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(["admin"]);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Project Type ID is required." }, { status: 400 });
  }

  try {
    const existing = await projectDb("project_types").where("id", id).first();
    if (!existing) {
      return NextResponse.json({ error: "Project type not found." }, { status: 404 });
    }

    const body = await req.json();
    const updates: Record<string, any> = {
      updated_at: new Date(),
    };

    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) return NextResponse.json({ error: "Project type name cannot be empty." }, { status: 400 });
      updates.name = name;
    }

    if (body.code !== undefined) {
      updates.code = body.code ? String(body.code).trim().toUpperCase().replace(/[^A-Z0-9_]+/g, "_") : null;
    }

    if (body.categoryId !== undefined) {
      const catId = body.categoryId ? String(body.categoryId).trim() : null;
      updates.category_id = catId;
      if (catId) {
        const cat = await projectDb("project_categories").where("id", catId).first();
        if (cat) updates.category_code = cat.code;
      } else {
        updates.category_code = null;
      }
    }

    if (body.description !== undefined) {
      updates.description = body.description ? String(body.description).trim() : null;
    }

    if (body.displayOrder !== undefined) {
      updates.display_order = Number.isFinite(Number(body.displayOrder)) ? Number(body.displayOrder) : 0;
    }

    if (body.isActive !== undefined) {
      updates.is_active = Boolean(body.isActive);
    }

    await projectDb("project_types").where("id", id).update(updates);
    const updated = await projectDb("project_types").where("id", id).first();

    return NextResponse.json({
      success: true,
      projectType: {
        id: updated.id,
        categoryId: updated.category_id,
        categoryCode: updated.category_code,
        name: updated.name,
        code: updated.code,
        description: updated.description,
        displayOrder: updated.display_order,
        isActive: updated.is_active,
        updatedAt: updated.updated_at,
      },
    });
  } catch (err: any) {
    console.error("[admin.masters.project-types.PATCH]", err);
    return NextResponse.json({ error: "Failed to update project type: " + err.message }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/masters/project-types/[id]
 * Deletes a project type if not used, or deactivates it.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(["admin"]);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Project Type ID is required." }, { status: 400 });
  }

  try {
    const existing = await projectDb("project_types").where("id", id).first();
    if (!existing) {
      return NextResponse.json({ error: "Project type not found." }, { status: 404 });
    }

    // Check if any project is using this project_type
    const projectUsage = (await projectDb("projects")
      .whereRaw("LOWER(TRIM(project_type)) = ?", [existing.name.toLowerCase().trim()])
      .whereNull("scrapped_at")
      .count("* as count")
      .first()) as any;

    const inUseCount = parseInt(projectUsage?.count || "0", 10);
    if (inUseCount > 0) {
      await projectDb("project_types").where("id", id).update({
        is_active: false,
        updated_at: new Date(),
      });
      return NextResponse.json({
        success: true,
        deactivated: true,
        message: `Project type is referenced by ${inUseCount} projects. It has been deactivated instead of permanently deleted.`,
      });
    }

    await projectDb("project_types").where("id", id).delete();

    return NextResponse.json({
      success: true,
      message: "Project type deleted successfully.",
    });
  } catch (err: any) {
    console.error("[admin.masters.project-types.DELETE]", err);
    return NextResponse.json({ error: "Failed to delete project type: " + err.message }, { status: 500 });
  }
}
