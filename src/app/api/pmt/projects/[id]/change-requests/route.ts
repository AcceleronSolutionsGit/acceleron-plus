import { NextRequest, NextResponse } from "next/server";
import { requireProjectCapability, can } from "@/lib/auth";
import {
  getProjectChangeRequests,
  createProjectChangeRequest,
} from "@/lib/change-request-service";

export const runtime = "nodejs";

/**
 * GET /api/pmt/projects/[id]/change-requests
 * Returns all Change Requests for the project along with order value reconciliation metrics.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const guard = await requireProjectCapability(id, "project.view");
    if (!guard.ok) return guard.response;

    const result = await getProjectChangeRequests(guard.project.id);
    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    console.error("[change-requests.GET] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch change requests" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/pmt/projects/[id]/change-requests
 * Adds a new Change Request to the project.
 * Supports multipart/form-data for uploading PO or document, planned hours, and Order value.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const guard = await requireProjectCapability(id, "project.edit");
    if (!guard.ok) return guard.response;

    const projectId = guard.project.id;
    const contentType = req.headers.get("content-type") || "";

    let title = "";
    let description = "";
    let orderValueInr: number | string = 0;
    let plannedHours: number | string = 0;
    let poNumber = "";
    let status: any = "approved";
    let crNumber = "";
    let fileObj: { originalName: string; mimeType: string; buffer: Buffer } | null = null;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      title = (formData.get("title") as string) || "";
      description = (formData.get("description") as string) || "";
      orderValueInr = (formData.get("orderValueInr") as string) || (formData.get("orderValue") as string) || 0;
      plannedHours = (formData.get("plannedHours") as string) || 0;
      poNumber = (formData.get("poNumber") as string) || "";
      status = (formData.get("status") as any) || "approved";
      crNumber = (formData.get("crNumber") as string) || "";

      const file = formData.get("file") as File | null;
      if (file && typeof file !== "string" && file.size > 0) {
        const arrayBuffer = await file.arrayBuffer();
        fileObj = {
          originalName: file.name,
          mimeType: file.type || "application/octet-stream",
          buffer: Buffer.from(arrayBuffer),
        };
      }
    } else {
      const body = await req.json();
      title = body.title || "";
      description = body.description || "";
      orderValueInr = body.orderValueInr ?? body.orderValue ?? 0;
      plannedHours = body.plannedHours ?? body.planned_hours ?? 0;
      poNumber = body.poNumber || body.po_number || "";
      status = body.status || "approved";
      crNumber = body.crNumber || body.cr_number || "";

      if (body.file && body.file.data) {
        const base64Data = body.file.data.includes(",")
          ? body.file.data.split(",")[1]
          : body.file.data;
        fileObj = {
          originalName: body.file.name || "document.pdf",
          mimeType: body.file.type || "application/pdf",
          buffer: Buffer.from(base64Data, "base64"),
        };
      }
    }

    if (!title.trim()) {
      return NextResponse.json(
        { error: "Change Request title/subject is required." },
        { status: 400 }
      );
    }

    const result = await createProjectChangeRequest({
      projectId,
      title,
      description,
      orderValueInr,
      plannedHours,
      poNumber,
      status,
      crNumber,
      createdByUserId: guard.session.userId,
      createdByName: guard.session.fullName,
      file: fileObj,
    });

    return NextResponse.json(
      {
        message: "Change Request added successfully and project order value updated.",
        ...result,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("[change-requests.POST] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to add change request" },
      { status: 500 }
    );
  }
}

