"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface PmtHeaderTabsProps {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
}

const TABS = [
  { label: "Active Projects", href: "/pmt", badge: "Delivery", exact: true },
  { label: "Portfolio Dashboard", href: "/pmt/dashboard", badge: "KPIs", exact: true },
  { label: "Leads & Pipeline", href: "/pmt/leads", badge: "Pre-Sales", exact: false },
  { label: "Enterprise Governance", href: "/pmt/governance", badge: "Stage-Gates", exact: false },
];

export function PmtHeaderTabs({ title, subtitle, action }: PmtHeaderTabsProps) {
  const pathname = usePathname();

  return (
    <div className="mb-6 space-y-5">
      {title && (
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div className="min-w-0">
            <h1 className="text-display text-[26px] font-bold leading-tight tracking-[-0.025em] text-navy-900">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-1.5 text-[13.5px] leading-snug text-navy-500">{subtitle}</p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}

      <div className="flex items-center gap-1 overflow-x-auto border-b border-navy-900/10">
        {TABS.map((tab) => {
          const isActive = tab.exact
            ? pathname === tab.href
            : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={isActive ? "page" : undefined}
              data-guide={`pmt-tab:${tab.href}`}
              className={cn(
                "group relative flex shrink-0 items-center gap-2 whitespace-nowrap rounded-t-lg px-3.5 py-2.5",
                "text-[13.5px] font-semibold transition-colors duration-200",
                isActive
                  ? "text-navy-900"
                  : "text-navy-400 hover:bg-navy-900/4 hover:text-navy-700"
              )}
            >
              <span>{tab.label}</span>
              <span
                className={cn(
                  "rounded-md px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.08em]",
                  "transition-colors duration-200",
                  isActive
                    ? "bg-navy-900/10 text-navy-700"
                    : "bg-navy-900/5 text-navy-300 group-hover:text-navy-400"
                )}
              >
                {tab.badge}
              </span>
              {/* The active marker is the brand red, matching the rule in
                  every section heading and the bar on the active nav item.
                  One colour means "you are here", everywhere. */}
              {isActive && (
                <span
                  aria-hidden
                  className="absolute inset-x-1 bottom-0 h-[2px] rounded-full bg-red-600"
                />
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
