// GET    /api/documents/[id]/download  — stream file (auth-gated)
// DELETE /api/documents/[id]           — soft-delete a document (PM/Admin only)

import { NextRequest, NextResponse } from "next/server";
import { projectDb } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { readDocument, deleteDocument } from "@/lib/document-storage";

// ─── GET — Secure Download ─────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: documentId } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "UNAUTHORIZED" }, { status: 401 });

  const doc = await projectDb("project_documents")
    .where("id", documentId)
    .where("is_active", true)
    .first();

  if (!doc) return NextResponse.json({ success: false, error: "NOT_FOUND" }, { status: 404 });

  // ── Access control ───────────────────────────────────────────────
  if (session.role === "client" && doc.access_level !== "client_visible") {
    return NextResponse.json({ success: false, error: "FORBIDDEN" }, { status: 403 });
  }
  if (session.role === "member" && doc.access_level === "pm_only") {
    return NextResponse.json({ success: false, error: "FORBIDDEN" }, { status: 403 });
  }

  // ── Check mode: preview (inline) vs download ─────────────────────
  const mode = new URL(req.url).searchParams.get("mode") ?? "download"; // "preview" | "download"

  // ── Stream file ──────────────────────────────────────────────────
  let buffer: Buffer;
  try {
    buffer = await readDocument(doc.file_path);
  } catch {
    return NextResponse.json({ success: false, error: "FILE_NOT_FOUND",
      message: "The file was not found on disk. It may have been moved." }, { status: 404 });
  }

  // ── Update download counter + access log (non-blocking) ─────────
  projectDb("project_documents")
    .where("id", documentId)
    .update({
      download_count:   projectDb.raw("download_count + 1"),
      last_accessed_at: new Date().toISOString(),
    })
    .catch(() => {});

  projectDb("document_access_logs").insert({
    document_id: documentId,
    project_id:  doc.project_id,
    user_id:     session.userId,
    user_name:   session.fullName ?? null,
    action:      "download",
  }).catch(() => {});

  // ── Return with proper headers ───────────────────────────────────
  const disposition = mode === "preview"
    ? `inline; filename="${doc.file_name}"`
    : `attachment; filename="${doc.file_name}"`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type":              doc.mime_type,
      "Content-Disposition":       disposition,
      "Content-Length":            String(doc.file_size_bytes),
      "Cache-Control":             "private, no-cache",
      "X-Document-Version":        doc.version,
      "X-Document-Type":           doc.document_type,
      "X-Checksum-SHA256":         doc.checksum_sha256 ?? "",
    },
  });
}

// ─── DELETE — Soft Delete ──────────────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: documentId } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "UNAUTHORIZED" }, { status: 401 });

  if (session.role === "member" || session.role === "client") {
    return NextResponse.json({ success: false, error: "FORBIDDEN" }, { status: 403 });
  }

  const doc = await projectDb("project_documents")
    .where("id", documentId)
    .where("is_active", true)
    .first();

  if (!doc) return NextResponse.json({ success: false, error: "NOT_FOUND" }, { status: 404 });

  // Soft delete in DB
  await projectDb("project_documents")
    .where("id", documentId)
    .update({ is_active: false, updated_at: new Date().toISOString() });

  // Delete from disk (hard delete on confirmed removal)
  await deleteDocument(doc.file_path);

  // Audit log
  await projectDb("document_access_logs").insert({
    document_id: documentId,
    project_id:  doc.project_id,
    user_id:     session.userId,
    user_name:   session.fullName ?? null,
    action:      "delete",
  }).catch(() => {});

  return NextResponse.json({ success: true, message: "Document deleted" });
}
