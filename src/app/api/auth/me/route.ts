import { NextResponse } from "next/server";
import { getCurrentUser, getSession, mustChangePassword } from "@/lib/auth";

export const runtime = "nodejs";

/** Who am I? Used by client components that need the session without a prop drill. */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const user = await getCurrentUser();

  return NextResponse.json({
    authenticated: true,
    mustChangePassword: await mustChangePassword(),
    session: {
      userId: session.userId,
      tenantId: session.tenantId,
      email: session.email,
      fullName: session.fullName,
      roleCode: session.roleCode,
      role: session.role,
      expiresAt: new Date(session.exp * 1000).toISOString(),
    },
    user,
  });
}
