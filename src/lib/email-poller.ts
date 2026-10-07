/**
 * Email-to-Ticket Poller
 * ──────────────────────
 * Connects to an IMAP mailbox (Microsoft 365 / Gmail via IMAP),
 * fetches UNSEEN messages, parses them, creates ITSM tickets, and
 * saves any attachments to disk.
 *
 * Environment variables required:
 *   IMAP_HOST         — IMAP hostname  (e.g. outlook.office365.com)
 *   IMAP_PORT         — typically 993 (TLS)
 *   IMAP_USER         — mailbox address (e.g. support@acceleron.in)
 *   IMAP_PASS         — app password / OAuth2 token
 *   IMAP_MAILBOX      — folder to watch, default "INBOX"
 *   IMAP_TLS          — "true" (default) | "false"
 *   IMAP_MARK_READ    — "true" (default) | "false"
 *   IMAP_MAX_PER_RUN  — max emails to process per sweep (default 25)
 */

import { ImapFlow } from "imapflow";
import { simpleParser, type ParsedMail, type Attachment } from "mailparser";
import { itsmDb, identityDb } from "@/lib/db";
import { calculateSlaDueDate } from "@/lib/itsm-engine";
import { notifyAsync, events } from "@/lib/notifications";
import {
  saveTicketAttachment,
  inferTicketFieldsFromText,
  ALLOWED_ATTACHMENT_MIME_TYPES,
} from "@/lib/ticket-attachment-storage";

const DEFAULT_TENANT = "8434da2c-a300-433f-83fd-57249690ad09";

// ─── Config helpers ──────────────────────────────────────────────────

function getImapConfig() {
  const host = process.env.IMAP_HOST;
  const user = process.env.IMAP_USER;
  const pass = process.env.IMAP_PASS;

  if (!host || !user || !pass) {
    throw new Error(
      "IMAP not configured. Set IMAP_HOST, IMAP_USER, IMAP_PASS in .env.local"
    );
  }

  return {
    host,
    port: parseInt(process.env.IMAP_PORT || "993", 10),
    secure: process.env.IMAP_TLS !== "false", // default true
    auth: { user, pass },
    logger: false as const,
    tls: { rejectUnauthorized: false }, // some corp certs are self-signed
  };
}

// ─── Requester resolution ─────────────────────────────────────────────

async function resolveRequester(
  fromEmail: string,
  fromName: string,
  tenantId: string
): Promise<string | null> {
  const email = fromEmail.toLowerCase().trim();

  // Try existing requester
  const existing = await itsmDb("requesters")
    .where("email", email)
    .first()
    .catch(() => null);
  if (existing) return existing.id;

  // Try identity users
  const user = await identityDb("users")
    .whereRaw("LOWER(email) = ?", [email])
    .first()
    .catch(() => null);

  const names = (fromName || email).trim().split(" ");
  const firstName = names[0] || email;
  const lastName = names.slice(1).join(" ") || "";

  // Auto-create requester
  const [newReq] = await itsmDb("requesters")
    .insert({
      id: user?.id || undefined,
      tenant_id: tenantId,
      email,
      first_name: firstName,
      last_name: lastName,
      company_id: "02479f1a-1032-442f-a8c4-22cb93afbd6e",
      is_active: true,
      source_system: "darwinbox",
    })
    .returning("id")
    .catch(() => [null]);

  return newReq?.id || null;
}

// ─── Ticket field extraction ──────────────────────────────────────────

function extractEmailText(parsed: ParsedMail): string {
  // Prefer plain text; fall back to stripped HTML
  if (parsed.text && parsed.text.trim().length > 10) {
    return parsed.text.trim().slice(0, 8000);
  }
  if (parsed.html) {
    const stripped = parsed.html
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim();
    return stripped.slice(0, 8000);
  }
  return "";
}

function buildSubject(parsed: ParsedMail): string {
  const raw = parsed.subject || "";
  // Strip common reply/forward prefixes
  const cleaned = raw.replace(/^(re:|fwd?:|fw:)\s*/gi, "").trim();
  return cleaned.slice(0, 120) || "[No Subject]";
}

