import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionCookie } from "@/lib/session";
import { BASE_PATH, COOKIE_PATH } from "@/lib/base-path";
import { MANAGER_PATHS, PHASE2_PAGES, homeFor, isPhase1Restricted, matchesPrefix } from "@/lib/rollout";

// Next.js 16 renamed the `middleware` file convention to `proxy`; Proxy
// now defaults to the Node.js runtime, and setting `runtime` here throws.
//
// Keep this file free of `db.ts` / `auth.ts`: Proxy runs in front of the app
// and should not open database connections. `session.ts` is Web-Crypto-only
// and safe to import from here.

/** Paths reachable without a session. */
const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  // The two sign-in steps: by definition there is no session yet.
  "/api/auth/request-otp",
  "/api/auth/verify-otp",
  "/api/auth/resend-otp",
  // Scheduler entry point — the handler authenticates with a shared token,
  // because a cron job has no browser session to present.
  "/api/notifications/sweep",
];

/** Path prefixes only an admin may open. */
// Integration routes guard themselves per-handler (some allow PMs too),
// so they are deliberately not blanket-blocked here.
const ADMIN_PATHS = ["/admin", "/api/admin", "/api/auth/reset-password"];

/**
 * Pages a client contact must never open.
 *
 * The API routes underneath already refuse them, but the *pages* are
 * server components that read data before any guard runs — the project
 * list renders budgets. Hiding the link is not a control; this is.
 *
 * A client is sent to their own portal rather than shown a 403, because
 * from their side there is nothing wrong: they simply went somewhere
 * that is not theirs.
 */
// /my-projects lists every live project by name — not something a client
// should browse — and /api/me/projects refuses them too.
const INTERNAL_PAGES = ["/pmt", "/admin", "/my-tasks", "/my-timesheet", "/my-skills", "/my-projects"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * A URL inside this app. Cloning nextUrl keeps the base path when the
 * app is served from a folder (apps.acceleronsolutions.io/acceleron-plus);
 * building one from request.url would drop it and land on another app.
 */
function appUrl(request: NextRequest, path: string): URL {
  const url = request.nextUrl.clone();
  url.pathname = path;
  url.search = "";
  return url;
}

export async function proxy(request: NextRequest) {
  // Without the base path — Next strips it — so the rules below compare
  // against "/pmt", "/api/…" whether or not the app lives in a folder.
  // The bare folder itself ("/acceleron-plus", no slash) arrives with the
  // base path still on, so strip it here too, or "from" would point at
  // /acceleron-plus/acceleron-plus after sign-in.
  const raw = request.nextUrl.pathname;
  const pathname =
    BASE_PATH && (raw === BASE_PATH || raw.startsWith(`${BASE_PATH}/`))
      ? raw.slice(BASE_PATH.length) || "/"
      : raw;

  if (isPublic(pathname)) return NextResponse.next();

  // Next.js internals and static assets.
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon")) {
    return NextResponse.next();
  }

  const isApi = pathname.startsWith("/api");

  // Static files — but never skip the check for API routes, which can
  // legitimately contain a dot in a path segment.
  if (!isApi && pathname.includes(".")) return NextResponse.next();

  // Verify the cookie signature, not just its presence. A forged or
  // hand-edited cookie fails here rather than being trusted downstream.
  const payload = await verifySessionCookie(request.cookies.get(SESSION_COOKIE)?.value);

  if (!payload) {
    if (isApi) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const loginUrl = appUrl(request, "/login");
    loginUrl.searchParams.set("from", pathname);
    const response = NextResponse.redirect(loginUrl);
    // Clear a stale or tampered cookie so the browser stops sending it.
    response.cookies.set(SESSION_COOKIE, "", { path: COOKIE_PATH, maxAge: 0 });
    return response;
  }

  // A client anywhere internal goes to their portal instead.
  if (
    payload.role === "client" &&
    INTERNAL_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  ) {
    if (isApi) {
      return NextResponse.json(
        { error: "You do not have permission to access this resource." },
        { status: 403 }
      );
    }
    return NextResponse.redirect(appUrl(request, "/portal"));
  }

  // Phase 1: a regular member has My Projects, My Timesheet and My Skills.
  // The rest is greyed out in the sidebar; this is what stops a typed or
  // bookmarked URL from opening it anyway. Pages only — see rollout.ts.
  if (!isApi && isPhase1Restricted(payload.role) && matchesPrefix(pathname, PHASE2_PAGES)) {
    return NextResponse.redirect(appUrl(request, homeFor(payload.role)));
  }

  // Timesheet approvals and allocation requests live under /admin but are
  // used by reporting managers too. The handlers scope every query to the
  // caller's direct reports, so letting them through exposes nothing.
  const isManagerPath = payload.role !== "client" && matchesPrefix(pathname, MANAGER_PATHS);

  if (
    !isManagerPath &&
    ADMIN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`)) &&
    payload.role !== "admin"
  ) {
    if (isApi) {
      return NextResponse.json(
        { error: "You do not have permission to access this resource." },
        { status: 403 }
      );
    }
    return NextResponse.redirect(appUrl(request, homeFor(payload.role)));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static, _next/image, favicon.ico, etc.
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
