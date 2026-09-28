import { NextResponse } from "next/server";
import { itsmDb, identityDb } from "@/lib/db";
import { calculateSlaDueDate, autoAssignTicket } from "@/lib/itsm-engine";
import crypto from "crypto";

import { getTickets } from "@/lib/api";
import { notifyAsync, events } from "@/lib/notifications";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const phase = searchParams.get("phase") || undefined;
    const projectCode = searchParams.get("projectCode") || searchParams.get("project_code") || undefined;
    const tickets = await getTickets({ phase, projectCode });
    return NextResponse.json({ tickets }, { status: 200 });
  } catch (error) {
    console.error("Failed to fetch tickets:", error);
    return NextResponse.json({ error: "Failed to fetch tickets" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const DEFAULT_ITSM_TENANT = "8434da2c-a300-433f-83fd-57249690ad09";
    const tenantId =
      body.tenantId && body.tenantId !== "acceleron"
        ? body.tenantId
        : DEFAULT_ITSM_TENANT;

    const {
      requesterId,
      ticketType = "incident",
      subject,
      description,
      priority = "medium",
      impact = "medium",
      urgency = "medium",
      groupId,
      companyId,
      departmentId,
      categoryId,
      subCategoryId,
      itemId,
      impactAreaId,
      agentUserId,
      projectContextId,
      projectCode,
      attachments,
      source: rawSource = "portal",
      messageId, // for email thread matching (REQ-INT-02)
      threadRef, // for email thread matching
    } = body;

    const ALLOWED_SOURCES = ['email', 'phone', 'portal', 'walk_up', 'workplace', 'chat', 'ms_teams', 'aws_cloudwatch'];
    const source = ALLOWED_SOURCES.includes(rawSource) ? rawSource : "portal";

    // --- Automatically take the user ID for requester ---
    let finalRequesterId = requesterId || null;
    if (!finalRequesterId) {
      try {
        const cookieHeader = req.headers.get("cookie") || "";
        const match = cookieHeader.match(/acceleron_session=([^;]+)/);
        if (match) {
          const sessionVal = decodeURIComponent(match[1]);
          const session = JSON.parse(sessionVal);
          const candidateId = session.userId || session.id;
          const candidateEmail = session.email;
          if (candidateId) {
            const reqUser = await itsmDb("requesters").where("id", candidateId).first();
            if (reqUser) {
              finalRequesterId = reqUser.id;
            } else if (candidateEmail) {
              const reqByEmail = await itsmDb("requesters").where("email", candidateEmail).first();
              if (reqByEmail) {
                finalRequesterId = reqByEmail.id;
              }
            }
          }
        }
      } catch (err) {
        console.error("Auto requester lookup failed:", err);
      }
    }

    // Ensure finalRequesterId exists in requesters table to prevent FK violation
    if (finalRequesterId) {
      const exists = await itsmDb("requesters").where("id", finalRequesterId).first();
      if (!exists) {
        const userRec = await identityDb("users").where("id", finalRequesterId).first();
        if (userRec) {
          const names = (userRec.full_name || "User").trim().split(" ");
          await itsmDb("requesters").insert({
            id: userRec.id,
            tenant_id: tenantId,
            email: userRec.email,
            first_name: names[0] || "User",
            last_name: names.slice(1).join(" ") || "",
            company_id: companyId || "02479f1a-1032-442f-a8c4-22cb93afbd6e",
            is_active: true,
            source_system: "darwinbox",
          });
        }
      }
    }

    // Resolve projectContextId and projectCode
    let finalProjectContextId = projectContextId || null;
    let finalProjectCode = projectCode || null;

    if (finalProjectCode && !finalProjectContextId) {
      const pCtx = await itsmDb("project_contexts")
        .where("project_code", finalProjectCode)
        .first();
      if (pCtx) {
        finalProjectContextId = pCtx.id;
      }
    } else if (finalProjectContextId && !finalProjectCode) {
      const pCtx = await itsmDb("project_contexts")
        .where("id", finalProjectContextId)
        .first();
      if (pCtx) {
        finalProjectCode = pCtx.project_code;
      }
    }

    // --- REQ-INT-02: Email Thread Matching ---
    if (source === "email" && (messageId || threadRef)) {
      // Look for an existing email with this thread ref
      const existingEmail = await itsmDb("emails")
        .where("tenant_id", tenantId)
        .andWhere(function() {
          if (messageId) this.where("graph_message_id", messageId);
          if (threadRef) this.orWhereRaw("? = ANY(thread_refs)", [threadRef]);
        })
        .first();

      if (existingEmail && existingEmail.ticket_id) {
        // Append as a comment instead of creating a new ticket
        const [newEmail] = await itsmDb("emails")
          .insert({
            tenant_id: tenantId,
            ticket_id: existingEmail.ticket_id,
            ticket_number: existingEmail.ticket_number,
          });
        
        return NextResponse.json({
          message: "Appended to existing ticket thread",
          ticketId: existingEmail.ticket_id,
          ticketNumber: existingEmail.ticket_number,
          emailEntry: newEmail
        }, { status: 200 });
      }
    }

    // --- REQ-INT-01: Create New Ticket ---
    
    // Generate a new ticket number
    const prefix = ticketType === "service_request" ? "SR" : ticketType === "problem" ? "PRB" : ticketType === "query" ? "QRY" : "INC";
    const ticketNumber = `${prefix}-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;
    const now = new Date();
    
    // Compute SLA (REQ-SLA-01)
    const slaDueAt = calculateSlaDueDate(priority, now);

    // Insert into DB
    const [newTicket] = await itsmDb("tickets")
      .insert({
        tenant_id: tenantId,
        ticket_number: ticketNumber,
        requester_id: finalRequesterId,
        company_id: companyId || null,
        department_id: departmentId || null,
        group_id: groupId || null,
        category_id: categoryId || null,
        sub_category_id: subCategoryId || null,
        item_id: itemId || null,
        impact_area_id: impactAreaId || null,
        agent_user_id: agentUserId || null,
        project_context_id: finalProjectContextId,
        project_code: finalProjectCode,
        ticket_type: ticketType,
        subject,
        description,
        priority,
        impact,
        urgency,
        status: "new",
        source,
        attachments: attachments ? JSON.stringify(attachments) : null,
        first_seen_at: now.toISOString(),
      })
      .returning("*");

    // --- REQ-ASN-01: Auto-Assignment Engine ---
    if (groupId) {
      // Fire and forget auto-assignment
      autoAssignTicket(newTicket.id, groupId, tenantId).catch(console.error);
    }

    // Surface the new ticket to the project manager in PMT.
    if (finalProjectCode) {
      const phase = finalProjectContextId
        ? (
            await itsmDb("project_contexts")
              .where("id", finalProjectContextId)
              .select("current_phase")
              .first()
              .catch(() => null)
          )?.current_phase ?? null
        : null;

      notifyAsync(
        events.ticketLinked(finalProjectCode, newTicket.id, ticketNumber, subject, phase)
      );
    }

    return NextResponse.json({
      message: "Ticket created successfully",
      ticket: { ...newTicket, slaDueAt }
    }, { status: 201 });

  } catch (error: any) {
    console.error("Failed to create ticket:", error);
    return NextResponse.json({ error: error.message || "Failed to create ticket" }, { status: 500 });
  }
}
