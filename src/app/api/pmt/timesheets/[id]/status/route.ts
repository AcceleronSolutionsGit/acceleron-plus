// PATCH /api/pmt/timesheets/[id]/status  — Approve or reject a timesheet entry
//
// Enforces:
// - Self-approval is never allowed (even for PMs or Admins).
// - A PM's timesheet on a project they manage MUST be approved by their RM (or Admin).
// - Regular team members' timesheets can be approved by their RM, the project's PM, or Admin.

import { NextRequest, NextResponse } from "next/server";
import { projectDb } from "@/lib/db";
import { requireSession, projectsManagedBy } from "@/lib/auth";
import { mapProjectTimesheetRow } from "@/lib/row-mapper";
import { directReportUserIds, projectManagersByProject } from "@/lib/reportees";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  const session = auth.session;
  const isAdmin =
    session.role === "admin" ||
    Boolean(session.additionalRoles?.includes("admin"));

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

  const ownerId = String(existing.user_id);
  const projectId = String(existing.project_id);

  // Strictly block self-approval
  if (ownerId === session.userId) {
    return NextResponse.json(
      {
        success: false,
        error: "Self-approval is not allowed. Your timesheets must be approved by your Reporting Manager.",
      },
      { status: 403 }
    );
  }

  if (!isAdmin) {
    const [reportees, managedSet, pmMap] = await Promise.all([
      directReportUserIds(session.userId),
      projectsManagedBy(session.userId),
      projectManagersByProject([projectId]),
    ]);
    const isRmOfOwner = reportees.includes(ownerId);
    const isOwnerPmOnProject = pmMap.get(projectId)?.has(ownerId) ?? false;

    if (isOwnerPmOnProject) {
      if (!isRmOfOwner) {
        return NextResponse.json(
          {
            success: false,
            error: "A Project Manager's timesheet on their own project must be approved by their Reporting Manager.",
          },
          { status: 403 }
        );
      }
    } else if (!isRmOfOwner && !managedSet.has(projectId)) {
      return NextResponse.json(
        {
          success: false,
          error: "You can only review timesheets from your direct reports or projects you manage.",
        },
        { status: 403 }
      );
    }
  }

  const now = new Date();
  const [updated] = await projectDb("project_timesheets")
    .where("id", id)
    .update({
      status,
      approved_by_user_id: session.userId,
      reviewed_by_user_id: session.userId,
      reviewed_at: now,
      rejection_reason: status === "rejected" ? String(remarks).trim() : null,
      updated_at: now,
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
