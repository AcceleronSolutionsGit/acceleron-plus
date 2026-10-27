import { NextRequest, NextResponse } from "next/server";
import { projectDb } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * PATCH /api/admin/masters/project-categories/[id]
 * Updates a project category.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(["admin"]);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Category ID is required." }, { status: 400 });
  }

  try {
    const existing = await projectDb("project_categories").where("id", id).first();
    if (!existing) {
      return NextResponse.json({ error: "Category not found." }, { status: 404 });
    }

    const body = await req.json();
    const updates: Record<string, any> = {
      updated_at: new Date(),
    };

    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) return NextResponse.json({ error: "Category name cannot be empty." }, { status: 400 });
      updates.name = name;
    }

    if (body.code !== undefined) {
      const code = String(body.code)
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9_]+/g, "_")
        .replace(/^_+|_+$/g, "");
      if (!code) return NextResponse.json({ error: "Category code cannot be empty." }, { status: 400 });

      if (code !== existing.code) {
        const dup = await projectDb("project_categories").where("code", code).whereNot("id", id).first();
        if (dup) {
          return NextResponse.json({ error: `Category code '${code}' is already in use.` }, { status: 400 });
        }
        updates.code = code;

        // Also update linked project_types category_code
        await projectDb("project_types")
          .where("category_id", id)
          .update({ category_code: code, updated_at: new Date() });
      }
    }

    if (body.label !== undefined) {
      updates.label = body.label ? String(body.label).trim() : null;
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

    await projectDb("project_categories").where("id", id).update(updates);
    const updated = await projectDb("project_categories").where("id", id).first();

    return NextResponse.json({
      success: true,
      category: {
        id: updated.id,
        code: updated.code,
        name: updated.name,
        label: updated.label || updated.name,
        description: updated.description,
        displayOrder: updated.display_order,
        isActive: updated.is_active,
        updatedAt: updated.updated_at,
      },
    });
  } catch (err: any) {
    console.error("[admin.masters.project-categories.PATCH]", err);
    return NextResponse.json({ error: "Failed to update category: " + err.message }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/masters/project-categories/[id]
 * Deletes a project category if not referenced by active projects, or deactivates it.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(["admin"]);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Category ID is required." }, { status: 400 });
  }

  try {
    const existing = await projectDb("project_categories").where("id", id).first();
    if (!existing) {
      return NextResponse.json({ error: "Category not found." }, { status: 404 });
    }

    // Check if any project is using this category
    const projectUsage = (await projectDb("projects")
      .whereRaw("UPPER(TRIM(category)) = ?", [existing.code.toUpperCase()])
      .whereNull("scrapped_at")
      .count("* as count")
      .first()) as any;

    const inUseCount = parseInt(projectUsage?.count || "0", 10);
    if (inUseCount > 0) {
      // Deactivate instead of deleting
      await projectDb("project_categories").where("id", id).update({
        is_active: false,
        updated_at: new Date(),
      });
      return NextResponse.json({
        success: true,
        deactivated: true,
        message: `Category is referenced by ${inUseCount} projects. It has been deactivated instead of permanently deleted.`,
      });
    }

    // Delete child project_types
    await projectDb("project_types").where("category_id", id).delete();
    // Delete category
    await projectDb("project_categories").where("id", id).delete();

    return NextResponse.json({
      success: true,
      message: "Category and its associated project types deleted successfully.",
    });
  } catch (err: any) {
    console.error("[admin.masters.project-categories.DELETE]", err);
    return NextResponse.json({ error: "Failed to delete category: " + err.message }, { status: 500 });
  }
}
