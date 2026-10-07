/**
 * GET /api/itsm/tickets/[id]/attachments/[filename]
 *
 * Securely serves a ticket attachment from disk. The [id] is the ticket UUID
 * or ticket number, and [filename] is the storedFileName. This route validates
 * that the requested file belongs to the ticket before serving it.
 */

import { NextResponse } from "next/server";
import { itsmDb } from "@/lib/db";
import { readTicketAttachment } from "@/lib/ticket-attachment-storage";
import path from "path";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string; filename: string }> }
) {
  try {
    const { id, filename } = await context.params;

    if (!id || !filename) {
      return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
    }

    // Sanitize — prevent path traversal
    const safeFilename = path.basename(filename);

    // Look up the ticket
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const isUuid = UUID_RE.test(id);
    const ticket = await itsmDb("tickets")
      .where(isUuid ? "id" : "ticket_number", id)
      .first();

    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    // Parse attachments column and find the matching file
    let attachments: any[] = [];
    try {
      attachments =
        typeof ticket.attachments === "string"
          ? JSON.parse(ticket.attachments)
          : Array.isArray(ticket.attachments)
          ? ticket.attachments
          : [];
    } catch {
      attachments = [];
    }

    const att = attachments.find((a: any) => a.storedFileName === safeFilename);
    if (!att) {
      return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
    }

    // Read from disk using the stored filePath (relative to UPLOAD_ROOT)
    const buffer = await readTicketAttachment(att.filePath);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": att.mimeType || "application/octet-stream",
        "Content-Disposition": `inline; filename="${encodeURIComponent(att.originalName)}"`,
        "Content-Length": String(buffer.byteLength),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      return NextResponse.json({ error: "File not found on disk" }, { status: 404 });
    }
    console.error("Attachment serve failed:", error);
    return NextResponse.json({ error: "Failed to serve attachment" }, { status: 500 });
  }
}