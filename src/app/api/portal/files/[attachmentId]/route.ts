// Public portal file server — serves attachments uploaded via the portal
// GET /api/portal/files/[attachmentId]
// Opens inline (preview) or forces download based on mime type.

import { NextRequest, NextResponse } from "next/server";
import { itsmDb } from "@/lib/db";
import fs from "fs/promises";
import path from "path";

const PORTAL_UPLOAD_DIR = path.join(process.cwd(), "uploads", "portal-tickets");

// Mime types that browsers can preview inline
const PREVIEWABLE = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "text/plain",
  "text/csv",
]);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ attachmentId: string }> }
) {
  try {
    const { attachmentId } = await params;

    const att = await itsmDb("ticket_attachments")
      .where("id", attachmentId)
      .first()
      .catch(() => null);

    if (!att) {
      return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
    }

    const absPath = path.resolve(PORTAL_UPLOAD_DIR, att.file_path);
    if (!absPath.startsWith(path.resolve(PORTAL_UPLOAD_DIR))) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }

    let buffer: Buffer;
    try {
      buffer = Buffer.from(await fs.readFile(absPath));
    } catch {
      return NextResponse.json({ error: "File not found on disk." }, { status: 404 });
    }

    const safeName = path.basename(att.file_name || "attachment").replace(/"/g, '\\"');
    const encodedName = encodeURIComponent(path.basename(att.file_name || "attachment"));
    const isPreview = PREVIEWABLE.has(att.mime_type);
    const disposition = isPreview
      ? `inline; filename="${safeName}"; filename*=UTF-8''${encodedName}`
      : `attachment; filename="${safeName}"; filename*=UTF-8''${encodedName}`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": att.mime_type || "application/octet-stream",
        "Content-Disposition": disposition,
        "Content-Length": String(buffer.byteLength),
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    console.error("Portal file serve error:", err);
    return NextResponse.json({ error: "Failed to serve file." }, { status: 500 });
  }
}
