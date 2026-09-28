// GET  /api/pmt/projects/[id]/documents  — list all documents for a project
// POST /api/pmt/projects/[id]/documents  — upload a new document

import { NextRequest, NextResponse } from "next/server";
import { projectDb } from "@/lib/db";
import { requireProjectCapability, can } from "@/lib/auth";
import { saveDocument, ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES, formatFileSize } from "@/lib/document-storage";

// ─── GET — List Documents ──────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const guard = await requireProjectCapability(id, "document.view");
  if (!guard.ok) return guard.response;
  const projectId = guard.project.id;
  const { access } = guard;

  const { searchParams } = new URL(req.url);
  const documentType = searchParams.get("documentType");
  const category     = searchParams.get("category");
  const q            = searchParams.get("q");

  let query = projectDb("project_documents")
    .where("project_id", projectId)
    .where("is_active", true)
    .orderBy("created_at", "desc");

  // A client only ever sees what was shared with them. Anyone who cannot
  // delete documents is delivery-side but not running the project, so the
  // confidential shelf stays closed to them too.
  if (!can(access, "document.delete")) {
    query = can(access, "document.upload")
      ? query.whereIn("access_level", ["team", "client_visible"])
      : query.where("access_level", "client_visible");
  }

  if (documentType) query = query.where("document_type", documentType);
  if (category)     query = query.where("category", category);
  if (q) {
    query = query.where(function () {
      this.where("title",    "ilike", `%${q}%`)
          .orWhere("tags",   "ilike", `%${q}%`)
          .orWhere("description", "ilike", `%${q}%`);
    });
  }

  const rows = await query.select(
    "id", "project_id", "document_type", "category", "title",
    "description", "version", "tags", "file_name", "mime_type",
    "file_size_bytes", "access_level", "is_latest_version",
    "uploaded_by_user_id", "uploaded_by_name",
    "download_count", "created_at", "updated_at"
    // NOTE: file_path intentionally excluded from list — only returned on download
  );

  // Group by document_type for easy UI rendering
  const grouped: Record<string, any[]> = {};
  for (const row of rows) {
    const type = row.document_type;
    if (!grouped[type]) grouped[type] = [];
    grouped[type].push({
      id:              row.id,
      projectId:       row.project_id,
      documentType:    row.document_type,
      category:        row.category,
      title:           row.title,
      description:     row.description,
      version:         row.version,
      tags:            row.tags ? row.tags.split(",").map((t: string) => t.trim()) : [],
      fileName:        row.file_name,
      mimeType:        row.mime_type,
      fileSizeBytes:   row.file_size_bytes,
      fileSizeDisplay: formatFileSize(row.file_size_bytes),
      accessLevel:     row.access_level,
      isLatestVersion: row.is_latest_version,
      uploadedByUserId: row.uploaded_by_user_id,
      uploadedByName:  row.uploaded_by_name,
      downloadCount:   row.download_count,
      createdAt:       row.created_at,
      updatedAt:       row.updated_at,
    });
  }

  return NextResponse.json({
    success: true,
    meta: { totalDocuments: rows.length },
    grouped,   // { scope: [...], proposal: [...], ... }
    data: rows, // flat list too
  });
}

// ─── POST — Upload Document ────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const guard = await requireProjectCapability(id, "document.upload");
  if (!guard.ok) return guard.response;
  const projectId = guard.project.id;
  const session = guard.session;

  // Parse multipart form
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ success: false, error: "INVALID_FORM_DATA" }, { status: 400 });
  }

  const file          = formData.get("file") as File | null;
  const title         = (formData.get("title") as string)?.trim();
  const documentType  = (formData.get("documentType") as string) ?? "other";
  const category      = (formData.get("category") as string) ?? "general";
  const description   = (formData.get("description") as string) ?? "";
  const version       = (formData.get("version") as string) ?? "1.0";
  const tags          = (formData.get("tags") as string) ?? "";
  const accessLevel   = (formData.get("accessLevel") as string) ?? "team";
  const supersedesId  = (formData.get("supersedesDocumentId") as string) ?? null;

  // ── Validation ───────────────────────────────────────────────────
  const errors: { field: string; message: string }[] = [];
  if (!file)  errors.push({ field: "file",  message: "A file is required" });
  if (!title) errors.push({ field: "title", message: "Document title is required" });

  const validTypes = ["scope","sop","proposal","po","contract","sow","test_plan","meeting_minutes","phase_report","risk_register","other"];
  if (!validTypes.includes(documentType)) {
    errors.push({ field: "documentType", message: `Invalid document type` });
  }
  const validAccess = ["team", "pm_only", "client_visible"];
  if (!validAccess.includes(accessLevel)) {
    errors.push({ field: "accessLevel", message: "Invalid access level" });
  }

  if (file) {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      errors.push({ field: "file", message: `File too large. Max is ${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB` });
    }
    if (!ALLOWED_MIME_TYPES[file.type]) {
      errors.push({ field: "file", message: `File type '${file.type}' is not supported` });
    }
  }

  if (errors.length > 0) {
    return NextResponse.json({ success: false, error: "VALIDATION_FAILED", details: errors }, { status: 400 });
  }

  // ── Save file to disk ────────────────────────────────────────────
  const buffer = Buffer.from(await file!.arrayBuffer());
  let saved;
  try {
    saved = await saveDocument(projectId, file!.name, file!.type, buffer);
  } catch (err: any) {
    return NextResponse.json({ success: false, error: "STORAGE_ERROR", message: err?.message }, { status: 422 });
  }

  // ── If superseding, mark old version as not latest ───────────────
  if (supersedesId) {
    await projectDb("project_documents")
      .where("id", supersedesId)
      .update({ is_latest_version: false });
  }

  // ── Insert DB record ─────────────────────────────────────────────
  const [doc] = await projectDb("project_documents").insert({
    tenant_id:              "acceleron",
    project_id:             projectId,
    document_type:          documentType,
    category,
    title,
    description:            description || null,
    version,
    tags:                   tags || null,
    file_name:              file!.name,
    stored_file_name:       saved.storedFileName,
    file_path:              saved.filePath,
    mime_type:              saved.mimeType,
    file_size_bytes:        saved.fileSizeBytes,
    checksum_sha256:        saved.checksumSha256,
    access_level:           accessLevel,
    is_active:              true,
    is_latest_version:      true,
    supersedes_document_id: supersedesId || null,
    uploaded_by_user_id:    session.userId,
    uploaded_by_name:       session.fullName ?? null,
    download_count:         0,
  }).returning("*");

  // ── Audit log ────────────────────────────────────────────────────
  await projectDb("document_access_logs").insert({
    document_id: doc.id,
    project_id:  projectId,
    user_id:     session.userId,
    user_name:   session.fullName ?? null,
    action:      "upload",
  }).catch(() => {}); // non-fatal

  return NextResponse.json({
    success: true,
    data: {
      id:              doc.id,
      title:           doc.title,
      documentType:    doc.document_type,
      category:        doc.category,
      version:         doc.version,
      fileName:        doc.file_name,
      mimeType:        doc.mime_type,
      fileSizeBytes:   doc.file_size_bytes,
      fileSizeDisplay: formatFileSize(doc.file_size_bytes),
      accessLevel:     doc.access_level,
      uploadedByName:  doc.uploaded_by_name,
      createdAt:       doc.created_at,
    },
  }, { status: 201 });
}
