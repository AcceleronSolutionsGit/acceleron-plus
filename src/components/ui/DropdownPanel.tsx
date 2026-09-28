"use client";

import React, { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

// ═══════════════════════════════════════════════════════════════
// A panel that hangs off a button, rendered at the top of the page.
//
// Every dropdown in the top bar used to be an `absolute` child of the
// bar itself. That bar carries `backdrop-blur`, and an element with a
// backdrop-filter creates a stacking context its children cannot
// escape: a `z-50` menu inside it still paints *below* ordinary page
// content, because the whole bar is being composited as one layer.
//
// The symptom was a profile menu with a Save button punched through the
// middle of it. No z-index on the menu could have fixed that — the menu
// had to leave the bar. So it is portalled to the body and positioned
// against its trigger's measured rectangle.
// ═══════════════════════════════════════════════════════════════

interface DropdownPanelProps {
  /** The button this hangs from. */
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Which edge lines up with the trigger. */
  align?: "left" | "right";
  width?: number;
  className?: string;
  label?: string;
  role?: "menu" | "dialog" | "listbox";
}

export function DropdownPanel({
  anchorRef,
  open,
  onClose,
  children,
  align = "right",
  width = 240,
  className,
  label,
  role = "menu",
}: DropdownPanelProps) {
  const [mounted, setMounted] = useState(false);
  const [box, setBox] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => setMounted(true), []);

  const measure = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const gap = 6;

    let left = align === "right" ? rect.right - width : rect.left;
    // Never let it hang off the side of the window.
    left = Math.min(Math.max(8, left), window.innerWidth - width - 8);

    setBox({ top: rect.bottom + gap, left });
  }, [anchorRef, align, width]);

  // Measured before paint, so it never appears in the wrong place first.
  useLayoutEffect(() => {
    if (!open) return;
    measure();
  }, [open, measure]);

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    // `capture` so a scroll inside any container repositions it, not
    // just a scroll of the window.
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    document.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, measure, onClose]);

  if (!open || !mounted || !box) return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[70]" onClick={onClose} aria-hidden />
      <div
        role={role}
        aria-label={label}
        style={{ top: box.top, left: box.left, width }}
        className={cn(
          "fixed z-[71] overflow-hidden rounded-xl",
          "border border-navy-900/8 bg-surface shadow-lg",
          "animate-[modal-in_180ms_var(--ease-out-soft)_both]",
          align === "right" ? "origin-top-right" : "origin-top-left",
          className
        )}
      >
        {children}
      </div>
    </>,
    document.body
  );
}
