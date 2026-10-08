"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import type { User } from "@/lib/types";
import { Logo } from "@/components/ui/Logo";
import { Avatar } from "@/components/ui/Avatar";
import { NavItem, NavSection } from "@/components/ui/NavItem";
import { deriveAppRole } from "@/lib/session";
import { isPhase1Restricted } from "@/lib/rollout";

// ─── Icons ─────────────────────────────────────────────────────────
// All drawn on the same 24-grid at the same 1.75 stroke. Mixing filled
// and outlined icons in one rail is the single most common way a nav
// stops looking like one set of things.

const icon = (d: React.ReactNode) =>
  function Icon() {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-full w-full"
      >
        {d}
      </svg>
    );
  };

const FolderIcon = icon(
  <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
);

const TicketIcon = icon(
  <>
    <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h15A1.5 1.5 0 0 1 21 8.5v2a2 2 0 0 0 0 3v2a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 15.5v-2a2 2 0 0 0 0-3v-2Z" />
    <path d="M14 7v10" strokeDasharray="2 2.5" />
  </>
);

const ChangeIcon = icon(
  <>
    <path d="M4 9a8 8 0 0 1 13.5-4.5L20 7" />
    <path d="M20 4v3h-3" />
    <path d="M20 15a8 8 0 0 1-13.5 4.5L4 17" />
    <path d="M4 20v-3h3" />
  </>
);

const ReleaseIcon = icon(
  <>
    <path d="M6 3h12a1 1 0 0 1 1 1v16l-4-2.5L11 20l-4-2.5L5 20V4a1 1 0 0 1 1-1Z" />
    <path d="M12 7v6M9.5 9.5 12 7l2.5 2.5" />
  </>
);

const ShieldIcon = icon(
  <>
    <path d="M12 3l7.5 3v5.5c0 4.4-3.1 8.2-7.5 9.5-4.4-1.3-7.5-5.1-7.5-9.5V6L12 3Z" />
    <path d="m9 12 2 2 4-4" />
  </>
);

const UserGroupIcon = icon(
  <>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3 19v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1" />
    <path d="M16.5 5.2a3.2 3.2 0 0 1 0 5.6M18 13.3A4.5 4.5 0 0 1 21 17.5V19" />
  </>
);

const DatabaseIcon = icon(
  <>
    <ellipse cx="12" cy="6" rx="7.5" ry="3" />
    <path d="M4.5 6v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6" />
    <path d="M4.5 12v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-6" />
  </>
);

const ClockIcon = icon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </>
);

const TaskIcon = icon(
  <>
    <path d="M9 11.5 11.5 14 20 5" />
    <path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9" />
  </>
);

const SkillIcon = icon(
  <path d="m12 3.5 2.55 5.3 5.7.55-4.3 3.9 1.25 5.75L12 15.9 6.8 19l1.25-5.75-4.3-3.9 5.7-.55L12 3.5Z" />
);

const FolderPlusIcon = icon(
  <>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
    <path d="M12 11v4M10 13h4" />
  </>
);

const ClipboardCheckIcon = icon(
  <>
    <path d="M9 5H7a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
    <rect x="9" y="3" width="6" height="4" rx="1" />
    <path d="m9 12 2 2 4-4" />
  </>
);

const InboxIcon = icon(
  <>
    <path d="M4 13h3l2 3h6l2-3h3" />
    <path d="M4 13V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7" />
  </>
);

const PeopleIcon = icon(
  <>
    <circle cx="9" cy="7.5" r="3.5" />
    <path d="M2.5 20v-1.5A4.5 4.5 0 0 1 7 14h4a4.5 4.5 0 0 1 4.5 4.5V20" />
    <path d="M16.5 4.3a3.5 3.5 0 0 1 0 6.9M18 14.2a4.5 4.5 0 0 1 3.5 4.3V20" />
  </>
);

const ChartIcon = icon(
  <>
    <path d="M4 20V4" />
    <path d="M4 20h16" />
    <path d="M8 20v-6M12.5 20V8M17 20v-9" />
  </>
);

const UploadCloudIcon = icon(
  <>
    <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
    <path d="M12 12v9" />
    <path d="m16 16-4-4-4 4" />
  </>
);

const ActivityIcon = icon(
  <>
    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
  </>
);

const SettingsIcon = icon(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </>
);

