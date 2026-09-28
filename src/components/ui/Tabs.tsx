"use client";

import React, { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface Tab {
  id: string;
  label: string;
  icon?: React.ReactNode;
  count?: number;
}

interface TabsProps {
  tabs: Tab[];
  defaultTab?: string;
  onTabChange?: (tabId: string) => void;
  children: (activeTab: string) => React.ReactNode;
  className?: string;
}

export function Tabs({ tabs, defaultTab, onTabChange, children, className }: TabsProps) {
  const [activeTab, setActiveTab] = useState(defaultTab || tabs[0]?.id || "");
  const listRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  // One underline that slides between tabs, rather than a border that
  // blinks off one button and on to another. The movement is what makes
  // the relationship between the two tabs legible.
  useLayoutEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-tab="${activeTab}"]`);
    if (!el) return;
    setIndicator({ left: el.offsetLeft, width: el.offsetWidth });
  }, [activeTab, tabs]);

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    onTabChange?.(tabId);
  };

  // Arrow keys move between tabs — this is a tablist, and a keyboard
  // user should not have to Tab through every one to reach the last.
  const onKeyDown = (e: React.KeyboardEvent) => {
    const i = tabs.findIndex((t) => t.id === activeTab);
    if (i < 0) return;
    const next =
      e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const target = tabs[(next + tabs.length) % tabs.length];
    handleTabChange(target.id);
    listRef.current
      ?.querySelector<HTMLElement>(`[data-tab="${target.id}"]`)
      ?.focus();
  };

  return (
    <div className={className}>
      <div
        ref={listRef}
        role="tablist"
        onKeyDown={onKeyDown}
        className="relative mb-5 flex items-center gap-0.5 overflow-x-auto border-b border-navy-900/10"
      >
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              data-tab={tab.id}
              data-guide={`tab:${tab.id}`}
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              onClick={() => handleTabChange(tab.id)}
              className={cn(
                "relative flex shrink-0 cursor-pointer items-center gap-2 rounded-t-lg px-3.5 py-2.5",
                "text-[13.5px] font-semibold transition-colors duration-200",
                active
                  ? "text-navy-900"
                  : "text-navy-400 hover:bg-navy-900/4 hover:text-navy-700"
              )}
            >
              {tab.icon && <span className="h-4 w-4">{tab.icon}</span>}
              {tab.label}
              {tab.count !== undefined && (
                <span
                  className={cn(
                    "rounded-md px-1.5 py-0.5 text-[10.5px] font-bold tabular-nums transition-colors",
                    active ? "bg-navy-900/10 text-navy-800" : "bg-navy-900/6 text-navy-400"
                  )}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
        {indicator && (
          <span
            aria-hidden
            className="absolute bottom-0 h-[2px] rounded-full bg-red-600 transition-[left,width] duration-300 ease-[var(--ease-out-soft)]"
            style={{ left: indicator.left, width: indicator.width }}
          />
        )}
      </div>
      <div role="tabpanel">{children(activeTab)}</div>
    </div>
  );
}

/**
 * A compact segmented control — for switching a view rather than a page.
 * Groups the choices inside one track, so it reads as one control.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
  size = "md",
}: {
  options: { value: T; label: React.ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg border border-navy-900/10 bg-surface-2 p-0.5",
        className
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "cursor-pointer rounded-[6px] font-semibold transition-all duration-200 ease-[var(--ease-out-soft)]",
              size === "sm" ? "px-2.5 py-1 text-[12px]" : "px-3 py-1.5 text-[13px]",
              active
                ? "bg-surface text-navy-900 shadow-xs"
                : "text-navy-400 hover:text-navy-700"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
