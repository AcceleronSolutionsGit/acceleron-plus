import { NextRequest, NextResponse } from "next/server";
import { projectDb } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * GET /api/admin/masters/project-categories
 * Returns all project categories with nested types and project usage stats.
 */
export async function GET(req: NextRequest) {
  const auth = await requireRole(["admin", "pm"]);
  if (!auth.ok) return auth.response;

  try {
    const [categories, types, projectCounts] = await Promise.all([
      projectDb("project_categories")
        .select("*")
        .orderBy("display_order", "asc")
        .orderBy("name", "asc"),
      projectDb("project_types")
        .select("*")
        .orderBy("display_order", "asc")
        .orderBy("name", "asc"),
      projectDb("projects")
        .whereNull("scrapped_at")
        .select("category")
        .count("* as count")
        .groupBy("category")
        .catch(() => [] as any[]),
    ]);

    const countMap = new Map<string, number>();
    for (const p of projectCounts) {
      if (p.category) {
        countMap.set(String(p.category).trim().toUpperCase(), parseInt(String(p.count), 10) || 0);
      }
    }

    // Group types by category_id or category_code
    const typesByCatId = new Map<string, any[]>();
    const typesByCatCode = new Map<string, any[]>();

    for (const t of types) {
      const typeObj = {
        id: t.id,
        categoryId: t.category_id,
        categoryCode: t.category_code,
        name: t.name,
        code: t.code,
        description: t.description,
        displayOrder: t.display_order ?? 0,
        isActive: t.is_active !== false,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
      };

      if (t.category_id) {
        const list = typesByCatId.get(t.category_id) || [];
        list.push(typeObj);
        typesByCatId.set(t.category_id, list);
      }
      if (t.category_code) {
        const codeKey = t.category_code.toUpperCase();
        const list = typesByCatCode.get(codeKey) || [];
        list.push(typeObj);
        typesByCatCode.set(codeKey, list);
      }
    }

    const result = categories.map((c) => {
      const codeKey = (c.code || "").toUpperCase();
      const directTypes = typesByCatId.get(c.id) || typesByCatCode.get(codeKey) || [];
      return {
        id: c.id,
        code: c.code,
        name: c.name,
        label: c.label || c.name,
        description: c.description,
        displayOrder: c.display_order ?? 0,
        isActive: c.is_active !== false,
        projectCount: countMap.get(codeKey) || 0,
        types: directTypes,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
      };
    });

    return NextResponse.json({
      success: true,
      categories: result,
      totalCategories: categories.length,
      totalTypes: types.length,
    });
  } catch (err: any) {
    console.error("[admin.masters.project-categories.GET]", err);
    return NextResponse.json({ error: "Failed to fetch project categories: " + err.message }, { status: 500 });
  }
}

/**
 * POST /api/admin/masters/project-categories
 * Creates a new project category.
 */
export async function POST(req: NextRequest) {
  const auth = await requireRole(["admin"]);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const name = String(body.name || "").trim();
    if (!name) {
      return NextResponse.json({ error: "Category name is required." }, { status: 400 });
    }

    // Generate or clean code
    let code = String(body.code || name)
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "");

    if (!code) code = "CAT_" + Date.now();

    // Check duplicate code
    const existing = await projectDb("project_categories").where("code", code).first();
    if (existing) {
      return NextResponse.json({ error: `Category with code '${code}' already exists.` }, { status: 400 });
    }

    const label = body.label ? String(body.label).trim() : name;
    const description = body.description ? String(body.description).trim() : null;
    const displayOrder = Number.isFinite(Number(body.displayOrder)) ? Number(body.displayOrder) : 0;
    const isActive = body.isActive !== undefined ? Boolean(body.isActive) : true;

    const [created] = await projectDb("project_categories")
      .insert({
        tenant_id: "acceleron",
        code,
        name,
        label,
        description,
        display_order: displayOrder,
        is_active: isActive,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning("*");

    return NextResponse.json({
      success: true,
      category: {
        id: created.id,
        code: created.code,
        name: created.name,
        label: created.label,
        description: created.description,
        displayOrder: created.display_order,
        isActive: created.is_active,
        projectCount: 0,
        types: [],
        createdAt: created.created_at,
        updatedAt: created.updated_at,
      },
    });
  } catch (err: any) {
    console.error("[admin.masters.project-categories.POST]", err);
    return NextResponse.json({ error: "Failed to create category: " + err.message }, { status: 500 });
  }
}
