import { NextRequest, NextResponse } from "next/server";
import { projectDb } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(["admin"]);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const body = await req.json();

    const existing = await projectDb("employee_rate_bands").where("id", id).first();
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Rate band not found" },
        { status: 404 }
      );
    }

    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (body.band_name !== undefined) updates.band_name = String(body.band_name).trim();
    if (body.level_code !== undefined) updates.level_code = String(body.level_code).trim().toUpperCase();
    if (body.daily_cost_inr !== undefined) updates.daily_cost_inr = parseFloat(body.daily_cost_inr);
    if (body.daily_billable_rate_inr !== undefined) updates.daily_billable_rate_inr = parseFloat(body.daily_billable_rate_inr);
    if (body.currency !== undefined) updates.currency = String(body.currency).trim();
    if (body.is_active !== undefined) updates.is_active = Boolean(body.is_active);

    await projectDb("employee_rate_bands").where("id", id).update(updates);

    const updated = await projectDb("employee_rate_bands").where("id", id).first();

    return NextResponse.json({
      success: true,
      data: updated,
      message: "Rate band updated successfully",
    });
  } catch (error) {
    console.error("Error updating rate band:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update rate band" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(["admin"]);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;

    const existing = await projectDb("employee_rate_bands").where("id", id).first();
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Rate band not found" },
        { status: 404 }
      );
    }

    // Safely unlink foreign references (rate_band_id is nullable in both tables)
    await Promise.all([
      projectDb("solutioning_line_items").where("rate_band_id", id).update({ rate_band_id: null }).catch(() => {}),
      projectDb("project_team_members").where("rate_band_id", id).update({ rate_band_id: null }).catch(() => {}),
    ]);

    // Permanently delete the rate band
    await projectDb("employee_rate_bands").where("id", id).delete();

    return NextResponse.json({
      success: true,
      message: `Rate band ${existing.level_code} (${existing.band_name}) deleted permanently.`,
    });
  } catch (error: any) {
    console.error("Error deleting rate band:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to delete rate band" },
      { status: 500 }
    );
  }
}
