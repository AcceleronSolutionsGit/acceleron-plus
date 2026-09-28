import { NextResponse } from "next/server";
import { identityDb } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import {
  findAuthUserByEmail,
  sessionSeedFor,
  createSessionCookie,
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  SESSION_MAX_AGE_SECONDS,
  type AuthUserRow,
} from "@/lib/auth";
import { PASSWORD_LOGIN_ENABLED } from "@/lib/auth-config";

export const runtime = "nodejs";

// Lock an account after this many consecutive failures.
const MAX_FAILED_ATTEMPTS = 8;
const LOCKOUT_MINUTES = 15;

/** Same message for "no such user" and "wrong password" — don't leak which. */
const INVALID_CREDENTIALS = "Invalid email or password.";

function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip");
}

async function recordAttempt(
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
    // Auditing must never block a login. If the table is missing,
    // run: node src/lib/migrations/migrate-auth.js
  }
}

function isLocked(row: AuthUserRow): boolean {
  if (!row.locked_until) return false;
  return new Date(row.locked_until).getTime() > Date.now();
}

export async function POST(request: Request) {
  // Sign-in now goes through /api/auth/request-otp then /api/auth/verify-otp.
  // This endpoint stays intact so password login can be switched straight
  // back on with AUTH_PASSWORD_LOGIN_ENABLED=true.
  if (!PASSWORD_LOGIN_ENABLED) {
    return NextResponse.json(
      {
        error: "Password sign-in is disabled. Request a one-time code instead.",
        useOtp: true,
      },
      { status: 410 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    // Malformed JSON is a client error, not a server fault.
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = body as { email?: unknown; password?: unknown } | null;
  // Trim stray whitespace/newlines — pasted credentials often carry them.
  const email = typeof parsed?.email === "string" ? parsed.email.trim() : "";
  const password = typeof parsed?.password === "string" ? parsed.password.trim() : "";

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  try {
    const row = await findAuthUserByEmail(email);

    // Spend roughly the same time whether or not the user exists, so the
    // response time doesn't reveal which emails are registered.
    if (!row) {
      await verifyPassword(password, "scrypt$65536$8$1$" + "00".repeat(16) + "$" + "00".repeat(64));
      await recordAttempt(email, request, false, null, "unknown_user");
      return NextResponse.json({ error: INVALID_CREDENTIALS }, { status: 401 });
    }

    if (!row.is_active) {
      await recordAttempt(email, request, false, row.id, "inactive");
      return NextResponse.json(
        { error: "This account has been deactivated. Contact your administrator." },
        { status: 403 }
      );
    }

    if (isLocked(row)) {
      await recordAttempt(email, request, false, row.id, "locked");
      const minutes = Math.max(1, Math.ceil((new Date(row.locked_until!).getTime() - Date.now()) / 60000));
      return NextResponse.json(
        { error: `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.` },
        { status: 429 }
      );
    }

    if (!row.password_hash) {
      await recordAttempt(email, request, false, row.id, "no_password_set");
      return NextResponse.json(
        { error: "No password has been set for this account. Ask an administrator to issue one." },
        { status: 403 }
      );
    }

    const valid = await verifyPassword(password, row.password_hash);

    if (!valid) {
      const failures = (row.failed_login_count ?? 0) + 1;
      const lockedUntil =
        failures >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000) : null;

      await identityDb("users")
        .where("id", row.id)
        .update({
          failed_login_count: lockedUntil ? 0 : failures,
          locked_until: lockedUntil,
        });

      await recordAttempt(email, request, false, row.id, "bad_password");

      if (lockedUntil) {
        return NextResponse.json(
          { error: `Too many failed attempts. Try again in ${LOCKOUT_MINUTES} minutes.` },
          { status: 429 }
        );
      }
      return NextResponse.json({ error: INVALID_CREDENTIALS }, { status: 401 });
    }

    // ─── Success ───────────────────────────────────────────────────
    const { value, payload } = await createSessionCookie(sessionSeedFor(row));

    await identityDb("users").where("id", row.id).update({
      failed_login_count: 0,
      locked_until: null,
      last_login_at: new Date(),
    });

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
      // Session bookkeeping is best-effort; the signed cookie is the source of truth.
    }

    await recordAttempt(email, request, true, row.id, null);

    const response = NextResponse.json({
      success: true,
      mustChangePassword: Boolean(row.must_change_password),
      user: {
        id: row.id,
        fullName: row.full_name,
        email: row.email,
        role: row.role_code ?? "member",
      },
    });

    response.cookies.set(SESSION_COOKIE, value, {
      ...SESSION_COOKIE_OPTIONS,
      maxAge: SESSION_MAX_AGE_SECONDS,
    });

    return response;
  } catch (err) {
    console.error("[auth] Login failed:", err);
    await recordAttempt(email, request, false, null, "server_error");
    return NextResponse.json(
      { error: "Sign-in is temporarily unavailable. Please try again." },
      { status: 500 }
    );
  }
}
