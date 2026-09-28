// ═══════════════════════════════════════════════════════════════
// One-time sign-in codes.
//
// A six-digit code is only a million possibilities, so the security
// comes from the constraints around it rather than the code itself:
//
//   • short life (5 minutes)
//   • a hard attempt cap per challenge, then the challenge is burned
//   • single use — a consumed challenge can never be replayed
//   • bound to the browser that asked, via an httpOnly cookie holding
//     a 256-bit challenge id, so knowing the code is not enough
//   • rate limited per account
//
// Codes are stored as an HMAC keyed with SESSION_SECRET, never in
// plain text. A leaked database therefore yields nothing usable
// without the application secret.
//
// Node-only.
// ═══════════════════════════════════════════════════════════════

import { createHmac, randomBytes, randomInt, timingSafeEqual } from "crypto";
import { identityDb } from "./db";
import {
  OTP_LENGTH,
  OTP_TTL_SECONDS,
  OTP_MAX_ATTEMPTS,
  OTP_MAX_PER_WINDOW,
  OTP_WINDOW_SECONDS,
  OTP_RESEND_COOLDOWN_SECONDS,
} from "./auth-config";

export interface OtpChallenge {
  id: string;
  user_id: string;
  email: string;
  code_hash: string;
  expires_at: Date | string;
  attempts: number;
  consumed_at: Date | string | null;
  last_sent_at: Date | string | null;
  created_at: Date | string;
}

// ─── Code generation & hashing ─────────────────────────────────────

/** A uniformly random numeric code. `randomInt` is rejection-sampled, so no modulo bias. */
export function generateOtp(length: number = OTP_LENGTH): string {
  let code = "";
  for (let i = 0; i < length; i++) code += randomInt(0, 10).toString();
  return code;
}

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (value && value.length >= 32) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be set before one-time codes can be issued.");
  }
  return "acceleron-dev-only-insecure-secret-change-me-32+";
}

/**
 * Hash a code for storage. The challenge id is mixed in, so the same
 * code issued to two challenges produces different hashes — a stolen
 * hash cannot be matched against another challenge.
 */
export function hashOtp(code: string, challengeId: string): string {
  return createHmac("sha256", secret()).update(`${challengeId}:${code}`).digest("hex");
}

function hashesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

// ─── Issuing ───────────────────────────────────────────────────────

export type IssueResult =
  | { ok: true; challengeId: string; code: string; expiresAt: Date }
  | { ok: false; reason: "rate_limited"; retryAfterSeconds: number };

/**
 * Create a challenge for a user and return the plaintext code once,
 * for delivery. The code is not recoverable afterwards.
 */
export async function issueOtp(userId: string, email: string): Promise<IssueResult> {
  const now = Date.now();

  // Too many codes for this account recently?
  const windowStart = new Date(now - OTP_WINDOW_SECONDS * 1000);
  const recent = await identityDb("login_otp_challenges")
    .where("user_id", userId)
    .andWhere("created_at", ">=", windowStart)
    .count("* as n")
    .first<{ n: string }>();

  if (Number(recent?.n ?? 0) >= OTP_MAX_PER_WINDOW) {
    return { ok: false, reason: "rate_limited", retryAfterSeconds: OTP_WINDOW_SECONDS };
  }

  // Any still-live challenge for this user is superseded.
  await identityDb("login_otp_challenges")
    .where("user_id", userId)
    .whereNull("consumed_at")
    .update({ consumed_at: new Date(now) });

  const challengeId = randomBytes(32).toString("base64url");
  const code = generateOtp();
  const expiresAt = new Date(now + OTP_TTL_SECONDS * 1000);

  await identityDb("login_otp_challenges").insert({
    id: challengeId,
    user_id: userId,
    email,
    code_hash: hashOtp(code, challengeId),
    expires_at: expiresAt,
    attempts: 0,
    last_sent_at: new Date(now),
    created_at: new Date(now),
  });

  return { ok: true, challengeId, code, expiresAt };
}

