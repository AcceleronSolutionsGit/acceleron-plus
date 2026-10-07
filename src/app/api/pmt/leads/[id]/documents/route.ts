// GET  /api/pmt/leads/[id]/documents  — list all documents for a lead
// POST /api/pmt/leads/[id]/documents  — upload a new document for a lead

import { NextRequest, NextResponse } from "next/server";
import { projectDb } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { saveDocument, ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES, formatFileSize } from "@/lib/document-storage";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function findLead(idOrNumber: string) {
  return projectDb("leads")
    .where(UUID_RE.test(idOrNumber) ? "id" : "lead_number", idOrNumber)
    .first<Record<string, unknown> | undefined>();
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const lead = await findLead(id);
  if (!lead) {
    return NextResponse.json({ success: false, error: "Lead not found" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const documentType = searchParams.get("documentType");
  const category = searchParams.get("category");
  const q = searchParams.get("q");

  // If this lead was converted to a project, also pick up documents attached to that project
  const linkedProject = await projectDb("projects")
    .where("lead_id", lead.id as string)
    .select("id")
    .first()
    .catch(() => undefined);

  let query = projectDb("project_documents")
    .where("is_active", true)
    .where(function () {
      this.where("lead_id", lead.id as string);
      if (linkedProject?.id) {
        this.orWhere("project_id", linkedProject.id);
      }
    })
    .orderBy("created_at", "desc");

  if (documentType) query = query.where("document_type", documentType);
  if (category) query = query.where("category", category);
  if (q) {
    query = query.where(function () {
      this.where("title", "ilike", `%${q}%`)
        .orWhere("tags", "ilike", `%${q}%`)
        .orWhere("description", "ilike", `%${q}%`);
    });
  }

  const rows = await query.select(
    "id", "lead_id", "project_id", "document_type", "category", "title",
    "description", "version", "tags", "file_name", "mime_type",
    "file_size_bytes", "access_level", "is_latest_version",
    "uploaded_by_user_id", "uploaded_by_name",
    "download_count", "created_at", "updated_at"
  );

  const grouped: Record<string, any[]> = {};
  for (const row of rows) {
    const type = row.document_type;
    if (!grouped[type]) grouped[type] = [];
    grouped[type].push({
      id: row.id,
      leadId: row.lead_id,
      projectId: row.project_id,
      documentType: row.document_type,
      category: row.category,
      title: row.title,
      description: row.description,
      version: row.version,
      tags: row.tags ? row.tags.split(",").map((t: string) => t.trim()) : [],
      fileName: row.file_name,
      mimeType: row.mime_type,
      fileSizeBytes: row.file_size_bytes,
      fileSizeDisplay: formatFileSize(row.file_size_bytes),
      accessLevel: row.access_level,
      isLatestVersion: row.is_latest_version,
      uploadedByUserId: row.uploaded_by_user_id,
      uploadedByName: row.uploaded_by_name,
      downloadCount: row.download_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }

  return NextResponse.json({
    success: true,
    meta: { totalDocuments: rows.length },
    grouped,
    data: rows.map((r: any) => ({
      id: r.id,
      leadId: r.lead_id,
      projectId: r.project_id,
      documentType: r.document_type,
      category: r.category,
      title: r.title,
      description: r.description,
      version: r.version,
      tags: r.tags ? r.tags.split(",").map((t: string) => t.trim()) : [],
      fileName: r.file_name,
      mimeType: r.mime_type,
      fileSizeBytes: r.file_size_bytes,
      fileSizeDisplay: formatFileSize(r.file_size_bytes),
      accessLevel: r.access_level,
      isLatestVersion: r.is_latest_version,
      uploadedByUserId: r.uploaded_by_user_id,
      uploadedByName: r.uploaded_by_name,
      downloadCount: r.download_count,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  const session = auth.session;

  const { id } = await params;
  const lead = await findLead(id);
  if (!lead) {
    return NextResponse.json({ success: false, error: "Lead not found" }, { status: 404 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (err) {
    return NextResponse.json(
      { success: false, error: "VALIDATION_FAILED", message: "Invalid form data: " + String(err) },
      { status: 400 }
    );
  }

  const file = formData.get("file") as File | null;
  const title = (formData.get("title") as string)?.trim();
  const documentType = ((formData.get("documentType") as string) || "scope").toLowerCase();
  const category = ((formData.get("category") as string) || "presales").toLowerCase();
  const description = (formData.get("description") as string)?.trim() || null;
  const version = (formData.get("version") as string)?.trim() || "1.0";
  const tags = (formData.get("tags") as string)?.trim() || null;
  const accessLevel = (formData.get("accessLevel") as string)?.trim() || "team";

  if (!file) {
    return NextResponse.json(
      { success: false, error: "VALIDATION_FAILED", details: [{ field: "file", message: "A file is required" }] },
      { status: 400 }
    );
  }
  if (!title) {
    return NextResponse.json(
      { success: false, error: "VALIDATION_FAILED", details: [{ field: "title", message: "Title is required" }] },
      { status: 400 }
    );
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      { success: false, error: "FILE_TOO_LARGE", message: `File size exceeds 50 MB limit.` },
      { status: 400 }
    );
  }
  if (!ALLOWED_MIME_TYPES[file.type]) {
    return NextResponse.json(
      { success: false, error: "INVALID_FILE_TYPE", message: `File type '${file.type}' is not supported.` },
      { status: 400 }
    );
  }

  // Save file to disk
  let savedFile;
  try {
    const arrayBuffer = await file.arrayBuffer();
    savedFile = await saveDocument(
      lead.id as string,
      file.name,
      file.type,
      Buffer.from(arrayBuffer)
    );
  } catch (err: any) {
    console.error("[leads.documents.upload] Failed to save file:", err);
    return NextResponse.json(
      { success: false, error: "UPLOAD_FAILED", message: err.message },
      { status: 500 }
    );
  }

  // Check if lead is already converted to a project
  const linkedProject = await projectDb("projects")
    .where("lead_id", lead.id as string)
    .select("id")
    .first()
    .catch(() => undefined);

  const [row] = await projectDb("project_documents")
    .insert({
      tenant_id: lead.tenant_id ?? "acceleron",
      lead_id: lead.id,
      project_id: linkedProject?.id ?? null,
      document_type: documentType,
      category,
      title,
      description,
      version,
      tags,
      file_name: file.name,
      stored_file_name: savedFile.storedFileName,
      file_path: savedFile.filePath,
      mime_type: savedFile.mimeType,
      file_size_bytes: savedFile.fileSizeBytes,
      checksum_sha256: savedFile.checksumSha256,
      access_level: accessLevel,
      is_active: true,
      is_latest_version: true,
      uploaded_by_user_id: session.userId,
      uploaded_by_name: session.fullName || "User",
    })
    .returning("*");

  return NextResponse.json(
    {
      success: true,
      data: {
        id: row.id,
        leadId: row.lead_id,
        projectId: row.project_id,
        documentType: row.document_type,
        category: row.category,
        title: row.title,
        description: row.description,
        version: row.version,
        fileName: row.file_name,
        mimeType: row.mime_type,
        fileSizeBytes: row.file_size_bytes,
        fileSizeDisplay: formatFileSize(row.file_size_bytes),
        accessLevel: row.access_level,
        uploadedByName: row.uploaded_by_name,
        createdAt: row.created_at,
      },
    },
    { status: 201 }
  );
}
