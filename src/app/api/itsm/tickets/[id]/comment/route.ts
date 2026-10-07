// POST /api/itsm/tickets/[id]/comment
// Adds a comment (and optional file attachments) to a ticket's activity log.

import { NextRequest, NextResponse } from "next/server";
import { itsmDb } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { saveTicketAttachment, ALLOWED_ATTACHMENT_MIME_TYPES, MAX_ATTACHMENT_SIZE_BYTES } from "@/lib/ticket-attachment-storage";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const { id } = await params;

    const ticket = await itsmDb("tickets").where("id", id).first();
    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
    }

    const fd = await req.formData();
    const comment = String(fd.get("comment") ?? "").trim();
    const files = fd.getAll("files").filter((v): v is File => v instanceof File && v.size > 0);

    if (!comment && files.length === 0) {
      return NextResponse.json({ error: "Comment text or at least one file is required." }, { status: 400 });
    }

    // Save attachments
    const savedAttachments: any[] = [];
    for (const file of files) {
      if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
        return NextResponse.json({ error: `File "${file.name}" exceeds 20 MB.` }, { status: 400 });
      }
      if (!ALLOWED_ATTACHMENT_MIME_TYPES[file.type]) {
        return NextResponse.json({ error: `File type "${file.type}" is not allowed.` }, { status: 400 });
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      const meta = await saveTicketAttachment(ticket.id, file.name, file.type, buffer);
      savedAttachments.push(meta);
    }

    // Append attachments to the ticket's attachments JSON column
    if (savedAttachments.length > 0) {
      let existing: any[] = [];
      try {
        existing = Array.isArray(ticket.attachments)
          ? ticket.attachments
          : JSON.parse(ticket.attachments || "[]");
      } catch { existing = []; }

      await itsmDb("tickets")
        .where("id", ticket.id)
        .update({ attachments: JSON.stringify([...existing, ...savedAttachments]) });
    }

    // Write to activity log
    const [activity] = await itsmDb("ticket_activity_log").insert({
      ticket_id: ticket.id,
      ticket_number: ticket.ticket_number,
      type: "note",
      field_name: "notes",
      new_value: comment || `Attached ${files.length} file(s)`,
      changed_by_user_id: auth.session.userId,
      changed_by_name: auth.session.fullName || auth.session.email,
    }).returning("*").catch(() => [null]);

    return NextResponse.json({
      success: true,
      activity: activity ? {
        id: activity.id,
        type: "field_change",
        fieldName: "notes",
        newValue: activity.new_value,
        changedBy: { fullName: activity.changed_by_name },
        timestamp: activity.created_at,
        attachments: savedAttachments,
      } : null,
      attachments: savedAttachments,
    });
  } catch (err) {
    console.error("Comment post error:", err);
    return NextResponse.json({ error: "Failed to post comment." }, { status: 500 });
  }
}
