// ═══════════════════════════════════════════════════════════════
// Signed session cookie — Edge + Node compatible.
//
// The cookie is `base64url(payload).base64url(hmac-sha256)`.
// Because it is signed with SESSION_SECRET, a user cannot edit
// their own role/tenant and have the server believe it.
//
// This module deliberately uses ONLY Web Crypto so that it can be
// imported from middleware (Edge runtime) as well as route handlers.
// Do not import `db.ts`, `crypto` (node) or anything Node-only here.
// ═══════════════════════════════════════════════════════════════

import type { AppRole } from "./types";

export const SESSION_COOKIE = "acceleron_session";

/** How long a session stays valid, in seconds. */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8; // 8 hours

const DEV_FALLBACK_SECRET = "acceleron-dev-only-insecure-secret-change-me-32+";

export interface SessionPayload {
  userId: string;
  tenantId: string;
  email: string;
  fullName: string;
  roleCode: string;
  /** Normalised app-level role for route guards. */
  role: AppRole;
  /** Issued-at, epoch seconds. */
  iat: number;
  /** Expires-at, epoch seconds. */
  exp: number;
  /** Random session id — lets us revoke a single session server-side. */
  jti: string;
}

// ─── Secret ────────────────────────────────────────────────────────

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 32) return secret;

  // Same reasoning as db.ts: a build has no secrets, and proxy.ts imports
  // this module, so the build would fail before the app ever runs.
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build") {
    throw new Error(
      "SESSION_SECRET is missing or shorter than 32 characters. " +
        "Generate one with:  node -e \"console.log(require('crypto').randomBytes(48).toString('base64url'))\""
    );
  }

  if (secret && secret.length < 32) {
    console.warn(
      "[auth] SESSION_SECRET is shorter than 32 characters — using it anyway in development, but set a longer one before deploying."
    );
    return secret;
  }

  return DEV_FALLBACK_SECRET;
}

// ─── base64url helpers ─────────────────────────────────────────────

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToB64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ─── HMAC ──────────────────────────────────────────────────────────

async function sign(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return bytesToB64Url(new Uint8Array(signature));
}

/** Length-safe, constant-time string comparison. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ─── Public API ────────────────────────────────────────────────────

export interface SessionSeed {
  userId: string;
  tenantId: string;
  email: string;
  fullName: string;
  roleCode: string;
  role: AppRole;
}

/** Build a signed cookie value for a freshly authenticated user. */
export async function createSessionCookie(seed: SessionSeed): Promise<{ value: string; payload: SessionPayload }> {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    ...seed,
    iat: now,
    exp: now + SESSION_MAX_AGE_SECONDS,
    jti: bytesToB64Url(crypto.getRandomValues(new Uint8Array(16))),
  };

  const body = bytesToB64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await sign(body);
  return { value: `${body}.${signature}`, payload };
}

/**
 * Verify a cookie value and return its payload.
 * Returns null when the signature is wrong, the cookie is malformed,
 * or the session has expired. Never throws on bad input.
 */
export async function verifySessionCookie(value: string | undefined | null): Promise<SessionPayload | null> {
  if (!value) return null;

  const separator = value.lastIndexOf(".");
  if (separator <= 0) return null;

  const body = value.slice(0, separator);
  const signature = value.slice(separator + 1);

  let expected: string;
  try {
    expected = await sign(body);
  } catch {
    return null;
  }
  if (!timingSafeEqual(signature, expected)) return null;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(decoder.decode(b64UrlToBytes(body)));
  } catch {
    return null;
  }

  if (typeof payload?.userId !== "string" || typeof payload?.exp !== "number") return null;
  if (payload.exp * 1000 <= Date.now()) return null;

  return payload;
}

/** Map a roles-table code onto the coarse app role used by route guards. */
export function deriveAppRole(roleCode: string | undefined | null): AppRole {
  switch (roleCode?.toLowerCase()) {
    case "admin":
    case "super_admin":
    case "tenant_admin":
      return "admin";
    case "pm":
    case "project_manager":
    case "delivery_manager":
      return "pm";
    case "client":
    case "customer":
      return "client";
    default:
      return "member";
  }
}

/** Cookie options shared by login and logout. */
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};
