import { NextResponse } from "next/server";
import { identityDb } from "@/lib/db";
import { hashPassword, generatePassword, validatePasswordStrength } from "@/lib/password";
import { requireRole, findAuthUserById } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * Admin-only: issue a new password for another user.
 *
 * POST { userId, password? }
 *   password omitted → a strong one is generated and returned once.
 *
 * The target user is forced to change it at next sign-in, and all of
 * their existing sessions are revoked immediately.
 */
export async function POST(request: Request) {
  const auth = await requireRole(["admin"]);
  if (!auth.ok) return auth.response;

  let userId = "";
  let password: string | undefined;
  try {
    const body = await request.json();
    userId = typeof body?.userId === "string" ? body.userId.trim() : "";
    password = typeof body?.password === "string" && body.password ? body.password : undefined;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!userId) {
    return NextResponse.json({ error: "userId is required." }, { status: 400 });
  }

  const target = await findAuthUserById(userId);
  if (!target) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  if (password) {
    const problem = validatePasswordStrength(password);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  }

  const issued = password ?? generatePassword(16);
  const now = new Date();

  await identityDb("users").where("id", target.id).update({
    password_hash: await hashPassword(issued),
    password_updated_at: now,
    must_change_password: true,
    failed_login_count: 0,
    locked_until: null,
    sessions_valid_from: now,
  });

  try {
    await identityDb("user_sessions")
      .where("user_id", target.id)
      .whereNull("revoked_at")
      .update({ revoked_at: now });

    await identityDb("login_audit").insert({
      user_id: target.id,
      email: target.email,
      success: true,
      reason: `password_reset_by:${auth.session.email}`,
    });
  } catch {
    // Best-effort.
  }

  return NextResponse.json({
    success: true,
    userId: target.id,
    email: target.email,
    // Returned once, only to the admin who triggered the reset.
    temporaryPassword: password ? undefined : issued,
    mustChangePassword: true,
  });
}
