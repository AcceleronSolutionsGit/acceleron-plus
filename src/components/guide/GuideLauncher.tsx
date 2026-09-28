"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { DropdownPanel } from "@/components/ui/DropdownPanel";
import { usePathname } from "next/navigation";
import { useGuide } from "./GuideProvider";
import { guidesForPath, guidesForRole, type Guide } from "@/lib/guides";
import type { AppRole } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * The Guide button, and the panel behind it.
 *
 * Every role gets one — what differs is what is inside. The panel puts
 * the walkthroughs for the page you are on at the top, because somebody
 * opening help on the timesheet almost certainly wants the timesheet
 * one, not a list of thirteen.
 */
export function GuideLauncher({ role }: { role: AppRole }) {
  const pathname = usePathname();
  const { start, completed, isNew, markSeen, activeGuideId } = useGuide();
  const [open, setOpen] = useState(false);

  const all = useMemo(() => guidesForRole(role), [role]);
  const here = useMemo(() => guidesForPath(role, pathname), [role, pathname]);
  const hereIds = useMemo(() => new Set(here.map((g) => g.id)), [here]);

  const rest = useMemo(() => all.filter((g) => !hereIds.has(g.id)), [all, hereIds]);

  const grouped = useMemo(() => {
    const map = new Map<string, Guide[]>();
    rest.forEach((g) => {
      const list = map.get(g.group) ?? [];
      list.push(g);
      map.set(g.group, list);
    });
    return [...map.entries()];
  }, [rest]);

  // Starting a tour closes the panel — the tour needs the screen.
  useEffect(() => {
    if (activeGuideId) setOpen(false);
  }, [activeGuideId]);

  const toggle = () => {
    setOpen((o) => !o);
    if (isNew) markSeen();
  };

  // DropdownPanel portals this to the body. Left inside the top bar it
  // inherits the bar's `backdrop-blur` compositing group, which made an
  // opaque panel render see-through and let page content paint over it.
  const buttonRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        data-guide="guide:launcher"
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          "relative flex cursor-pointer items-center gap-1.5 rounded-lg py-1.5 pl-2 pr-2.5",
          "text-[13px] font-semibold transition-colors duration-200",
          open ? "bg-navy-900/8 text-navy-900" : "text-navy-500 hover:bg-navy-900/6 hover:text-navy-900"
        )}
      >
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="10" cy="10" r="7.5" />
          <path d="M7.9 7.6a2.2 2.2 0 1 1 3 2.05c-.55.25-.9.8-.9 1.4v.2" />
          <path d="M10 14.2h.01" />
        </svg>
        <span className="hidden sm:inline">Guide</span>
        {/* Nudged once, until they open it. After that it stays quiet —
            a permanent badge is just decoration. */}
        {isNew && (
          <span
            aria-hidden
            className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-red-600 ring-2 ring-surface"
          />
        )}
      </button>

      <DropdownPanel
        anchorRef={buttonRef}
        open={open}
        onClose={() => setOpen(false)}
        width={380}
        label="Guides"
        role="dialog"
        className="flex max-h-[min(640px,80vh)] flex-col"
      >
        <>
            <div className="shrink-0 border-b border-navy-900/8 bg-surface-2 px-4 py-3">
              <h3 className="text-display flex items-center gap-2.5 text-[15px] font-bold text-navy-900">
                <span aria-hidden className="h-3.5 w-[3px] rounded-full bg-red-600" />
                How do I…?
              </h3>
              <p className="mt-1 pl-[22px] text-[12px] leading-snug text-navy-400">
                Pick one and it will walk you through it, pointing at each thing
                as you go.
              </p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-2.5">
              {here.length > 0 && (
                <Section label="For this page">
                  {here.map((g) => (
                    <GuideRow
                      key={g.id}
                      guide={g}
                      done={completed.includes(g.id)}
                      onStart={() => start(g.id)}
                    />
                  ))}
                </Section>
              )}

              {grouped.map(([group, list]) => (
                <Section key={group} label={group}>
                  {list.map((g) => (
                    <GuideRow
                      key={g.id}
                      guide={g}
                      done={completed.includes(g.id)}
                      onStart={() => start(g.id)}
                    />
                  ))}
                </Section>
              ))}
            </div>

            <div className="shrink-0 border-t border-navy-900/8 bg-surface-2 px-4 py-2.5 text-[11.5px] text-navy-400">
              {completed.length} of {all.length} done · Escape leaves a guide at any point
            </div>
        </>
      </DropdownPanel>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-1.5">
      <p className="px-2 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.14em] text-navy-300">
        {label}
      </p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function GuideRow({
  guide,
  done,
  onStart,
}: {
  guide: Guide;
  done: boolean;
  onStart: () => void;
}) {
  return (
    <button
      onClick={onStart}
      className={cn(
        "group flex w-full cursor-pointer items-start gap-2.5 rounded-lg px-2 py-2 text-left",
        "transition-colors duration-150 hover:bg-navy-900/5"
      )}
    >
      <span
        className={cn(
          "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full transition-colors",
          done ? "bg-success-bg text-success" : "bg-navy-900/7 text-navy-400 group-hover:text-navy-700"
        )}
        aria-hidden
      >
        {done ? (
          <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m2.5 6.2 2.3 2.3L9.5 3.8" />
          </svg>
        ) : (
          <svg className="h-2.5 w-2.5" viewBox="0 0 10 10" fill="currentColor">
            <path d="M2.5 1.3 8.2 5 2.5 8.7z" />
          </svg>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="text-[13px] font-semibold text-navy-900">{guide.title}</span>
          <span className="shrink-0 text-[10.5px] tabular-nums text-navy-300">
            {guide.minutes} min
          </span>
        </span>
        <span className="mt-0.5 block text-[12px] leading-snug text-navy-400">
          {guide.summary}
        </span>
      </span>
    </button>
  );
}