// ─── Thread-matching ──────────────────────────────────────────────────

async function findExistingTicketForThread(
  messageId: string | null,
  inReplyTo: string | null,
  references: string[],
  tenantId: string
): Promise<{ ticketId: string; ticketNumber: string } | null> {
  const ids = [messageId, inReplyTo, ...references].filter(Boolean) as string[];
  if (ids.length === 0) return null;

  const existing = await itsmDb("emails")
    .where("tenant_id", tenantId)
    .whereIn("graph_message_id", ids)
    .first()
    .catch(() => null);

  if (existing?.ticket_id) {
    return { ticketId: existing.ticket_id, ticketNumber: existing.ticket_number };
  }
  return null;
}

// ─── Core: process a single parsed email ─────────────────────────────

export interface ProcessEmailResult {
  action: "created" | "appended" | "skipped";
  ticketId?: string;
  ticketNumber?: string;
  subject?: string;
  reason?: string;
}

export async function processEmailMessage(
  parsed: ParsedMail,
  tenantId = DEFAULT_TENANT
): Promise<ProcessEmailResult> {
  // Extract sender
  const fromAddr = parsed.from?.value?.[0];
  if (!fromAddr?.address) {
    return { action: "skipped", reason: "No sender address" };
  }

  const fromEmail = fromAddr.address;
  const fromName = fromAddr.name || fromEmail;
  const messageId = parsed.messageId || null;
  const inReplyTo = parsed.inReplyTo || null;
  const references = (parsed.references as string[] | string | undefined)
    ? Array.isArray(parsed.references)
      ? (parsed.references as string[])
      : [parsed.references as string]
    : [];

  // Thread matching — append to existing ticket if reply
  const existingThread = await findExistingTicketForThread(
    messageId,
    inReplyTo,
    references,
    tenantId
  );

  if (existingThread) {
    // Append as email activity entry
    await itsmDb("emails")
      .insert({
        tenant_id: tenantId,
        ticket_id: existingThread.ticketId,
        ticket_number: existingThread.ticketNumber,
        direction: "inbound",
        sender: fromEmail,
        recipients: JSON.stringify(
          (Array.isArray(parsed.to) ? parsed.to : parsed.to ? [parsed.to] : [])
            .flatMap((a: any) => a.value || [])
            .map((t: any) => t.address)
        ),
        subject: buildSubject(parsed),
        body: extractEmailText(parsed).slice(0, 4000),
        graph_message_id: messageId,
      })
      .catch(() => null);

    return {
      action: "appended",
      ticketId: existingThread.ticketId,
      ticketNumber: existingThread.ticketNumber,
    };
  }

  // --- New ticket ---
  const emailText = extractEmailText(parsed);
  const subject = buildSubject(parsed);

  // Infer fields from subject + body combined
  const combinedText = subject + "\n\n" + emailText;
  const inferred = inferTicketFieldsFromText(combinedText, subject);

  // Use subject directly as subject (overrides line-extraction logic)
  inferred.subject = subject;

  // Resolve requester
  const requesterId = await resolveRequester(fromEmail, fromName, tenantId);

  // Ticket number
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

  // Create ticket
  const [newTicket] = await itsmDb("tickets")
    .insert({
      tenant_id: tenantId,
      ticket_number: ticketNumber,
      requester_id: requesterId,
      ticket_type: inferred.ticketType,
      subject: inferred.subject,
      description: inferred.description || emailText.slice(0, 1500),
      priority: inferred.priority,
      impact: "medium",
      urgency: "medium",
      status: "new",
      source: "email",
      attachments: "[]",
      sla_due_at: slaDueAt,
      first_seen_at: parsed.date?.toISOString() || now.toISOString(),
    })
    .returning("*");

  // Record the inbound email for thread tracking
  await itsmDb("emails")
    .insert({
      tenant_id: tenantId,
      ticket_id: newTicket.id,
      ticket_number: ticketNumber,
      direction: "inbound",
      sender: fromEmail,
      recipients: JSON.stringify(
        (Array.isArray(parsed.to) ? parsed.to : parsed.to ? [parsed.to] : [])
          .flatMap((a: any) => a.value || [])
          .map((t: any) => t.address)
      ),
      subject,
      body: emailText.slice(0, 4000),
      graph_message_id: messageId,
    })
    .catch(() => null);

  // Save attachments to disk
  const savedAttachments: any[] = [];
  const emailAttachments: Attachment[] = parsed.attachments || [];

  for (const att of emailAttachments) {
    const mimeType = att.contentType || "application/octet-stream";
    if (!ALLOWED_ATTACHMENT_MIME_TYPES[mimeType]) continue; // skip unsupported
    if (!att.content || att.size > 20 * 1024 * 1024) continue;

    try {
      const buffer = Buffer.isBuffer(att.content)
        ? att.content
        : Buffer.from(att.content);
      const meta = await saveTicketAttachment(
        newTicket.id,
        att.filename || "attachment",
        mimeType,
        buffer
      );
      savedAttachments.push(meta);
    } catch (saveErr) {
      console.error("Failed to save attachment:", saveErr);
    }
  }

  // Update attachments column
  if (savedAttachments.length > 0) {
    await itsmDb("tickets")
      .where("id", newTicket.id)
      .update({ attachments: JSON.stringify(savedAttachments) });
  }

  // PMT notification if project-linked (future: parse project code from subject)
  const projectMatch = subject.match(/\[([A-Z]{2,8}-\d{4})\]/);
  if (projectMatch) {
    notifyAsync(
      events.ticketLinked(
        projectMatch[1],
        newTicket.id,
        ticketNumber,
        inferred.subject,
        null
      )
    );
  }

  return {
    action: "created",
    ticketId: newTicket.id,
    ticketNumber,
    subject: inferred.subject,
  };
}

