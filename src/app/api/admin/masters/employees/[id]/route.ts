import { NextRequest, NextResponse } from "next/server";
import { identityDb } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(["admin"]);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const employee = await identityDb("employee_master").where("employee_id", id).first();

    if (!employee) {
      return NextResponse.json(
        { success: false, error: "Employee not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: employee });
  } catch (error) {
    console.error("Error fetching employee:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch employee" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(["admin"]);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const body = await req.json();

    const existing = await identityDb("employee_master").where("employee_id", id).first();
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Employee not found" },
        { status: 404 }
      );
    }

    const allowedFields = [
      "full_name",
      "company_email_id",
      "job_level",
      "office_location",
      "group_company_code",
      "date_of_joining",
      "employee_type",
      "direct_manager_employee_id",
      "designation",
      "internal_department",
    ];

    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field] ? String(body[field]).trim() : null;
      }
    }

    await identityDb("employee_master")
      .where("employee_id", id)
      .update(updates);

    const updated = await identityDb("employee_master as e")
      .leftJoin("employee_master as m", "e.direct_manager_employee_id", "m.employee_id")
      .select("e.*", "m.full_name as direct_manager_name")
      .where("e.employee_id", id)
      .first();

    return NextResponse.json({
      success: true,
      data: updated,
      message: "Employee master updated successfully",
    });
  } catch (error) {
    console.error("Error updating employee:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update employee" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(["admin"]);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const deleted = await identityDb("employee_master").where("employee_id", id).delete();

    if (!deleted) {
      return NextResponse.json(
        { success: false, error: "Employee not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Employee ${id} deleted successfully`,
    });
  } catch (error) {
    console.error("Error deleting employee:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete employee" },
      { status: 500 }
    );
  }
}
