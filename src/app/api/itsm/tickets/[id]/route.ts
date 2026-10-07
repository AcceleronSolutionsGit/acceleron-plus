import { NextResponse } from "next/server";
import { getTicket } from "@/lib/api";
import { itsmDb } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { notifyAsync, events } from "@/lib/notifications";
import { autoAssignTicket } from "@/lib/itsm-engine";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Priorities that count as an escalation when a ticket is raised to them. */
const ESCALATED = new Set(["high", "urgent", "critical"]);

const CLOSED_STATUSES = new Set(["resolved", "closed", "cancelled"]);

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const { id } = await context.params;
    const ticket = await getTicket(id);
    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }
    return NextResponse.json({ ticket }, { status: 200 });
  } catch (error) {
    console.error("Failed to fetch ticket:", error);
    return NextResponse.json({ error: "Failed to fetch ticket" }, { status: 500 });
  }
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const { id } = await context.params;
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const isUuid = UUID_RE.test(id);

    // Read the row first — the notification triggers below need to compare
    // against the previous values, not the new ones.
    const existing = await itsmDb("tickets")
      .where(isUuid ? "id" : "ticket_number", id)
      .first();

    if (!existing) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (body.agent_user_id !== undefined) updates.agent_user_id = body.agent_user_id || null;
    if (body.agentUserId !== undefined) updates.agent_user_id = body.agentUserId || null;
    if (body.status !== undefined) updates.status = body.status;
    if (body.resolved_at !== undefined) updates.resolved_at = body.resolved_at;
    if (body.closed_at !== undefined) updates.closed_at = body.closed_at;
    if (body.closure_comments !== undefined) updates.closure_comments = body.closure_comments;
    if (body.project_context_id !== undefined) updates.project_context_id = body.project_context_id || null;
    if (body.project_code !== undefined) updates.project_code = body.project_code || null;
    if (body.group_id !== undefined) updates.group_id = body.group_id || null;
    if (body.groupId !== undefined) updates.group_id = body.groupId || null;
    if (body.priority !== undefined) updates.priority = body.priority;
    if (body.impact !== undefined) updates.impact = body.impact;

    await itsmDb("tickets").where("id", existing.id).update(updates);

    // Auto-assign if group changed and no explicit agent was provided
    if (updates.group_id && updates.group_id !== existing.group_id && !updates.agent_user_id) {
      await autoAssignTicket(existing.id, updates.group_id as string);
    }

    // ─── PMT notifications ────────────────────────────────────────
    const projectCode = (updates.project_code as string | null) ?? existing.project_code;
    const ticketNumber: string = existing.ticket_number;

    if (projectCode) {
      // Newly attached to a project.
      if (
        updates.project_code !== undefined &&
        updates.project_code &&
        updates.project_code !== existing.project_code
      ) {
        notifyAsync(
          events.ticketLinked(projectCode, existing.id, ticketNumber, existing.subject, null)
        );
      }

      // Raised to a higher priority band.
      const newPriority = updates.priority as string | undefined;
      if (
        newPriority &&
        newPriority !== existing.priority &&
        ESCALATED.has(String(newPriority).toLowerCase()) &&
        !ESCALATED.has(String(existing.priority ?? "").toLowerCase())
      ) {
        notifyAsync(
          events.ticketEscalated(projectCode, existing.id, ticketNumber, existing.subject, newPriority)
        );
      }

      // Past its SLA and still open. Deduped, so this fires once per ticket.
      const status = String(updates.status ?? existing.status ?? "").toLowerCase();
      const slaDueAt = existing.sla_due_at ? new Date(existing.sla_due_at) : null;
      if (slaDueAt && slaDueAt.getTime() < Date.now() && !CLOSED_STATUSES.has(status)) {
        notifyAsync(
          events.ticketSlaBreached(projectCode, existing.id, ticketNumber, existing.subject)
        );
      }
    }

    const updatedTicket = await getTicket(id);
    return NextResponse.json({ ticket: updatedTicket }, { status: 200 });
  } catch (error) {
    console.error("Failed to update ticket:", error);
    return NextResponse.json({ error: "Failed to update ticket" }, { status: 500 });
  }
}
