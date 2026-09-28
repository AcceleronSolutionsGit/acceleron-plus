"use client";

import React, { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
}

const sizes = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  className,
  size = "md",
}: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = React.useId();

  // Held in a ref so a parent passing a fresh arrow function each render
  // does not re-run the effect below. It used to: every keystroke in a
  // form re-rendered the parent, the effect tore down and re-ran, and
  // focus was yanked from the field back to the dialog.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      // Keep Tab inside the dialog. Without this, tabbing walks out of
      // the modal and into the page behind it, which is still there.
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Focus the panel, not the first field: landing straight in a text
    // box means a screen reader starts mid-form with no idea what this is.
    panelRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      onMouseDown={(e) => e.target === overlayRef.current && onClose()}
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center p-4",
        "bg-navy-900/35 backdrop-blur-[3px]",
        "animate-[reveal_200ms_var(--ease-out-soft)_both]"
      )}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          "flex w-full flex-col overflow-hidden rounded-2xl bg-surface shadow-xl outline-none",
          "border border-white/60",
          "animate-[modal-in_320ms_var(--ease-out-soft)_both]",
          sizes[size],
          className
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-navy-900/8 px-6 py-4">
          <div className="min-w-0">
            <h3
              id={titleId}
              className="text-display flex items-center gap-2.5 text-[17px] font-bold tracking-[-0.015em] text-navy-900"
            >
              <span aria-hidden className="h-4 w-[3px] shrink-0 rounded-full bg-red-600" />
              {title}
            </h3>
            {description && (
              <p className="mt-1 pl-[22px] text-[13px] text-navy-500">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={cn(
              "-mr-1 -mt-1 shrink-0 cursor-pointer rounded-lg p-1.5 text-navy-400",
              "transition-colors duration-200 hover:bg-navy-900/6 hover:text-navy-900"
            )}
          >
            <svg className="h-4.5 w-4.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </div>

        <div className="max-h-[70vh] flex-1 overflow-y-auto px-6 py-5">{children}</div>

        {footer && (
          <div className="flex items-center justify-end gap-2.5 border-t border-navy-900/8 bg-surface-2 px-6 py-3.5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
