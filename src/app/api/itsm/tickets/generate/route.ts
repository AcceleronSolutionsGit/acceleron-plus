/**
 * POST /api/itsm/tickets/generate
 *
 * Accepts a multipart form upload. Reads the attachment, extracts text,
 * infers ticket fields (subject, description, priority, ticketType), saves
 * the attachment to disk, creates the ticket record, and returns both the
 * created ticket and the inferred fields so the UI can present a review step.
 *
 * Optional form fields:
 *   - projectCode: link to a project
 *   - groupId: service group
 *   - agentUserId: assign immediately
 *   - requesterId: override requester
 *   - preview: "true" → infer + return fields WITHOUT creating a ticket
 */

import { NextResponse } from "next/server";
import { itsmDb, identityDb } from "@/lib/db";
import { calculateSlaDueDate } from "@/lib/itsm-engine";
import { notifyAsync, events } from "@/lib/notifications";
import {
  extractTextFromBuffer,
  inferTicketFieldsFromText,
  saveTicketAttachment,
  ALLOWED_ATTACHMENT_MIME_TYPES,
  MAX_ATTACHMENT_SIZE_BYTES,
} from "@/lib/ticket-attachment-storage";

export const runtime = "nodejs";

const DEFAULT_ITSM_TENANT = "8434da2c-a300-433f-83fd-57249690ad09";

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "Request must be multipart/form-data" },
        { status: 400 }
      );
    }

    // Parse multipart form
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
      return NextResponse.json(
        { error: `File too large. Maximum size is ${MAX_ATTACHMENT_SIZE_BYTES / 1024 / 1024} MB` },
        { status: 400 }
      );
    }

    const mimeType = file.type || "application/octet-stream";
    if (!ALLOWED_ATTACHMENT_MIME_TYPES[mimeType]) {
      return NextResponse.json(
        { error: `File type '${mimeType}' is not supported` },
        { status: 400 }
      );
    }

    // Read file bytes
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Extract text
    const extractedText = await extractTextFromBuffer(buffer, mimeType, file.name);

    // Infer ticket fields
    const inferred = inferTicketFieldsFromText(extractedText, file.name);

    // Optional form overrides
    const preview = formData.get("preview") === "true";
    const projectCode = (formData.get("projectCode") as string) || null;
    const groupId = (formData.get("groupId") as string) || null;
    const agentUserId = (formData.get("agentUserId") as string) || null;
    const requesterId = (formData.get("requesterId") as string) || null;
    const tenantId =
      (formData.get("tenantId") as string) || DEFAULT_ITSM_TENANT;

    // --- Preview mode: return inference only, no DB write ---
    if (preview) {
      return NextResponse.json({
        preview: true,
        inferred,
        extractedText: extractedText.slice(0, 2000),
        fileName: file.name,
        fileSize: file.size,
        mimeType,
      });
    }

    // --- Resolve project context ---
    let projectContextId: string | null = null;
    if (projectCode) {
      const pCtx = await itsmDb("project_contexts")
        .where("project_code", projectCode)
        .first()
        .catch(() => null);
      if (pCtx) projectContextId = pCtx.id;
    }

    // --- Ensure requester exists ---
    let finalRequesterId = requesterId || null;
    if (finalRequesterId) {
      const exists = await itsmDb("requesters").where("id", finalRequesterId).first().catch(() => null);
      if (!exists) {
        const userRec = await identityDb("users").where("id", finalRequesterId).first().catch(() => null);
        if (userRec) {
          const names = (userRec.full_name || "User").trim().split(" ");
          await itsmDb("requesters").insert({
            id: userRec.id,
            tenant_id: tenantId,
            email: userRec.email,
            first_name: names[0] || "User",
            last_name: names.slice(1).join(" ") || "",
            company_id: "02479f1a-1032-442f-a8c4-22cb93afbd6e",
            is_active: true,
            source_system: "darwinbox",
          }).catch(() => null);
        }
      }
    }

    // --- Generate ticket number ---
    const prefix =
      inferred.ticketType === "service_request"
        ? "SR"
        : inferred.ticketType === "problem"
        ? "PRB"
        : inferred.ticketType === "query"
        ? "QRY"
        : "INC";
    const ticketNumber = `${prefix}-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;
    const now = new Date();
    const slaDueAt = calculateSlaDueDate(inferred.priority, now);

    // --- Create ticket ---
    const [newTicket] = await itsmDb("tickets")
      .insert({
        tenant_id: tenantId,
        ticket_number: ticketNumber,
        requester_id: finalRequesterId,
        group_id: groupId || null,
        agent_user_id: agentUserId || null,
        project_context_id: projectContextId,
        project_code: projectCode,
        ticket_type: inferred.ticketType,
        subject: inferred.subject,
        description: inferred.description,
        priority: inferred.priority,
        impact: "medium",
        urgency: "medium",
        status: "new",
        source: "portal",
        attachments: JSON.stringify([
          {
            originalName: file.name,
            mimeType,
            fileSizeBytes: file.size,
            uploadedAt: now.toISOString(),
            // storedPath filled below after save
          },
        ]),
        first_seen_at: now.toISOString(),
      })
      .returning("*");

    // --- Save attachment to disk, update ticket ---
    try {
      const savedMeta = await saveTicketAttachment(
        newTicket.id,
        file.name,
        mimeType,
        buffer
      );

      await itsmDb("tickets")
        .where("id", newTicket.id)
        .update({
          attachments: JSON.stringify([
            {
              id: savedMeta.id,
              originalName: savedMeta.originalName,
              storedFileName: savedMeta.storedFileName,
              filePath: savedMeta.filePath,
              fileSizeBytes: savedMeta.fileSizeBytes,
              mimeType: savedMeta.mimeType,
              uploadedAt: savedMeta.uploadedAt,
            },
          ]),
        });
    } catch (saveErr) {
      console.error("Attachment save failed (non-fatal):", saveErr);
    }

    // --- PMT notification ---
    if (projectCode) {
      notifyAsync(
        events.ticketLinked(
          projectCode,
          newTicket.id,
          ticketNumber,
          inferred.subject,
          null
        )
      );
    }

    return NextResponse.json(
      {
        message: "Ticket auto-generated from attachment",
        ticket: { ...newTicket, slaDueAt },
        inferred,
        fileName: file.name,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Auto-generate ticket failed:", error);
    return NextResponse.json(
      { error: error.message || "Failed to auto-generate ticket" },
      { status: 500 }
    );
  }
}

