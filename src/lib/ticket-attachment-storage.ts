// ═══════════════════════════════════════════════════════════════
// Ticket Attachment Storage Service
// Handles file save/read/delete for ITSM ticket attachments.
// Attachments are stored under uploads/ticket-attachments/<ticketId>/
// ═══════════════════════════════════════════════════════════════

import path from "path";
import fs from "fs/promises";
import crypto from "crypto";

const UPLOAD_ROOT = path.join(process.cwd(), "uploads", "ticket-attachments");

export const MAX_ATTACHMENT_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

export const ALLOWED_ATTACHMENT_MIME_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "text/plain": "txt",
  "text/csv": "csv",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

export interface TicketAttachmentMeta {
  id: string;
  originalName: string;
  storedFileName: string;
  filePath: string;       // relative path from UPLOAD_ROOT
  fileSizeBytes: number;
  mimeType: string;
  uploadedAt: string;
}

async function ensureTicketDir(ticketId: string): Promise<string> {
  const dir = path.join(UPLOAD_ROOT, ticketId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/** Save an attachment buffer to disk. Returns stored metadata. */
export async function saveTicketAttachment(
  ticketId: string,
  originalName: string,
  mimeType: string,
  buffer: Buffer
): Promise<TicketAttachmentMeta> {
  if (buffer.byteLength > MAX_ATTACHMENT_SIZE_BYTES) {
    throw new Error(`File exceeds maximum size of ${MAX_ATTACHMENT_SIZE_BYTES / 1024 / 1024} MB`);
  }

  const ext = path.extname(originalName) || `.${ALLOWED_ATTACHMENT_MIME_TYPES[mimeType] ?? "bin"}`;
  const id = crypto.randomUUID();
  const storedFileName = `${id}${ext}`;
  const dir = await ensureTicketDir(ticketId);
  const absPath = path.join(dir, storedFileName);
  const relativePath = ticketId + "/" + storedFileName;

  await fs.writeFile(absPath, buffer);

  return {
    id,
    originalName,
    storedFileName,
    filePath: relativePath,
    fileSizeBytes: buffer.byteLength,
    mimeType,
    uploadedAt: new Date().toISOString(),
  };
}

/** Read a stored attachment as a Buffer. */
export async function readTicketAttachment(filePath: string): Promise<Buffer> {
  const absPath = path.join(UPLOAD_ROOT, filePath);
  return fs.readFile(absPath);
}

/** Delete a stored attachment from disk. */
export async function deleteTicketAttachment(filePath: string): Promise<void> {
  try {
    const absPath = path.join(UPLOAD_ROOT, filePath);
    await fs.unlink(absPath);
  } catch {
    // Non-fatal
  }
}

/**
 * Extract readable text from a file buffer for AI-assisted ticket generation.
 * Handles plain text and very basic PDF text extraction (text-based PDFs only).
 * For images, returns an empty string — the caller handles that gracefully.
 */
export async function extractTextFromBuffer(
  buffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<string> {
  // Plain text / CSV
  if (mimeType === "text/plain" || mimeType === "text/csv") {
    return buffer.toString("utf-8").slice(0, 8000);
  }

  // PDF — extract raw text stream content (works for text-based PDFs)
  if (mimeType === "application/pdf") {
    try {
      const raw = buffer.toString("latin1");
      const textBlocks: string[] = [];
      const btEtRegex = /BT([\s\S]*?)ET/g;
      let match: RegExpExecArray | null;
      while ((match = btEtRegex.exec(raw)) !== null) {
        const block = match[1];
        const strRegex = /\(((?:[^()\\]|\\[\s\S])*)\)\s*Tj/g;
        const arrRegex = /\[([^\]]+)\]\s*TJ/g;
        let sm: RegExpExecArray | null;
        while ((sm = strRegex.exec(block)) !== null) {
          const decoded = sm[1]
            .replace(/\\n/g, "\n")
            .replace(/\\r/g, "\r")
            .replace(/\\t/g, "\t")
            .replace(/\\\\/g, "\\")
            .replace(/\\(.)/g, "$1");
          textBlocks.push(decoded);
        }
        while ((sm = arrRegex.exec(block)) !== null) {
          const parts = sm[1].match(/\(([^)]*)\)/g) || [];
          textBlocks.push(parts.map((p: string) => p.slice(1, -1)).join(""));
        }
      }
      const text = textBlocks.join(" ").replace(/\s+/g, " ").trim();
      if (text.length > 20) return text.slice(0, 8000);
    } catch {
      // Fall through
    }
  }

  // Fallback: return the filename as the only hint
  return `[Attachment: ${fileName}]`;
}

/**
 * Given extracted text from an attachment, auto-infer ticket fields.
 * Returns suggested values — the caller decides what to persist.
 */
export function inferTicketFieldsFromText(rawText: string, fileName: string): {
  subject: string;
  description: string;
  priority: "low" | "medium" | "high" | "urgent";
  ticketType: "incident" | "service_request" | "problem" | "query";
} {
  const text = rawText.trim();
  const lower = text.toLowerCase();
  const fileBase = path.basename(fileName, path.extname(fileName)).replace(/[-_]/g, " ");

  // --- Priority inference ---
  let priority: "low" | "medium" | "high" | "urgent" = "medium";
  if (/\b(urgent|critical|emergency|production down|outage|p0|sev[-\s]?0|asap)\b/.test(lower)) {
    priority = "urgent";
  } else if (/\b(high|severe|blocker|blocked|p1|sev[-\s]?1)\b/.test(lower)) {
    priority = "high";
  } else if (/\b(low|minor|cosmetic|p3|p4|sev[-\s]?3|sev[-\s]?4)\b/.test(lower)) {
    priority = "low";
  }

  // --- Ticket type inference ---
  let ticketType: "incident" | "service_request" | "problem" | "query" = "incident";
  if (/\b(request|access request|provision|new user|install|setup|onboard)\b/.test(lower)) {
    ticketType = "service_request";
  } else if (/\b(problem|root cause|recurring|rca|permanent fix)\b/.test(lower)) {
    ticketType = "problem";
  } else if (/\b(query|question|clarification|how to|information requested)\b/.test(lower)) {
    ticketType = "query";
  }

  // --- Subject: first non-empty line or first sentence ---
  let subject = "";
  const lines = text.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);
  if (lines.length > 0) {
    for (const line of lines.slice(0, 5)) {
      if (line.length >= 8 && line.length <= 120) {
        subject = line;
        break;
      }
    }
  }
  if (!subject) {
    const sentMatch = text.match(/([^.!?\n]{8,120}[.!?])/);
    subject = sentMatch ? sentMatch[1].trim() : fileBase;
  }
  if (subject.length > 120) subject = subject.slice(0, 117) + "...";

  // --- Description: first 1500 chars ---
  const description = text.length > 1500 ? text.slice(0, 1497) + "..." : text;

  return { subject, description, priority, ticketType };
}

/** Human-readable file size */
export function formatAttachmentSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
