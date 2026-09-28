// PATCH /api/pmt/timesheets/[id]/status  — PM approves or rejects a timesheet entry

import { NextRequest, NextResponse } from "next/server";
import { projectDb } from "@/lib/db";
import { requireCapabilityGlobally } from "@/lib/auth";
import { mapProjectTimesheetRow } from "@/lib/row-mapper";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireCapabilityGlobally("timesheet.approve");
  if (!auth.ok) return auth.response;
  const session = auth.session;

  const body = await req.json();
  const { status, remarks } = body;

  if (!["approved", "rejected"].includes(status)) {
    return NextResponse.json({
      success: false,
      error: "VALIDATION_FAILED",
      details: [{ field: "status", message: "Must be 'approved' or 'rejected'" }],
    }, { status: 400 });
  }

  if (status === "rejected" && !remarks?.trim()) {
    return NextResponse.json({
      success: false,
      error: "VALIDATION_FAILED",
      details: [{ field: "remarks", message: "Remarks are required when rejecting" }],
    }, { status: 400 });
  }

  const existing = await projectDb("project_timesheets").where("id", id).first();
  if (!existing) return NextResponse.json({ success: false, error: "NOT_FOUND" }, { status: 404 });

  const [updated] = await projectDb("project_timesheets")
    .where("id", id)
    .update({
      status,
      approved_by_user_id: session.userId,
      updated_at: new Date().toISOString(),
    })
    .returning("*");

  const mapped = mapProjectTimesheetRow(updated);

  return NextResponse.json({
    success: true,
    data: {
      id: mapped.id,
      status: mapped.status,
      approvedByUserId: session.userId,
      approvedByName:   session.fullName ?? null,
      remarks:          remarks ?? null,
      updatedAt:        mapped.updatedAt,
    },
  });
}
