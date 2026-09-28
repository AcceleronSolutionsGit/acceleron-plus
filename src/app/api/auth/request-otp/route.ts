import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { identityDb, describeSetupError } from "@/lib/db";
import { findAuthUserByEmail } from "@/lib/auth";
import { issueOtp } from "@/lib/otp";
import { sendMail, renderOtpEmail, isMailConfigured } from "@/lib/mailer";
import {
  OTP_COOKIE,
  OTP_TTL_SECONDS,
  OTP_LENGTH,
  shouldRevealOtp,
  shouldEmailOtp,
} from "@/lib/auth-config";

export const runtime = "nodejs";

/**
 * Step one of sign-in: the user types their email and we send a code.
 *
 * The response is deliberately identical whether or not the account
 * exists. Because the code alone grants access, telling a stranger
 * "no such user" would hand them a way to enumerate every valid
 * address in the company.
 */

const GENERIC_MESSAGE = "If that address belongs to an Acceleron account, a sign-in code is on its way.";

function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip");
}

async function audit(
  email: string,
  request: Request,
  success: boolean,
  userId: string | null,
  reason: string
) {
  try {
    await identityDb("login_audit").insert({
      user_id: userId,
      email: email.slice(0, 320),
      success,
      reason,
      ip_address: clientIp(request),
      user_agent: request.headers.get("user-agent")?.slice(0, 500) ?? null,
    });
  } catch {
    // Never block sign-in on the audit trail.
  }
}

/** Cookie settings shared by the real challenge and the decoy below. */
function challengeCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: OTP_TTL_SECONDS + 60,
  };
}

/**
 * The same body AND the same headers for every outcome.
 *
 * Unknown accounts get a decoy challenge id that matches nothing, so the
 * Set-Cookie header is present either way. Without it, the absence of a
 * cookie would say "no such account" just as plainly as an error message
 * would. Submitting a code against the decoy fails the same way an
 * expired challenge does.
 */
function genericResponse() {
  const response = NextResponse.json({
    success: true,
    message: GENERIC_MESSAGE,
    expiresInSeconds: OTP_TTL_SECONDS,
    codeLength: OTP_LENGTH,
  });
  response.cookies.set(OTP_COOKIE, randomBytes(32).toString("base64url"), challengeCookieOptions());
  return response;
}

export async function POST(request: Request) {
  let email = "";
  try {
    const body = await request.json().catch(() => null);
    email = typeof (body as { email?: unknown })?.email === "string"
      ? (body as { email: string }).email.trim()
      : "";

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    const row = await findAuthUserByEmail(email);

    // Unknown or deactivated: look exactly like the success path.
    if (!row || !row.is_active) {
      await audit(email, request, false, row?.id ?? null, row ? "otp_inactive" : "otp_unknown_user");
      return genericResponse();
    }

    const issued = await issueOtp(row.id, row.email);

    if (!issued.ok) {
      await audit(email, request, false, row.id, "otp_rate_limited");
      return NextResponse.json(
        {
          error: "Too many codes requested. Please wait a few minutes and try again.",
          retryAfterSeconds: issued.retryAfterSeconds,
        },
        { status: 429 }
      );
    }

    // ─── Deliver ──────────────────────────────────────────────────
    const reveal = shouldRevealOtp();
    let delivered = false;

    if (shouldEmailOtp() && isMailConfigured()) {
      const { subject, text, html } = renderOtpEmail({
        code: issued.code,
        fullName: row.full_name,
        expiresInMinutes: Math.round(OTP_TTL_SECONDS / 60),
      });
      const result = await sendMail({ to: row.email, subject, text, html });
      delivered = result.sent;

      if (!result.sent && !reveal) {
        // Production with no working mail server: say so rather than
        // leaving the user staring at a code entry box forever.
        await audit(email, request, false, row.id, "otp_send_failed");
        return NextResponse.json(
          { error: "We could not send your sign-in code. Please contact your administrator." },
          { status: 502 }
        );
      }
    } else if (!reveal) {
      // Nowhere to put the code: not emailing, not showing.
      await audit(email, request, false, row.id, "otp_no_mail_transport");
      return NextResponse.json(
        { error: "Email delivery is not configured, so a sign-in code cannot be sent." },
        { status: 503 }
      );
    }

    if (reveal) {
      // Development aid — also printed here so it is visible in the terminal.
      console.log(`\n  🔑 Sign-in code for ${row.email}: ${issued.code}  (expires in ${Math.round(OTP_TTL_SECONDS / 60)} min)\n`);
    }

    await audit(email, request, true, row.id, delivered ? "otp_sent" : "otp_issued_dev");

    // The body must be byte-identical to genericResponse() in production.
    // An earlier version returned `emailSent` here, which appeared only for
    // accounts that exist — enough on its own to enumerate valid addresses.
    // It is now dev-only, alongside the code it accompanies.
    const response = NextResponse.json({
      success: true,
      message: GENERIC_MESSAGE,
      expiresInSeconds: OTP_TTL_SECONDS,
      codeLength: OTP_LENGTH,
      // Only ever present outside production. See shouldRevealOtp().
      ...(reveal
        ? {
            devCode: issued.code,
            devNotice: "Shown because this is a development build.",
            emailSent: delivered,
          }
        : {}),
    });

    // The challenge id lives only in an httpOnly cookie, so a code on its
    // own is useless to anyone in a different browser.
    response.cookies.set(OTP_COOKIE, issued.challengeId, challengeCookieOptions());

    return response;
  } catch (err) {
    console.error("[auth] Could not issue a sign-in code:", err);

    // A missing table or a bad credential is a setup problem, not a fault —
    // say which, instead of leaving a bare 500 in the console.
    const setup = describeSetupError(err);
    if (setup) return NextResponse.json({ error: setup, setup: true }, { status: 500 });
    await audit(email, request, false, null, "otp_server_error");
    return NextResponse.json(
      { error: "Sign-in is temporarily unavailable. Please try again." },
      { status: 500 }
    );
  }
}
