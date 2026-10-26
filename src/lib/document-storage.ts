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
const UPLOAD_ROOT = path.join(process.cwd(), "uploads", "project-documents");

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
