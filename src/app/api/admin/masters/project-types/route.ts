import { NextRequest, NextResponse } from "next/server";
import { projectDb } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * POST /api/admin/masters/project-types
 * Creates a new project type under a category.
 */
export async function POST(req: NextRequest) {
  const auth = await requireRole(["admin"]);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const name = String(body.name || "").trim();
    if (!name) {
      return NextResponse.json({ error: "Project type name is required." }, { status: 400 });
    }

    const categoryId = body.categoryId ? String(body.categoryId).trim() : null;
    let categoryCode = body.categoryCode ? String(body.categoryCode).trim().toUpperCase() : null;

    if (categoryId) {
      const parentCat = await projectDb("project_categories").where("id", categoryId).first();
      if (parentCat) {
        categoryCode = parentCat.code;
      }
    }

    let code = body.code
      ? String(body.code).trim().toUpperCase().replace(/[^A-Z0-9_]+/g, "_")
      : name.toUpperCase().replace(/[^A-Z0-9_]+/g, "_");

    const description = body.description ? String(body.description).trim() : null;
    const displayOrder = Number.isFinite(Number(body.displayOrder)) ? Number(body.displayOrder) : 0;
    const isActive = body.isActive !== undefined ? Boolean(body.isActive) : true;

    const [created] = await projectDb("project_types")
      .insert({
        tenant_id: "acceleron",
        category_id: categoryId,
        category_code: categoryCode,
        name,
        code,
        description,
        display_order: displayOrder,
        is_active: isActive,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning("*");

    return NextResponse.json({
      success: true,
      projectType: {
        id: created.id,
        categoryId: created.category_id,
        categoryCode: created.category_code,
        name: created.name,
        code: created.code,
        description: created.description,
        displayOrder: created.display_order,
        isActive: created.is_active,
        createdAt: created.created_at,
        updatedAt: created.updated_at,
      },
    });
  } catch (err: any) {
    console.error("[admin.masters.project-types.POST]", err);
    return NextResponse.json({ error: "Failed to create project type: " + err.message }, { status: 500 });
  }
}
