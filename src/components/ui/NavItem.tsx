"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface NavItemProps {
  href: string;
  icon: React.ReactNode;
  label: string;
  count?: number;
  isCollapsed?: boolean;
  comingSoon?: boolean;
  onComingSoonClick?: (label: string) => void;
}

export function NavItem({
  href,
  icon,
  label,
  count,
  isCollapsed,
  comingSoon = false,
  onComingSoonClick,
}: NavItemProps) {
  const pathname = usePathname();
  // Exact match for the section roots, prefix match below them
  const isActive = !comingSoon && (pathname === href || pathname.startsWith(href + "/"));

  if (comingSoon) {
    return (
      <div className="group relative">
        <button
          type="button"
          onClick={() => onComingSoonClick?.(label)}
          aria-label={`${label} — Coming Soon`}
          data-guide={`nav:${href}`}
          className={cn(
            "w-full text-left chevron-mark relative flex items-center overflow-hidden rounded-lg",
            "py-2 text-[13.5px] font-medium cursor-pointer transition-all duration-200",
            "opacity-45 grayscale contrast-85 hover:opacity-85 hover:grayscale-0 hover:contrast-100",
            "text-white/60 hover:bg-white/8 hover:text-white",
            isCollapsed ? "justify-center px-2" : "gap-3 pl-3.5 pr-2.5"
          )}
        >
          <span className="h-[18px] w-[18px] shrink-0 text-white/50 group-hover:text-amber-300 transition-colors duration-200">
            {icon}
          </span>

          {!isCollapsed && (
            <>
              <span className="flex-1 truncate">{label}</span>
              <span className="shrink-0 text-[10px] font-semibold text-amber-300 bg-amber-400/15 border border-amber-400/25 px-1.5 py-0.5 rounded tracking-wide shadow-2xs group-hover:bg-amber-400/25 transition-colors">
                Coming soon
              </span>
            </>
          )}

          {/* Collapsed rail hover tooltip */}
          {isCollapsed && (
            <span
              role="tooltip"
              className={cn(
                "pointer-events-none absolute left-[calc(100%+10px)] z-50 whitespace-nowrap rounded-md",
                "bg-navy-900 border border-white/10 px-2.5 py-1.5 text-[12.5px] font-medium text-white shadow-xl",
                "opacity-0 translate-x-1 transition-all duration-200 ease-[var(--ease-out-soft)]",
                "group-hover:opacity-100 group-hover:translate-x-0 flex items-center gap-2"
              )}
            >
              <span>{label}</span>
              <span className="text-[10px] font-semibold text-amber-300 bg-amber-400/20 border border-amber-400/30 px-1.5 py-0.5 rounded">
                Coming soon
              </span>
            </span>
          )}
        </button>

        {/* Hover hint for expanded state */}
        {!isCollapsed && (
          <span
            className={cn(
              "pointer-events-none absolute left-full ml-2 top-1/2 -translate-y-1/2 z-50 whitespace-nowrap rounded-md",
              "bg-navy-950/95 border border-amber-400/25 px-2.5 py-1 text-[11px] font-medium text-amber-200 shadow-xl",
              "opacity-0 transition-opacity duration-150 group-hover:opacity-100 hidden xl:inline-block"
            )}
          >
            Click for details · Phase 2
          </span>
        )}
      </div>
    );
  }

  return (
    <Link
      href={href}
      title={isCollapsed ? label : undefined}
      aria-current={isActive ? "page" : undefined}
      data-active={isActive}
      data-guide={`nav:${href}`}
      className={cn(
        "chevron-mark group relative flex items-center overflow-hidden rounded-lg",
        "py-2 text-[13.5px] font-medium",
        "transition-[background,color] duration-200 ease-[var(--ease-out-soft)]",
        isCollapsed ? "justify-center px-2" : "gap-3 pl-3.5 pr-2.5",
        isActive
          ? "bg-white/12 text-white"
          : "text-white/62 hover:bg-white/7 hover:text-white"
      )}
    >
      <span
        className={cn(
          "h-[18px] w-[18px] shrink-0 transition-colors duration-200",
          isActive ? "text-white" : "text-white/50 group-hover:text-white/90"
        )}
      >
        {icon}
      </span>
      {!isCollapsed && <span className="flex-1 truncate">{label}</span>}
      {!isCollapsed && count !== undefined && count > 0 && (
        <span
          className={cn(
            "min-w-[20px] rounded-md px-1.5 py-0.5 text-center text-[10.5px] font-bold tabular-nums",
            "transition-colors duration-200",
            isActive ? "bg-white/20 text-white" : "bg-white/10 text-white/60"
          )}
        >
          {count}
        </span>
      )}
      {/* Collapsed rail tooltip */}
      {isCollapsed && (
        <span
          role="tooltip"
          className={cn(
            "pointer-events-none absolute left-[calc(100%+10px)] z-50 whitespace-nowrap rounded-md",
            "bg-navy-900 px-2.5 py-1.5 text-[12.5px] font-medium text-white shadow-lg",
            "opacity-0 translate-x-1 transition-all duration-200 ease-[var(--ease-out-soft)]",
            "group-hover:opacity-100 group-hover:translate-x-0"
          )}
        >
          {label}
          {count !== undefined && count > 0 && (
            <span className="ml-1.5 text-white/60 tabular-nums">{count}</span>
          )}
        </span>
      )}
    </Link>
  );
}

/** Section label in the sidebar nav. */
export function NavSection({
  label,
  isCollapsed,
  badge,
}: {
  label: string;
  isCollapsed?: boolean;
  badge?: string;
}) {
  if (isCollapsed) {
    return <div className="mx-auto my-3 h-px w-6 bg-white/12" aria-hidden />;
  }
  return (
    <div className="flex items-center justify-between px-3.5 pb-1.5 pt-5">
      <p className="truncate text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">
        {label}
      </p>
      {badge && (
        <span className="text-[9px] uppercase tracking-wider font-semibold text-amber-300/80 bg-amber-400/10 border border-amber-400/20 px-1.5 py-0.2 rounded">
          {badge}
        </span>
      )}
    </div>
  );
}
