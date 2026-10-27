import { NextResponse } from "next/server";
import { projectDb } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PROJECT_TAXONOMY } from "@/lib/project-types";

export const runtime = "nodejs";

/**
 * GET /api/pmt/taxonomy
 * Returns active categories and project types for project editing/creation and filters.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [categories, types] = await Promise.all([
      projectDb("project_categories")
        .where("is_active", true)
        .select("id", "code", "name", "label", "description", "display_order")
        .orderBy("display_order", "asc")
        .orderBy("name", "asc")
        .catch(() => [] as any[]),
      projectDb("project_types")
        .where("is_active", true)
        .select("id", "category_id", "category_code", "name", "code", "description", "display_order")
        .orderBy("display_order", "asc")
        .orderBy("name", "asc")
        .catch(() => [] as any[]),
    ]);

    if (categories.length === 0) {
      // Fallback to static PROJECT_TAXONOMY if tables not seeded yet
      return NextResponse.json({
        success: true,
        categories: PROJECT_TAXONOMY.map((item) => ({
          code: item.category,
          name: item.label || item.category,
          label: item.label || item.category,
          types: item.types.map((t) => ({ name: t })),
        })),
      });
    }

    const typesByCatId = new Map<string, any[]>();
    const typesByCatCode = new Map<string, any[]>();

    for (const t of types) {
      const typeItem = {
        id: t.id,
        name: t.name,
        code: t.code,
        description: t.description,
      };

      if (t.category_id) {
        const list = typesByCatId.get(t.category_id) || [];
        list.push(typeItem);
        typesByCatId.set(t.category_id, list);
      }
      if (t.category_code) {
        const codeKey = t.category_code.toUpperCase();
        const list = typesByCatCode.get(codeKey) || [];
        list.push(typeItem);
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
        types: directTypes,
      };
    });

    return NextResponse.json({
      success: true,
      categories: result,
    });
  } catch (err: any) {
    console.error("[api.pmt.taxonomy]", err);
    return NextResponse.json({
      success: true,
      categories: PROJECT_TAXONOMY.map((item) => ({
        code: item.category,
        name: item.label || item.category,
        label: item.label || item.category,
        types: item.types.map((t) => ({ name: t })),
      })),
    });
  }
}
