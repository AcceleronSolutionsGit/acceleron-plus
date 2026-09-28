"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// ═══════════════════════════════════════════════════════════════
// A select you can type into.
//
// A native <select> is fine for four options and useless for four
// hundred: finding "Bengaluru" in a department list means scrolling, or
// knowing to type fast enough that the browser's own type-ahead treats
// the keystrokes as one word. Every filter in this app draws its
// options from live data, so none of them has a fixed small length.
//
// Matching is on the label, case-insensitively, anywhere in the string
// rather than only at the start — people search for "ERP" expecting to
// find "Gainwell ERP Rollout".
// ═══════════════════════════════════════════════════════════════

export interface ComboboxOption {
  value: string;
  label: string;
  /** Shown quietly to the right — a count, a code, a department. */
  hint?: string;
  /** Extra text the search matches but never shows — a client, a reference. */
  keywords?: string;
  /** A second, quieter line under the label. */
  detail?: string;
}

interface ComboboxProps {
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  label?: React.ReactNode;
  /** Shown when nothing is selected. */
  placeholder?: string;
  /** Placeholder inside the search box once it is open. */
  searchPlaceholder?: string;
  hint?: React.ReactNode;
  error?: string;
  disabled?: boolean;
  className?: string;
  fieldClassName?: string;
  /** Below this many options the search box is hidden — it would be noise. */
  searchThreshold?: number;
  "data-guide"?: string;
}

