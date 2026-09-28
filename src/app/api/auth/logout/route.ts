import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { identityDb } from "@/lib/db";
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS, verifySessionCookie } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  const cookieStore = await cookies();
  const payload = await verifySessionCookie(cookieStore.get(SESSION_COOKIE)?.value);

  if (payload?.jti) {
    try {
      await identityDb("user_sessions")
        .where("jti", payload.jti)
        .whereNull("revoked_at")
        .update({ revoked_at: new Date() });
    } catch {
      // Best-effort; clearing the cookie below is what actually signs them out.
    }
  }

  const response = NextResponse.json({ success: true });
  // Overwrite then delete, so the cookie is cleared even if the browser
  // ignores a bare delete for a host-only cookie.
  response.cookies.set(SESSION_COOKIE, "", { ...SESSION_COOKIE_OPTIONS, maxAge: 0 });
  return response;
}
