import { NextRequest, NextResponse } from "next/server";
import { projectDb } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export async function GET() {
  const auth = await requireRole(["admin"]);
  if (!auth.ok) return auth.response;

  try {
    const rateBands = await projectDb("employee_rate_bands")
      .select("*")
      .orderBy("level_code", "asc");

    return NextResponse.json({
      success: true,
      data: rateBands,
    });
  } catch (error) {
    console.error("Error fetching rate bands:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch rate bands" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(["admin"]);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const {
      band_name,
      level_code,
      daily_cost_inr,
      daily_billable_rate_inr,
      currency = "INR",
      is_active = true,
      tenant_id = "acceleron",
    } = body;

    if (!band_name || !level_code || daily_cost_inr === undefined || daily_billable_rate_inr === undefined) {
      return NextResponse.json(
        { success: false, error: "Band name, level code, daily cost, and daily billable rate are required" },
        { status: 400 }
      );
    }

    const [created] = await projectDb("employee_rate_bands")
      .insert({
        tenant_id,
        band_name: String(band_name).trim(),
        level_code: String(level_code).trim().toUpperCase(),
        daily_cost_inr: parseFloat(daily_cost_inr),
        daily_billable_rate_inr: parseFloat(daily_billable_rate_inr),
        currency,
        is_active: Boolean(is_active),
        effective_from: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .returning("*");

    return NextResponse.json({
      success: true,
      data: created,
      message: "Rate band created successfully",
    }, { status: 201 });
  } catch (error) {
    console.error("Error creating rate band:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create rate band" },
      { status: 500 }
    );
  }
}