// ─── Resending ─────────────────────────────────────────────────────

export type ResendResult =
  | { ok: true; code: string; expiresAt: Date }
  | { ok: false; reason: "not_found" | "expired" | "consumed" | "cooldown"; retryAfterSeconds?: number };

/**
 * Issue a fresh code against the *same* challenge, so the browser
 * keeps its cookie. Rate limited by a cooldown.
 */
export async function resendOtp(challengeId: string): Promise<ResendResult> {
  const challenge = await identityDb("login_otp_challenges")
    .where("id", challengeId)
    .first<OtpChallenge | undefined>();

  if (!challenge) return { ok: false, reason: "not_found" };
  if (challenge.consumed_at) return { ok: false, reason: "consumed" };

  const lastSent = challenge.last_sent_at ? new Date(challenge.last_sent_at).getTime() : 0;
  const waited = (Date.now() - lastSent) / 1000;
  if (waited < OTP_RESEND_COOLDOWN_SECONDS) {
    return {
      ok: false,
      reason: "cooldown",
      retryAfterSeconds: Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - waited),
    };
  }

  const code = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000);

  await identityDb("login_otp_challenges").where("id", challengeId).update({
    code_hash: hashOtp(code, challengeId),
    expires_at: expiresAt,
    // A resend restarts the attempt budget; the old code is dead either way.
    attempts: 0,
    last_sent_at: new Date(),
  });

  return { ok: true, code, expiresAt };
}

// ─── Verifying ─────────────────────────────────────────────────────

export type VerifyResult =
  | { ok: true; userId: string; email: string }
  | {
      ok: false;
      reason: "not_found" | "expired" | "consumed" | "too_many_attempts" | "incorrect";
      attemptsLeft?: number;
    };

/**
 * Check a code against a challenge and consume the challenge on success.
 *
 * The challenge is consumed atomically — a conditional update that only
 * matches a row still marked unconsumed — so two requests racing with
 * the same valid code cannot both produce a session.
 */
export async function verifyOtp(challengeId: string, code: string): Promise<VerifyResult> {
  if (!challengeId || !code) return { ok: false, reason: "not_found" };

  const challenge = await identityDb("login_otp_challenges")
    .where("id", challengeId)
    .first<OtpChallenge | undefined>();

  if (!challenge) return { ok: false, reason: "not_found" };
  if (challenge.consumed_at) return { ok: false, reason: "consumed" };

  if (new Date(challenge.expires_at).getTime() <= Date.now()) {
    return { ok: false, reason: "expired" };
  }

  if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
    await identityDb("login_otp_challenges")
      .where("id", challengeId)
      .update({ consumed_at: new Date() });
    return { ok: false, reason: "too_many_attempts" };
  }

  const submitted = hashOtp(code.trim(), challengeId);

  if (!hashesMatch(submitted, challenge.code_hash)) {
    const attempts = challenge.attempts + 1;
    const burned = attempts >= OTP_MAX_ATTEMPTS;

    await identityDb("login_otp_challenges")
      .where("id", challengeId)
      .update({
        attempts,
        // Burn the challenge outright once the budget is spent.
        consumed_at: burned ? new Date() : null,
      });

    if (burned) return { ok: false, reason: "too_many_attempts" };
    return { ok: false, reason: "incorrect", attemptsLeft: OTP_MAX_ATTEMPTS - attempts };
  }

  // Correct. Claim it — only one caller can win this update.
  const claimed = await identityDb("login_otp_challenges")
    .where("id", challengeId)
    .whereNull("consumed_at")
    .update({ consumed_at: new Date() });

  if (claimed === 0) return { ok: false, reason: "consumed" };

  return { ok: true, userId: challenge.user_id, email: challenge.email };
}

/** Housekeeping: drop challenges that are long dead. */
export async function purgeExpiredChallenges(): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return identityDb("login_otp_challenges").where("created_at", "<", cutoff).del();
}
