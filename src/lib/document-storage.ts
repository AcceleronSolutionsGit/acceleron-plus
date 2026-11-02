// ═══════════════════════════════════════════════════════════════
// Document Storage Service
// Handles file save/read/delete on local disk.
// Swap `save` and `resolve` for S3/Azure Blob by updating
// these two functions — the API routes don't change.
// ═══════════════════════════════════════════════════════════════

import path from "path";
import fs from "fs/promises";
import crypto from "crypto";

// Base storage directory (outside /public — never publicly accessible)
export const UPLOAD_ROOT = path.join(process.cwd(), "uploads", "project-documents");

// Max file size: 50 MB
export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

// Allowed MIME types
export const ALLOWED_MIME_TYPES: Record<string, string> = {
  "application/pdf":                                                     "pdf",
  "application/msword":                                                  "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel":                                            "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":  "xlsx",
  "application/vnd.ms-powerpoint":                                       "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "text/plain":                                                          "txt",
  "text/csv":                                                            "csv",
  "image/png":                                                           "png",
  "image/jpeg":                                                          "jpg",
  "image/jpg":                                                           "jpg",
  "image/gif":                                                           "gif",
  "image/webp":                                                          "webp",
  "application/zip":                                                     "zip",
  "application/x-zip-compressed":                                        "zip",
};

export const EXTENSION_MIME_MAP: Record<string, string> = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".zip": "application/zip",
};

export function resolveMimeType(fileName: string, detectedMime?: string | null): string | null {
  if (detectedMime && ALLOWED_MIME_TYPES[detectedMime]) {
    return detectedMime;
  }
  const ext = path.extname(fileName).toLowerCase();
  if (ext && EXTENSION_MIME_MAP[ext]) {
    return EXTENSION_MIME_MAP[ext];
  }
  return null;
}

export interface SavedFile {
  storedFileName: string;
  filePath: string;       // relative path from UPLOAD_ROOT
  fileSizeBytes: number;
  mimeType: string;
  checksumSha256: string;
}

/** Ensure the project's upload directory exists. */
async function ensureProjectDir(projectId: string): Promise<string> {
  const dir = path.join(UPLOAD_ROOT, projectId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/** Save a file buffer to disk. Returns stored metadata. */
export async function saveDocument(
  projectId: string,
  originalFileName: string,
  mimeType: string,
  buffer: Buffer
): Promise<SavedFile> {
  if (buffer.byteLength > MAX_FILE_SIZE_BYTES) {
    throw new Error(`File exceeds max size of ${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB`);
  }
  const effectiveMime = resolveMimeType(originalFileName, mimeType);
  if (!effectiveMime || !ALLOWED_MIME_TYPES[effectiveMime]) {
    throw new Error(`File type '${mimeType}' is not allowed`);
  }

  const ext = path.extname(originalFileName) || `.${ALLOWED_MIME_TYPES[effectiveMime]}`;
  const uniqueId = crypto.randomUUID();
  const storedFileName = `${uniqueId}${ext}`;
  const dir = await ensureProjectDir(projectId);
  const absPath = path.join(dir, storedFileName);
  const relativePath = path.join(projectId, storedFileName);

  await fs.writeFile(absPath, buffer);

  const checksum = crypto.createHash("sha256").update(buffer).digest("hex");

  return {
    storedFileName,
    filePath: relativePath,
    fileSizeBytes: buffer.byteLength,
    mimeType: effectiveMime,
    checksumSha256: checksum,
  };
}

/** Read a stored document as a Buffer. */
export async function readDocument(filePath: string): Promise<Buffer> {
  const absPath = path.join(UPLOAD_ROOT, filePath);
  return fs.readFile(absPath);
}

/** Delete a stored document from disk. */
export async function deleteDocument(filePath: string): Promise<void> {
  try {
    const absPath = path.join(UPLOAD_ROOT, filePath);
    await fs.unlink(absPath);
  } catch {
    // Non-fatal: file may already be gone
  }
}

/** Human-readable file size (e.g. "2.4 MB") */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Generate a minimal valid PDF placeholder buffer for missing seed/demo documents */
export function generatePlaceholderDocument(
  title?: string,
  fileName?: string,
  docType?: string,
  version?: string
): Buffer {
  const cleanTitle = (title || "Document").replace(/[()\\]/g, "");
  const cleanFileName = (fileName || "document.pdf").replace(/[()\\]/g, "");
  const cleanType = (docType || "General").replace(/[()\\]/g, "");
  const cleanVersion = (version || "1.0").replace(/[()\\]/g, "");

  const stream =
    "BT\n/F1 18 Tf\n50 720 Td\n(" +
    cleanTitle +
    ") Tj\n/F1 12 Tf\n0 -30 Td\n(File: " +
    cleanFileName +
    ") Tj\n0 -20 Td\n(Type: " +
    cleanType +
    " | Version: " +
    cleanVersion +
    ") Tj\n0 -20 Td\n(Acceleron Plus Document Management) Tj\nET";
  const streamLen = Buffer.byteLength(stream, "utf-8");

  let out = "%PDF-1.4\n";
  const offsets: number[] = [];

  offsets.push(Buffer.byteLength(out, "utf-8"));
  out += "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n";

  offsets.push(Buffer.byteLength(out, "utf-8"));
  out += "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n";

  offsets.push(Buffer.byteLength(out, "utf-8"));
  out +=
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n";

  offsets.push(Buffer.byteLength(out, "utf-8"));
  out += "4 0 obj\n<< /Length " + streamLen + " >>\nstream\n" + stream + "\nendstream\nendobj\n";

  offsets.push(Buffer.byteLength(out, "utf-8"));
  out += "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n";

  const startxref = Buffer.byteLength(out, "utf-8");
  out += "xref\n0 6\n0000000000 65535 f \n";
  for (const off of offsets) {
    out += String(off).padStart(10, "0") + " 00000 n \n";
  }
  out += "trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n" + startxref + "\n%%EOF\n";
  return Buffer.from(out, "utf-8");
}