export function Combobox({
  options,
  value,
  onChange,
  label,
  placeholder = "Select…",
  searchPlaceholder = "Type to search…",
  hint,
  error,
  disabled,
  className,
  fieldClassName,
  searchThreshold = 7,
  ...rest
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const [above, setAbove] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const id = useId().replace(/:/g, "");
  const listId = `combo-${id}`;

  const selected = options.find((o) => o.value === value);
  const showSearch = options.length >= searchThreshold;

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.hint ?? "").toLowerCase().includes(q) ||
        (o.keywords ?? "").toLowerCase().includes(q) ||
        (o.detail ?? "").toLowerCase().includes(q) ||
        o.value.toLowerCase().includes(q)
    );
  }, [options, query]);

  // Opening lands the cursor on what is already chosen, not on the top
  // of the list — otherwise Enter silently changes your selection.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    const i = matches.findIndex((o) => o.value === value);
    setCursor(i >= 0 ? i : 0);

    // Flip upwards near the bottom of the window rather than opening a
    // menu that is cut off by the viewport.
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) setAbove(rect.bottom + 300 > window.innerHeight && rect.top > 320);

    const t = setTimeout(() => showSearch && searchRef.current?.focus(), 20);
    return () => clearTimeout(t);
    // `matches` is deliberately not a dependency: this is the opening
    // snapshot, and re-running it as you type would fight the cursor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Typing resets the cursor to the first match, so Enter always picks
  // the thing at the top of what you can see.
  useEffect(() => {
    if (open) setCursor(0);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Keep the highlighted row in view when arrowing past the fold.
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${cursor}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [cursor, open]);

  const choose = (option: ComboboxOption) => {
    onChange(option.value);
    setOpen(false);
    buttonRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }

    switch (e.key) {
      case "Escape":
        e.preventDefault();
        setOpen(false);
        buttonRef.current?.focus();
        break;
      case "ArrowDown":
        e.preventDefault();
        setCursor((c) => Math.min(c + 1, matches.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setCursor((c) => Math.max(c - 1, 0));
        break;
      case "Home":
        e.preventDefault();
        setCursor(0);
        break;
      case "End":
        e.preventDefault();
        setCursor(matches.length - 1);
        break;
      case "Enter":
        e.preventDefault();
        if (matches[cursor]) choose(matches[cursor]);
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  };

  return (
    <div className={cn("space-y-1.5", fieldClassName)} ref={rootRef}>
      {label && (
        <span className="block text-[13px] font-semibold text-navy-700">{label}</span>
      )}

      <div className="relative">
        <button
          ref={buttonRef}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={open ? listId : undefined}
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
          onKeyDown={onKeyDown}
          {...rest}
          className={cn(
            "flex h-9 w-full items-center justify-between gap-2 rounded-lg px-3 text-left text-sm",
            "border bg-surface shadow-xs transition-[border-color,box-shadow] duration-200",
            "disabled:cursor-not-allowed disabled:bg-surface-3 disabled:text-navy-400",
            error
              ? "border-danger/60 focus:border-danger focus:shadow-[0_0_0_3px_rgb(192_57_43_/_0.14)]"
              : "border-navy-900/14 hover:border-navy-900/25 focus:border-navy-700 focus:shadow-[0_0_0_3px_rgb(33_47_96_/_0.12)]",
            "focus:outline-none",
            !disabled && "cursor-pointer",
            className
          )}
        >
          <span
            className={cn("min-w-0 truncate", selected ? "text-navy-900" : "text-navy-300")}
          >
            {selected?.label ?? placeholder}
          </span>
          <svg
            aria-hidden
            viewBox="0 0 12 12"
            className={cn(
              "h-3 w-3 shrink-0 text-navy-400 transition-transform duration-200",
              open && "rotate-180"
            )}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 4.5 6 7.5 9 4.5" />
          </svg>
        </button>

        {open && (
          <div
            className={cn(
              "absolute z-50 w-full min-w-[220px] overflow-hidden rounded-xl",
              "border border-navy-900/10 bg-surface shadow-lg",
              "animate-[modal-in_140ms_var(--ease-out-soft)_both]",
              above ? "bottom-[calc(100%+6px)] origin-bottom" : "top-[calc(100%+6px)] origin-top"
            )}
          >
            {showSearch && (
              <div className="border-b border-navy-900/8 p-2">
                <div className="relative">
                  <svg
                    aria-hidden
                    viewBox="0 0 16 16"
                    className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-navy-300"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  >
                    <circle cx="7" cy="7" r="4.5" />
                    <path d="m10.5 10.5 3 3" />
                  </svg>
                  <input
                    ref={searchRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder={searchPlaceholder}
                    aria-label="Search the options"
                    autoComplete="off"
                    spellCheck={false}
                    className={cn(
                      "h-8 w-full rounded-md border border-navy-900/12 bg-surface-2 pl-8 pr-2 text-[13px]",
                      "text-navy-900 placeholder:text-navy-300",
                      "focus:border-navy-700 focus:bg-surface focus:outline-none"
                    )}
                  />
                </div>
              </div>
            )}

            <ul
              ref={listRef}
              id={listId}
              role="listbox"
              className="max-h-64 overflow-y-auto p-1"
            >
              {matches.length === 0 ? (
                <li className="px-3 py-6 text-center text-[12.5px] text-navy-400">
                  Nothing matches &ldquo;{query}&rdquo;
                </li>
              ) : (
                matches.map((o, i) => {
                  const isSelected = o.value === value;
                  return (
                    <li key={o.value || `__blank-${i}`} data-index={i}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onMouseEnter={() => setCursor(i)}
                        onClick={() => choose(o)}
                        className={cn(
                          "flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-left",
                          "text-[13px] transition-colors duration-100",
                          i === cursor ? "bg-navy-900/7" : "bg-transparent",
                          isSelected ? "font-semibold text-navy-900" : "text-navy-700"
                        )}
                      >
                        <span
                          className={cn(
                            "grid h-3.5 w-3.5 shrink-0 place-items-center",
                            isSelected ? "text-red-600" : "text-transparent"
                          )}
                          aria-hidden
                        >
                          <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="m2.5 6.2 2.3 2.3L9.5 3.8" />
                          </svg>
                        </span>
                        {o.detail ? (
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">{o.label}</span>
                            <span className="block truncate text-[11.5px] font-normal text-navy-400">
                              {o.detail}
                            </span>
                          </span>
                        ) : (
                          <span className="min-w-0 flex-1 truncate">{o.label}</span>
                        )}
                        {o.hint && (
                          <span className="shrink-0 text-[11.5px] tabular-nums text-navy-300">
                            {o.hint}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })
              )}
            </ul>

            {showSearch && matches.length > 0 && (
              <div className="border-t border-navy-900/8 px-3 py-1.5 text-[11px] text-navy-300">
                {matches.length} of {options.length}
              </div>
            )}
          </div>
        )}
      </div>

      {error ? (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs leading-snug text-navy-400">{hint}</p>
      ) : null}
    </div>
  );
}
