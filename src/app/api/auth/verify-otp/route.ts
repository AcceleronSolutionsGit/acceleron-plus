import { COOKIE_PATH } from "@/lib/base-path";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { identityDb, describeSetupError } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { verifyOtp } from "@/lib/otp";
import {
  findAuthUserById,
  sessionSeedFor,
  createSessionCookie,
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/auth";
import { OTP_COOKIE, REQUIRE_PASSWORD } from "@/lib/auth-config";
import { deriveAppRole } from "@/lib/session";
import { homeFor } from "@/lib/rollout";

export const runtime = "nodejs";

/**
 * Step two of sign-in: the user enters the code they were sent.
 *
 * The challenge id comes from the httpOnly cookie set in step one, not
 * from the request body — so a code intercepted in transit cannot be
 * redeemed from another browser.
 */

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
  reason: string | null
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
    // Auditing is best-effort.
  }
}

/**
 * Record the sign-in on the user row.
 *
 * `failed_login_count` and `locked_until` belong to password login. A
 * one-time-code sign-in has no use for them, so their absence must not
 * fail the request — especially here, where the code has already been
 * verified and consumed. Letting this throw meant a half-migrated
 * database burned a fresh code on every single attempt.
 */
async function markSignedIn(userId: string): Promise<void> {
  const now = new Date();
  try {
    await identityDb("users").where("id", userId).update({
      failed_login_count: 0,
      locked_until: null,
      last_login_at: now,
    });
    return;
  } catch (err) {
    const setup = describeSetupError(err);
    if (!setup) throw err; // a real failure, not a missing column
    console.warn(`[auth] ${setup} Continuing without the password-lockout fields.`);
  }

  // Second attempt with only the column every schema has.
  try {
    await identityDb("users").where("id", userId).update({ last_login_at: now });
  } catch {
    // Even last_login_at is optional bookkeeping — never block sign-in on it.
  }
}

/** Clear the challenge cookie alongside whatever response we are sending. */
function clearChallenge(response: NextResponse): NextResponse {
  response.cookies.set(OTP_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: COOKIE_PATH,
    maxAge: 0,
  });
  return response;
}

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const challengeId = cookieStore.get(OTP_COOKIE)?.value;

    if (!challengeId) {
      return NextResponse.json(
        { error: "Your sign-in request has expired. Please start again.", restart: true },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => null);
    const code = typeof (body as { code?: unknown })?.code === "string"
      ? (body as { code: string }).code.replace(/\s+/g, "")
      : "";
    const password = typeof (body as { password?: unknown })?.password === "string"
      ? (body as { password: string }).password
      : "";

    if (!code) {
      return NextResponse.json({ error: "Enter the code we sent you." }, { status: 400 });
    }

    const result = await verifyOtp(challengeId, code);

    if (!result.ok) {
      switch (result.reason) {
        case "incorrect":
          return NextResponse.json(
            {
              error: `That code is not right. ${result.attemptsLeft} attempt${
                result.attemptsLeft === 1 ? "" : "s"
              } left.`,
              attemptsLeft: result.attemptsLeft,
            },
            { status: 401 }
          );
        case "expired":
          return clearChallenge(
            NextResponse.json(
              { error: "That code has expired. Please request a new one.", restart: true },
              { status: 401 }
            )
          );
        case "too_many_attempts":
          return clearChallenge(
            NextResponse.json(
              { error: "Too many incorrect codes. Please start again.", restart: true },
              { status: 429 }
            )
          );
        case "consumed":
          return clearChallenge(
            NextResponse.json(
              { error: "That code has already been used. Please start again.", restart: true },
              { status: 401 }
            )
          );
        default:
          return clearChallenge(
            NextResponse.json(
              { error: "Your sign-in request has expired. Please start again.", restart: true },
              { status: 400 }
            )
          );
      }
    }

    // ─── Code accepted ────────────────────────────────────────────
    const row = await findAuthUserById(result.userId);

    if (!row || !row.is_active) {
      await audit(result.email, request, false, result.userId, "otp_user_unavailable");
      return clearChallenge(
        NextResponse.json({ error: "This account is no longer active." }, { status: 403 })
      );
    }

    // Second factor, when the password is switched back on.
    if (REQUIRE_PASSWORD) {
      if (!password) {
        return NextResponse.json(
          { error: "Enter your password as well.", passwordRequired: true },
          { status: 400 }
        );
      }
      if (!(await verifyPassword(password, row.password_hash))) {
        await audit(row.email, request, false, row.id, "otp_bad_password");
        // The code is already consumed, so the user has to start over —
        // that is the safe direction to fail.
        return clearChallenge(
          NextResponse.json(
            { error: "That password is not right. Please sign in again.", restart: true },
            { status: 401 }
          )
        );
      }
    }

    const { value, payload } = await createSessionCookie(sessionSeedFor(row));

    await markSignedIn(row.id);

    try {
      await identityDb("user_sessions").insert({
        user_id: row.id,
        jti: payload.jti,
        issued_at: new Date(payload.iat * 1000),
        expires_at: new Date(payload.exp * 1000),
        ip_address: clientIp(request),
        user_agent: request.headers.get("user-agent")?.slice(0, 500) ?? null,
      });
    } catch {
      // The signed cookie is the source of truth; this is bookkeeping.
    }

    await audit(row.email, request, true, row.id, "otp_success");

    const response = NextResponse.json({
      success: true,
      // Only meaningful while passwords are part of sign-in.
      mustChangePassword: REQUIRE_PASSWORD && Boolean(row.must_change_password),
      user: {
        id: row.id,
        fullName: row.full_name,
        email: row.email,
        role: row.role_code ?? "member",
      },
      // Where this person belongs. A client has no business on the
      // internal project list, so the client decides from this rather
      // than defaulting everybody to /pmt.
      landing: homeFor(deriveAppRole(row.role_code)),
    });

    response.cookies.set(SESSION_COOKIE, value, {
      ...SESSION_COOKIE_OPTIONS,
      maxAge: SESSION_MAX_AGE_SECONDS,
    });

    return clearChallenge(response);
  } catch (err) {
    console.error("[auth] Code verification failed:", err);

    // A missing table or a bad credential is a setup problem, not a fault —
    // say which, instead of leaving a bare 500 in the console.
    const setup = describeSetupError(err);
    if (setup) return NextResponse.json({ error: setup, setup: true }, { status: 500 });
    return NextResponse.json(
      { error: "Sign-in is temporarily unavailable. Please try again." },
      { status: 500 }
    );
  }
}
