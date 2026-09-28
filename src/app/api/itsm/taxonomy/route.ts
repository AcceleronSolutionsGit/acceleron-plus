import { NextResponse } from "next/server";
import { itsmDb } from "@/lib/db";

export async function GET() {
  try {
    // Fetch all taxonomy categories, sub_categories, and items
    const categories = await itsmDb("taxonomy_categories").where({ is_active: true });
    const subCategories = await itsmDb("taxonomy_sub_categories").where({ is_active: true });
    const items = await itsmDb("taxonomy_items").where({ is_active: true });

    // Build the nested tree structure
    const tree = categories.map((cat) => {
      return {
        ...cat,
        subCategories: subCategories
          .filter((sub) => sub.category_id === cat.id)
          .map((sub) => ({
            ...sub,
            items: items.filter((item) => item.sub_category_id === sub.id),
          })),
      };
    });

    return NextResponse.json(tree);
  } catch (error) {
    console.error("Failed to fetch taxonomy:", error);
    return NextResponse.json({ error: "Failed to fetch taxonomy" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { type, name, parentId, tenantId = "tenant-1" } = body;

    // We'll use a simple insert depending on the type specified (category, subCategory, item)
    if (type === "category") {
      const [newCat] = await itsmDb("taxonomy_categories")
        .insert({
          tenant_id: tenantId,
          name,
          is_active: true,
          // impact_area_id, domain etc. can be added later
        })
        .returning("*");
      return NextResponse.json(newCat, { status: 201 });
    } else if (type === "subCategory") {
      const [newSub] = await itsmDb("taxonomy_sub_categories")
        .insert({
          category_id: parentId,
          name,
          is_active: true,
        })
        .returning("*");
      return NextResponse.json(newSub, { status: 201 });
    } else if (type === "item") {
      const [newItem] = await itsmDb("taxonomy_items")
        .insert({
          sub_category_id: parentId,
          name,
          is_active: true,
        })
        .returning("*");
      return NextResponse.json(newItem, { status: 201 });
    }

    return NextResponse.json({ error: "Invalid taxonomy type" }, { status: 400 });
  } catch (error) {
    console.error("Failed to add taxonomy entry:", error);
    return NextResponse.json({ error: "Failed to add taxonomy entry" }, { status: 500 });
  }
}
