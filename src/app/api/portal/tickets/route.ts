// Public API: submit a ticket without authentication
// POST /api/portal/tickets  (multipart/form-data OR application/json)

import { NextRequest, NextResponse } from "next/server";
import { itsmDb } from "@/lib/db";
import { saveDocument, ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES } from "@/lib/document-storage";
import crypto from "crypto";
import path from "path";
import fs from "fs/promises";

const DEFAULT_TENANT = "8434da2c-a300-433f-83fd-57249690ad09";
const DEFAULT_COMPANY = "02479f1a-1032-442f-a8c4-22cb93afbd6e";

// Uploads go to uploads/portal-tickets/<ticketId>/
const PORTAL_UPLOAD_DIR = path.join(process.cwd(), "uploads", "portal-tickets");

async function savePortalFile(ticketId: string, fileName: string, mimeType: string, buffer: Buffer) {
  const dir = path.join(PORTAL_UPLOAD_DIR, ticketId);
  await fs.mkdir(dir, { recursive: true });
  const ext = path.extname(fileName) || `.${ALLOWED_MIME_TYPES[mimeType] ?? "bin"}`;
  const storedName = `${crypto.randomUUID()}${ext}`;
  await fs.writeFile(path.join(dir, storedName), buffer);
  return { storedName, relativePath: path.join(ticketId, storedName), mimeType, fileSizeBytes: buffer.byteLength };
}

export async function POST(req: NextRequest) {
  try {
    // Accept both JSON and multipart (for file uploads)
    const contentType = req.headers.get("content-type") ?? "";
    let name = "", email = "", subject = "", description = "",
        priority = "medium", ticketType = "service_request";
    const fileBuffers: { name: string; type: string; buffer: Buffer }[] = [];

    if (contentType.includes("multipart/form-data")) {
      const fd = await req.formData();
      name        = String(fd.get("name") ?? "");
      email       = String(fd.get("email") ?? "");
      subject     = String(fd.get("subject") ?? "");
      description = String(fd.get("description") ?? "");
      priority    = String(fd.get("priority") ?? "medium");
      ticketType  = String(fd.get("ticketType") ?? "service_request");

      for (const [, val] of fd.entries()) {
        if (val instanceof File && val.size > 0) {
          if (val.size > MAX_FILE_SIZE_BYTES) {
            return NextResponse.json({ error: `File "${val.name}" exceeds the 50 MB limit.` }, { status: 400 });
          }
          if (!ALLOWED_MIME_TYPES[val.type]) {
            return NextResponse.json({ error: `File type "${val.type}" is not allowed.` }, { status: 400 });
          }
          fileBuffers.push({ name: val.name, type: val.type, buffer: Buffer.from(await val.arrayBuffer()) });
        }
      }
    } else {
      const body = await req.json();
      ({ name = "", email = "", subject = "", description = "",
         priority = "medium", ticketType = "service_request" } = body);
    }

    if (!name.trim() || !email.trim() || !subject.trim()) {
      return NextResponse.json({ error: "Name, email and subject are required." }, { status: 400 });
    }

    // Find or create requester
    let requester = await itsmDb("requesters").where("email", email.toLowerCase().trim()).first();
    if (!requester) {
      const [newReq] = await itsmDb("requesters").insert({
        tenant_id: DEFAULT_TENANT,
        email: email.toLowerCase().trim(),
        first_name: name.trim().split(" ")[0],
        last_name: name.trim().split(" ").slice(1).join(" ") || "",
        company_id: DEFAULT_COMPANY,
        is_active: true,
      }).returning("*");
      requester = newReq;
    }

    const ticketPrefix = ticketType === "service_request" ? "SR"
      : ticketType === "incident" ? "INC"
      : ticketType === "change_request" ? "CHG"
      : "QRY";
    const ticketNumber = `${ticketPrefix}-${new Date().getFullYear()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

    // Create ticket (no auto-assign — the agent queue picks it up)
    const [ticket] = await itsmDb("tickets").insert({
      tenant_id:    DEFAULT_TENANT,
      ticket_number: ticketNumber,
      ticket_type:  ticketType,
      subject:      subject.trim(),
      description:  description.trim() || null,
      priority,
      impact:       "medium",
      urgency:      priority,
      status:       "new",
      source:       "portal",
      requester_id: requester.id,
      first_seen_at: new Date().toISOString(),
    }).returning("*");

    // Save attachments if any
    const savedFiles: string[] = [];
    for (const f of fileBuffers) {
      try {
        const saved = await savePortalFile(ticket.id, f.name, f.type, f.buffer);
        savedFiles.push(f.name);
        // Optionally record in ticket_attachments table if it exists
        await itsmDb("ticket_attachments").insert({
          ticket_id: ticket.id,
          file_name: f.name,
          stored_file_name: saved.storedName,
          file_path: saved.relativePath,
          mime_type: f.type,
          file_size_bytes: f.buffer.byteLength,
          uploaded_by_name: name,
        }).catch(() => null); // graceful if table doesn't exist yet
      } catch (fileErr) {
        console.warn("Attachment save failed:", fileErr);
      }
    }

    return NextResponse.json({
      success: true,
      ticketNumber: ticket.ticket_number,
      ticketId: ticket.id,
      attachments: savedFiles,
      message: "Your ticket has been submitted. Use your ticket number to track progress.",
    }, { status: 201 });

  } catch (err) {
    console.error("Portal ticket creation error:", err);
    return NextResponse.json({ error: "Failed to submit ticket. Please try again." }, { status: 500 });
  }
}
