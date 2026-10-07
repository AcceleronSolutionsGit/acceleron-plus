// Public API: track a ticket by number without auth
// GET /api/portal/tickets/[ticketNumber]

import { NextRequest, NextResponse } from "next/server";
import { itsmDb, identityDb } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ticketNumber: string }> }
) {
  try {
    const { ticketNumber } = await params;

    const ticket = await itsmDb("tickets")
      .where("ticket_number", ticketNumber.toUpperCase())
      .first();

    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
    }

    // Fetch attachments for this ticket
    const attachments = await itsmDb("ticket_attachments")
      .where("ticket_id", ticket.id)
      .select("id", "file_name", "mime_type", "file_size_bytes", "created_at")
      .catch(() => []); // graceful if table doesn't exist yet

    // Fetch agent name if assigned
    let agentName = null;
    if (ticket.agent_user_id) {
      const agent = await identityDb("users")
        .where("id", ticket.agent_user_id)
        .select("full_name")
        .first()
        .catch(() => null);
      if (agent) {
        agentName = agent.full_name;
      }
    }

    // Only expose safe public fields
    return NextResponse.json({
      success: true,
      ticket: {
        ticketNumber: ticket.ticket_number,
        subject: ticket.subject,
        description: ticket.description,
        status: ticket.status,
        priority: ticket.priority,
        ticketType: ticket.ticket_type,
        source: ticket.source,
        createdAt: ticket.created_at,
        updatedAt: ticket.updated_at,
        resolvedAt: ticket.resolved_at,
        closedAt: ticket.closed_at,
        resolution: ticket.resolution,
        agentName: agentName,
        attachments: attachments.map((a: any) => ({
          id: a.id,
          fileName: a.file_name,
          mimeType: a.mime_type,
          fileSizeBytes: a.file_size_bytes,
          createdAt: a.created_at,
          // Public download URL — served by the portal file API
          downloadUrl: `/api/portal/files/${a.id}`,
        })),
      },
    });
  } catch (err) {
    console.error("Portal ticket lookup error:", err);
    return NextResponse.json({ error: "Failed to find ticket." }, { status: 500 });
  }
}
