// ═══════════════════════════════════════════════════════════════
// Phase 1 rollout — what a regular employee can use today.
//
// Phase 1 is two jobs: add yourself to the projects you work on (your
// reporting manager reviews that afterwards) and fill in your weekly
// timesheet, which they approve. Everything
// else — delivery, the service desk, My Tasks — is still on its way for
// regular members, and is shown greyed out rather than hidden, so
// nobody wonders where it went when it arrives.
//
// Admins and PMs are not restricted: they run the projects that people
// are asking to join. Clients have their own portal and their own rules.
//
// Imported by the proxy, so this file must stay free of db / auth.
// ═══════════════════════════════════════════════════════════════

import type { AppRole } from "./types";

/** Flip to false when Phase 2 goes live for everyone. */
export const PHASE1_ROLLOUT = true;

/** True when this role only gets the Phase 1 screens. */
export function isPhase1Restricted(role: AppRole | string | null | undefined): boolean {
  return PHASE1_ROLLOUT && role === "member";
}

/** Page prefixes a Phase 1 member is sent away from. Pages only — the
 *  Phase 1 screens themselves call /api/pmt/my-timesheet and
 *  /api/pmt/timesheets, so the API is left to its own capability checks. */
export const PHASE2_PAGES = ["/pmt", "/itsm", "/my-tasks"];

/**
 * Screens under /admin that reporting managers use too. The APIs behind
 * them scope every query to the caller's direct reports, so a manager
 * sees their own team and anybody else sees an empty list.
 */
export const MANAGER_PATHS = [
  "/admin/timesheets",
  "/admin/allocation-requests",
  "/api/admin/timesheets",
  "/api/admin/allocation-requests",
];

export function matchesPrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Where somebody lands after signing in, or when sent away from a page. */
export function homeFor(role: AppRole | string | null | undefined): string {
  if (role === "client") return "/portal";
  if (isPhase1Restricted(role)) return "/my-projects";
  return "/pmt";
}
