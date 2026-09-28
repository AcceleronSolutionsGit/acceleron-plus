import { NextRequest, NextResponse } from "next/server";
import { itsmDb } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export async function GET() {
  const auth = await requireRole(["admin"]);
  if (!auth.ok) return auth.response;

  try {
    const companies = await itsmDb("companies")
      .select("*")
      .orderBy("name", "asc");

    return NextResponse.json({
      success: true,
      data: companies,
    });
  } catch (error) {
    console.error("Error fetching companies:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch companies" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(["admin"]);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const { name, domain, is_active = true } = body;

    if (!name) {
      return NextResponse.json(
        { success: false, error: "Company name is required" },
        { status: 400 }
      );
    }

    const [created] = await itsmDb("companies")
      .insert({
        tenant_id: "8434da2c-a300-433f-83fd-57249690ad09",
        name: String(name).trim(),
        domain: domain ? String(domain).trim() : null,
        is_active: Boolean(is_active),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .returning("*");

    return NextResponse.json({
      success: true,
      data: created,
      message: "Company created successfully",
    }, { status: 201 });
  } catch (error) {
    console.error("Error creating company:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create company" },
      { status: 500 }
    );
  }
}