// ─── Main poller: connect to IMAP, sweep unseen ──────────────────────

export interface PollerRunResult {
  processed: number;
  created: number;
  appended: number;
  skipped: number;
  errors: number;
  details: ProcessEmailResult[];
}

export async function runEmailPoller(tenantId = DEFAULT_TENANT): Promise<PollerRunResult> {
  const config = getImapConfig();
  const mailbox = process.env.IMAP_MAILBOX || "INBOX";
  const markRead = process.env.IMAP_MARK_READ !== "false"; // default true
  const maxPerRun = parseInt(process.env.IMAP_MAX_PER_RUN || "25", 10);

  const result: PollerRunResult = {
    processed: 0,
    created: 0,
    appended: 0,
    skipped: 0,
    errors: 0,
    details: [],
  };

  const client = new ImapFlow(config);

  try {
    await client.connect();

    const lock = await client.getMailboxLock(mailbox);
    try {
      // Find all unseen messages
      const searchResult = await client.search({ seen: false });
      const unseenUids: number[] = Array.isArray(searchResult) ? searchResult : [];
      const uidsToProcess = unseenUids.slice(0, maxPerRun);

      if (uidsToProcess.length === 0) {
        return result; // Nothing new
      }

      // Fetch messages
      for await (const msg of client.fetch(
        uidsToProcess.length ? uidsToProcess.join(",") : "1:0",
        { source: true, uid: true }
      )) {
        try {
          if (!msg.source) continue;
          const parsed = await simpleParser(msg.source as Buffer);
          const res = await processEmailMessage(parsed, tenantId);
          result.processed++;
          result.details.push(res);

          if (res.action === "created") result.created++;
          else if (res.action === "appended") result.appended++;
          else result.skipped++;

          // Mark as read
          if (markRead && msg.uid) {
            await client.messageFlagsAdd({ uid: msg.uid }, ["\\Seen"]);
          }
        } catch (msgErr) {
          console.error("Error processing email message:", msgErr);
          result.errors++;
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }

  return result;
}