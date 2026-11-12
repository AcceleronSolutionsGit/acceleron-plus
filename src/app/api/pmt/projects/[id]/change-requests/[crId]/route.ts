import { NextRequest, NextResponse } from "next/server";
import { requireProjectCapability } from "@/lib/auth";
import {
  updateProjectChangeRequest,
  deleteProjectChangeRequest,
} from "@/lib/change-request-service";
import { projectDb } from "@/lib/db";

export const runtime = "nodejs";

/**
 * PATCH /api/pmt/projects/[id]/change-requests/[crId]
 * Updates fields of a change request (status, order value, planned hours, etc.)
 * and recalculates project order value.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; crId: string }> }
) {
  try {
    const { id, crId } = await params;
    const guard = await requireProjectCapability(id, "project.edit");
    if (!guard.ok) return guard.response;

    const body = await req.json();

    const result = await updateProjectChangeRequest(crId, {
      title: body.title,
      description: body.description,
      status: body.status,
      orderValueInr: body.orderValueInr ?? body.orderValue,
      plannedHours: body.plannedHours ?? body.planned_hours,
      actualHours: body.actualHours ?? body.actual_hours,
      poNumber: body.poNumber ?? body.po_number,
      approvedByUserId: guard.session.userId,
    });

    return NextResponse.json(
      {
        message: "Change Request updated successfully.",
        ...result,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("[change-requests.PATCH] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update change request" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/pmt/projects/[id]/change-requests/[crId]
 * Deletes a change request and restores the project's order value.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; crId: string }> }
) {
  try {
    const { id, crId } = await params;
    const guard = await requireProjectCapability(id, "project.edit");
    if (!guard.ok) return guard.response;

    const result = await deleteProjectChangeRequest(crId);

    return NextResponse.json(
      {
        message: "Change Request removed and project order value recalculated.",
        ...result,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("[change-requests.DELETE] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete change request" },
      { status: 500 }
    );
  }
}

