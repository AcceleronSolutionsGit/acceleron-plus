"use client";

import React, { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import type { User } from "@/lib/types";
import { Avatar } from "@/components/ui/Avatar";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { deriveAppRole } from "@/lib/session";
import { GuideLauncher } from "@/components/guide/GuideLauncher";
import { DropdownPanel } from "@/components/ui/DropdownPanel";

/**
 * Where you are, said in words.
 *
 * The bar used to display the product name on every screen, which told
 * nobody anything they did not already know. A trail is derived from the
 * path instead: it is always correct, it costs no data, and every step
 * but the last is a link back.
 */
const SEGMENT_LABELS: Record<string, string> = {
  pmt: "Projects",
  itsm: "Service Desk",
  admin: "Administration",
  portal: "Your Projects",
  leads: "Lead Pipeline",
  governance: "Governance",
  changes: "Changes",
  releases: "Releases",
  masters: "Master Data",
  allocations: "Resource Allocation",
  reports: "Reports",
  roles: "People & Roles",
  skills: "Skills",
  "consultant-view": "Consultant View",
  "my-tasks": "My Tasks",
  "my-timesheet": "My Timesheet",
  "my-skills": "My Skills",
  "my-projects": "My Projects",
  "allocation-requests": "Team Allocations",
  timesheets: "Timesheet Approvals",
  new: "New",
};

function labelFor(segment: string) {
  if (SEGMENT_LABELS[segment]) return SEGMENT_LABELS[segment];
  // Record ids stay as they are — a project code is more useful in a
  // trail than the word "Detail".
  if (/^[0-9a-f-]{8,}$/i.test(segment) || /^[A-Z]{2,4}-\d+$/.test(segment)) {
    return segment.length > 12 ? "Detail" : segment;
  }
  return segment
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function Breadcrumbs() {
  const pathname = usePathname();
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 text-[13px]">
        {parts.map((part, i) => {
          const href = "/" + parts.slice(0, i + 1).join("/");
          const last = i === parts.length - 1;
          return (
            <li key={href} className="flex min-w-0 items-center gap-1.5">
              {i > 0 && (
                <svg
                  aria-hidden
                  viewBox="0 0 12 12"
                  className="h-3 w-3 shrink-0 text-navy-300"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m4.5 2.5 3.5 3.5-3.5 3.5" />
                </svg>
              )}
              {last ? (
                <span
                  aria-current="page"
                  className="truncate font-semibold text-navy-900"
                >
                  {labelFor(part)}
                </span>
              ) : (
                <Link
                  href={href}
                  className="truncate text-navy-400 transition-colors duration-150 hover:text-navy-700"
                >
                  {labelFor(part)}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function TopBar({ user }: { user: User }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const appRole = deriveAppRole(user.role?.code);
  const isClient = appRole === "client";

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  return (
    <header
      className={[
        "flex h-[60px] shrink-0 items-center justify-between gap-4 px-6",
        // Translucent and blurred, so content scrolling underneath is
        // felt rather than cut off by an opaque bar.
        "relative z-30 border-b border-navy-900/8 bg-surface/85 backdrop-blur-md",
        "shadow-xs",
      ].join(" ")}
    >
      <Breadcrumbs />

      <div className="flex shrink-0 items-center gap-1">
        {/* Every role gets this, including clients — what differs is
            which walkthroughs are behind it. */}
        <GuideLauncher role={appRole} />

        <NotificationBell />

        <div className="relative">
          <button
            ref={menuButtonRef}
            onClick={() => setMenuOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className={[
              "flex cursor-pointer items-center gap-2 rounded-lg py-1.5 pl-1.5 pr-2",
              "transition-colors duration-200 hover:bg-navy-900/6",
              menuOpen && "bg-navy-900/6",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <Avatar name={user.fullName} size="sm" />
            <span className="hidden text-left text-[13px] font-semibold text-navy-800 sm:block">
              {user.fullName}
            </span>
            <svg
              className={`h-3.5 w-3.5 text-navy-400 transition-transform duration-200 ${
                menuOpen ? "rotate-180" : ""
              }`}
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m4 6.5 4 4 4-4" />
            </svg>
          </button>

          <DropdownPanel
            anchorRef={menuButtonRef}
            open={menuOpen}
            onClose={() => setMenuOpen(false)}
            width={240}
            label="Your account"
          >
            <div className="flex items-center gap-3 border-b border-navy-900/8 bg-surface-2 px-4 py-3">
              <Avatar name={user.fullName} size="md" />
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold text-navy-900">
                  {user.fullName}
                </p>
                <p className="truncate text-[11.5px] text-navy-400">{user.email}</p>
              </div>
            </div>

            {/* Not for a client — the proxy would bounce them straight
                back to the portal, which reads as the app being broken. */}
            {!isClient && (
              <Link
                href="/my-skills"
                role="menuitem"
                onClick={() => setMenuOpen(false)}
                className="block px-4 py-2.5 text-[13px] text-navy-700 transition-colors hover:bg-navy-900/5"
              >
                My Skills
              </Link>
            )}
            <Link
              href="/change-password"
              role="menuitem"
              onClick={() => setMenuOpen(false)}
              className="block px-4 py-2.5 text-[13px] text-navy-700 transition-colors hover:bg-navy-900/5"
            >
              Change Password
            </Link>
            <button
              role="menuitem"
              onClick={handleLogout}
              className="w-full cursor-pointer border-t border-navy-900/8 px-4 py-2.5 text-left text-[13px] font-medium text-danger transition-colors hover:bg-danger-bg"
            >
              Sign Out
            </button>
          </DropdownPanel>
        </div>
      </div>
    </header>
  );
}