const COLLAPSE_KEY = "acceleron.sidebar.collapsed";

export function Sidebar({ user, hasDirectReports = false }: { user: User; hasDirectReports?: boolean }) {
  const appRole = deriveAppRole(user.role?.code);
  const allRoles = [appRole, ...(user.roles?.map(r => deriveAppRole(r.code)) || [])];
  const isAdmin = allRoles.includes("admin");
  const canManageItsmMasters = isAdmin || allRoles.includes("sales") || allRoles.includes("ticket_handler");

  // Phase 1 rollout: a regular member gets My Projects, My Timesheet and
  // My Skills. Delivery, the service desk and My Tasks stay visible but
  // greyed out. Admins and PMs see everything. (See lib/rollout.ts.)
  const phase1 = isPhase1Restricted(appRole);
  // Approvals are for reporting managers. A member nobody reports to
  // would only ever see an empty list, so the section is left out.
  const showTeam = !phase1 || hasDirectReports;
  // A client is outside the company. They get their own portal and the
  // service desk, and nothing that would only lead to a 403.
  const isClient = appRole === "client";

  // Start expanded and correct the first paint from storage, rather than
  // reading storage during render — that mismatches the server HTML and
  // React replaces the whole tree.
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [comingSoonNotice, setComingSoonNotice] = useState<string | null>(null);

  useEffect(() => {
    try {
      setIsCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      /* private browsing, blocked storage — the default is fine */
    }
  }, []);

  const toggle = () => {
    setIsCollapsed((prev) => {
      try {
        window.localStorage.setItem(COLLAPSE_KEY, prev ? "0" : "1");
      } catch {
        /* nothing to do; the choice just won't survive a reload */
      }
      return !prev;
    });
  };

  return (
    <aside
      className={[
        isCollapsed ? "w-[76px]" : "w-[254px]",
        "relative flex h-full shrink-0 flex-col",
        "transition-[width] duration-300 ease-[var(--ease-out-soft)]",
        // Not a flat navy panel: a vertical gradient with a red wash at
        // the very bottom, which is where the chevron's colour belongs.
        "bg-[linear-gradient(175deg,#2a3a72_0%,#212f60_45%,#1b2650_100%)]",
      ].join(" ")}
    >
      {/* A hairline of brand red down the outer edge. One pixel, and it
          is the thing that stops the rail looking like any other navy
          sidebar. */}
      <span
        aria-hidden
        className="absolute inset-y-0 right-0 w-px bg-[linear-gradient(180deg,transparent,rgb(222_30_36_/_0.55)_35%,rgb(222_30_36_/_0.55)_65%,transparent)]"
      />

      <button
        onClick={toggle}
        aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-expanded={!isCollapsed}
        className={[
          "absolute -right-3 top-[26px] z-20 grid h-6 w-6 place-items-center rounded-full",
          "border border-navy-900/10 bg-surface text-navy-600 shadow-sm",
          "cursor-pointer transition-[background,color,transform] duration-200",
          "hover:bg-navy-900 hover:text-white",
        ].join(" ")}
      >
        <svg
          className={`h-3.5 w-3.5 transition-transform duration-300 ease-[var(--ease-out-soft)] ${
            isCollapsed ? "rotate-180" : ""
          }`}
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m9.5 4-4 4 4 4" />
        </svg>
      </button>

      {/* ─── Identity ─────────────────────────────────────────── */}
      <div
        className={`flex h-[72px] shrink-0 items-center border-b border-white/10 ${
          isCollapsed ? "justify-center px-3" : "px-5"
        }`}
      >
        {isCollapsed ? (
          <Logo variant="mark" tone="light" className="h-9 w-9" />
        ) : (
          // Wordmark, then the product name set off by a rule. The rule
          // is what keeps "Plus" from reading as part of the logo — it is
          // the app's name, not the company's.
          <div className="flex min-w-0 items-center gap-2.5">
            <Logo variant="wordmark" tone="light" className="h-[22px]" />
            <span className="h-5 w-px shrink-0 bg-white/20" aria-hidden />
            <span className="text-display shrink-0 text-[13px] font-bold tracking-[-0.01em] text-white/75">
              Plus
            </span>
          </div>
        )}
      </div>

      {/* ─── Navigation ───────────────────────────────────────── */}
      <nav
        className={`flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden py-2 ${
          isCollapsed ? "px-3" : "px-3"
        }`}
      >
        {isClient ? (
          <>
            <NavSection label="Your projects" isCollapsed={isCollapsed} badge={!isAdmin ? "Phase 2" : undefined} />
            <NavItem
              href="/portal"
              icon={<FolderIcon />}
              label="Projects"
              isCollapsed={isCollapsed}
              comingSoon={!isAdmin}
              onComingSoonClick={setComingSoonNotice}
            />

            <NavSection label="Support" isCollapsed={isCollapsed} badge={!isAdmin ? "Coming Soon" : undefined} />
            <NavItem
              href="/itsm"
              icon={<TicketIcon />}
              label="Your Tickets"
              isCollapsed={isCollapsed}
              comingSoon={!isAdmin}
              onComingSoonClick={setComingSoonNotice}
            />
            <NavItem
              href="/itsm/new"
              icon={<ChangeIcon />}
              label="Raise a Ticket"
              isCollapsed={isCollapsed}
              comingSoon={!isAdmin}
              onComingSoonClick={setComingSoonNotice}
            />
          </>
        ) : (
          <>
            <NavSection label="My Work" isCollapsed={isCollapsed} />
            {/* In Phase 1 the live screens come first, in the order a new
                joiner uses them: ask for a project, then log time on it. */}
            {!phase1 && (
              <NavItem href="/my-tasks" icon={<TaskIcon />} label="My Tasks" isCollapsed={isCollapsed} />
            )}
            <NavItem href="/my-projects" icon={<FolderPlusIcon />} label="My Projects" isCollapsed={isCollapsed} />
            <NavItem href="/my-timesheet" icon={<ClockIcon />} label="My Timesheet" isCollapsed={isCollapsed} />
            <NavItem href="/my-skills" icon={<SkillIcon />} label="My Skills" isCollapsed={isCollapsed} />
            {phase1 && (
              <NavItem
                href="/my-tasks"
                icon={<TaskIcon />}
                label="My Tasks"
                isCollapsed={isCollapsed}
                comingSoon
                onComingSoonClick={setComingSoonNotice}
              />
            )}

            <NavSection
              label="Project Management"
              isCollapsed={isCollapsed}
              badge={phase1 ? "Phase 2" : undefined}
            />
            <NavItem
              href="/pmt"
              icon={<FolderIcon />}
              label="Projects"
              isCollapsed={isCollapsed}
              comingSoon={phase1}
              onComingSoonClick={setComingSoonNotice}
            />
            <NavItem
              href="/pmt/governance"
              icon={<ShieldIcon />}
              label="Governance"
              isCollapsed={isCollapsed}
              comingSoon={phase1}
              onComingSoonClick={setComingSoonNotice}
            />

            {/* Timesheet approval and allocation requests. The API scopes what
                each person sees to their own direct reports; admins see all. */}
            {showTeam && (
              <>
                <NavSection label="Team" isCollapsed={isCollapsed} />
                <NavItem href="/admin/timesheets" icon={<ClipboardCheckIcon />} label="Timesheet Approvals" isCollapsed={isCollapsed} />
                <NavItem href="/admin/allocation-requests" icon={<InboxIcon />} label="Team Allocations" isCollapsed={isCollapsed} />
              </>
            )}

            <NavSection
              label="Service Desk"
              isCollapsed={isCollapsed}
              badge={!isAdmin ? "Coming Soon" : undefined}
            />
            <NavItem
              href="/itsm"
              icon={<TicketIcon />}
              label="Tickets"
              isCollapsed={isCollapsed}
              comingSoon={!isAdmin}
              onComingSoonClick={setComingSoonNotice}
            />
            <NavItem
              href="/itsm/changes"
              icon={<ChangeIcon />}
              label="Changes"
              isCollapsed={isCollapsed}
              comingSoon={!isAdmin}
              onComingSoonClick={setComingSoonNotice}
            />
            <NavItem
              href="/itsm/releases"
              icon={<ReleaseIcon />}
              label="Releases"
              isCollapsed={isCollapsed}
              comingSoon={!isAdmin}
              onComingSoonClick={setComingSoonNotice}
            />
            <NavItem
              href="/itsm/consultant-view"
              icon={<UserGroupIcon />}
              label="Consultant View"
              isCollapsed={isCollapsed}
              comingSoon={!isAdmin}
              onComingSoonClick={setComingSoonNotice}
            />
            {canManageItsmMasters && (
              <NavItem
                href="/itsm/masters/groups"
                icon={<DatabaseIcon />}
                label="Assignment Groups"
                isCollapsed={isCollapsed}
                comingSoon={!isAdmin}
                onComingSoonClick={setComingSoonNotice}
              />
            )}
          </>
        )}

        {/* Administration is admin-only. The proxy blocks /admin regardless,
            but showing links that lead to a redirect is its own small cruelty. */}
        {isAdmin && (
          <>
            <NavSection label="Administration" isCollapsed={isCollapsed} />
            <NavItem href="/admin/sales-orders" icon={<UploadCloudIcon />} label="Import Sales Orders" isCollapsed={isCollapsed} />
            <NavItem href="/admin/allocations" icon={<ChartIcon />} label="Resource Allocation" isCollapsed={isCollapsed} />
            <NavItem href="/admin/masters" icon={<DatabaseIcon />} label="Master Data" isCollapsed={isCollapsed} />
            <NavItem href="/admin/roles" icon={<PeopleIcon />} label="People & Roles" isCollapsed={isCollapsed} />
            <NavItem href="/admin/skills" icon={<SkillIcon />} label="Skills" isCollapsed={isCollapsed} />
            <NavItem href="/admin/audit-logs" icon={<ActivityIcon />} label="Audit Logs" isCollapsed={isCollapsed} />
            <NavItem href="/admin/settings" icon={<SettingsIcon />} label="Settings" isCollapsed={isCollapsed} />
          </>
        )}
      </nav>

      {/* ─── Who is signed in ─────────────────────────────────── */}
      <div className="shrink-0 border-t border-white/10 px-3 py-3">
        <div
          className={`flex items-center rounded-lg py-1.5 ${
            isCollapsed ? "justify-center" : "gap-2.5 px-1.5"
          }`}
          title={isCollapsed ? `${user.fullName} — ${user.role?.name ?? ""}` : undefined}
        >
          <Avatar name={user.fullName} size="sm" className="ring-white/15" />
          {!isCollapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold leading-tight text-white">
                {user.fullName}
              </p>
              <p className="truncate text-[11px] leading-tight text-white/45">
                {user.role?.name}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Coming Soon Modal for Phase 2 Modules ──────────────── */}
      {comingSoonNotice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/45 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl p-6 shadow-2xl border border-navy-900/10 max-w-sm w-full space-y-4 animate-in zoom-in-95 duration-150 text-center">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto text-xl shadow-xs">
              <svg className="w-6 h-6 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <div>
              <div className="inline-block px-2.5 py-0.5 rounded-full text-[10.5px] font-semibold bg-amber-100 text-amber-800 border border-amber-200 mb-2">
                Phase 2 Rollout
              </div>
              <h3 className="text-base font-bold text-navy-900">
                {comingSoonNotice} — Coming Soon
              </h3>
              <p className="text-xs text-navy-500 mt-1.5 leading-relaxed">
                {isClient
                  ? "This module will be available in Phase 2."
                  : "This module will be available in Phase 2. For now you can add yourself to the projects you work on, log your weekly timesheet, and keep your skills up to date. Your reporting manager approves timesheets."}
              </p>
            </div>
            <div className="pt-2 flex flex-col gap-2">
              {!isClient && (
                <>
                  <Link
                    href="/my-projects"
                    onClick={() => setComingSoonNotice(null)}
                    className="w-full py-2.5 px-3 text-xs font-semibold text-white bg-navy-900 hover:bg-navy-800 rounded-xl transition-colors shadow-xs"
                  >
                    Go to My Projects
                  </Link>
                  <Link
                    href="/my-timesheet"
                    onClick={() => setComingSoonNotice(null)}
                    className="w-full py-2.5 px-3 text-xs font-semibold text-navy-700 bg-neutral-100 hover:bg-neutral-200 rounded-xl transition-colors"
                  >
                    Go to My Timesheet
                  </Link>
                </>
              )}
              <button
                type="button"
                onClick={() => setComingSoonNotice(null)}
                className="text-xs text-navy-400 hover:text-navy-600 py-1 transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
