import { NextRequest, NextResponse } from "next/server";
import { itsmDb } from "@/lib/db";
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

    const existing = await itsmDb("companies").where("id", id).first();
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Company not found" },
        { status: 404 }
      );
    }

    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (body.name !== undefined) updates.name = String(body.name).trim();
    if (body.domain !== undefined) updates.domain = body.domain ? String(body.domain).trim() : null;
    if (body.is_active !== undefined) updates.is_active = Boolean(body.is_active);

    await itsmDb("companies").where("id", id).update(updates);

    const updated = await itsmDb("companies").where("id", id).first();

    return NextResponse.json({
      success: true,
      data: updated,
      message: "Company updated successfully",
    });
  } catch (error) {
    console.error("Error updating company:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update company" },
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

    const existing = await itsmDb("companies").where("id", id).first();
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Company not found" },
        { status: 404 }
      );
    }

    // Check if tickets or users reference this company in itsmDb
    let ticketRef = null;
    try {
      ticketRef = await itsmDb("tickets").where("company_id", id).first();
    } catch {
      // column may not exist or differ
    }

    if (ticketRef) {
      await itsmDb("companies").where("id", id).update({
        is_active: false,
        updated_at: new Date().toISOString(),
      });
      return NextResponse.json({
        success: true,
        message: `Company "${existing.name}" is referenced by existing tickets and has been deactivated.`,
        deactivated: true,
      });
    }

    await itsmDb("companies").where("id", id).delete();

    return NextResponse.json({
      success: true,
      message: `Company "${existing.name}" deleted successfully`,
    });
  } catch (error: any) {
    console.error("Error deleting company:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to delete company" },
      { status: 500 }
    );
  }
}
