import { NextResponse } from "next/server";
import { identityDb } from "@/lib/db";
import { hashPassword, verifyPassword, validatePasswordStrength } from "@/lib/password";
import {
  requireSession,
  findAuthUserById,
  sessionSeedFor,
  createSessionCookie,
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/auth";

export const runtime = "nodejs";

/**
 * Change the signed-in user's own password.
 *
 * Every other session for this user is invalidated (sessions_valid_from
 * moves to now), and this request gets a freshly signed cookie so the
 * caller stays logged in.
 */
export async function POST(request: Request) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  let currentPassword = "";
  let newPassword = "";
  try {
    const body = await request.json();
    currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";
    newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!currentPassword || !newPassword) {
    return NextResponse.json(
      { error: "Both the current and new password are required." },
      { status: 400 }
    );
  }

  const strengthProblem = validatePasswordStrength(newPassword);
  if (strengthProblem) {
    return NextResponse.json({ error: strengthProblem }, { status: 400 });
  }

  const row = await findAuthUserById(auth.session.userId);
  if (!row || !row.is_active) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }

  if (!(await verifyPassword(currentPassword, row.password_hash))) {
    return NextResponse.json({ error: "Your current password is incorrect." }, { status: 401 });
  }

  if (await verifyPassword(newPassword, row.password_hash)) {
    return NextResponse.json(
      { error: "Your new password must be different from the current one." },
      { status: 400 }
    );
  }

  // Mint the replacement cookie FIRST. Its `iat` is whole-second precision,
  // so it must be the watermark too — using Date.now() here would push the
  // watermark past our own new session and log the user straight back out.
  const { value, payload } = await createSessionCookie(sessionSeedFor(row));
  const watermark = new Date(payload.iat * 1000);
  const now = new Date();

  await identityDb("users").where("id", row.id).update({
    password_hash: await hashPassword(newPassword),
    password_updated_at: now,
    must_change_password: false,
    failed_login_count: 0,
    locked_until: null,
    // Invalidates every session issued before this one.
    sessions_valid_from: watermark,
  });

  try {
    await identityDb("user_sessions")
      .where("user_id", row.id)
      .whereNull("revoked_at")
      .whereNot("jti", payload.jti)
      .update({ revoked_at: now });

    await identityDb("user_sessions").insert({
      user_id: row.id,
      jti: payload.jti,
      issued_at: watermark,
      expires_at: new Date(payload.exp * 1000),
    });
  } catch {
    // Best-effort bookkeeping.
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set(SESSION_COOKIE, value, {
    ...SESSION_COOKIE_OPTIONS,
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}
