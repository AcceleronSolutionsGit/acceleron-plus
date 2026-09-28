"use client";

import React, { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

// ═══════════════════════════════════════════════════════════════
// Small, quiet confirmations — "PM updated", "Project created" — that
// replace `alert()`. A module-level store, so any component can call
// `toast.success(...)`; one <Toaster /> on the page draws them.
// ═══════════════════════════════════════════════════════════════

export type ToastTone = "success" | "error" | "info";

export interface ToastItem {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  duration: number;
}

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function push(tone: ToastTone, title: string, options?: Partial<Omit<ToastItem, "id" | "tone" | "title">>) {
  const item: ToastItem = {
    id: nextId++,
    tone,
    title,
    description: options?.description,
    action: options?.action,
    duration: options?.duration ?? (tone === "error" ? 6500 : 3800),
  };
  // Four at most — a stack of old news is noise.
  items = [...items, item].slice(-4);
  emit();
  return item.id;
}

export function dismissToast(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

export const toast = {
  success: (title: string, options?: Partial<Omit<ToastItem, "id" | "tone" | "title">>) =>
    push("success", title, options),
  error: (title: string, options?: Partial<Omit<ToastItem, "id" | "tone" | "title">>) =>
    push("error", title, options),
  info: (title: string, options?: Partial<Omit<ToastItem, "id" | "tone" | "title">>) =>
    push("info", title, options),
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const EMPTY: ToastItem[] = [];

export function Toaster() {
  const list = useSyncExternalStore(subscribe, () => items, () => EMPTY);
  const [mounted, setMounted] = React.useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-5 right-5 z-[90] flex w-[360px] max-w-[calc(100vw-2.5rem)] flex-col gap-2"
    >
      {list.map((t) => (
        <ToastCard key={t.id} item={t} />
      ))}
    </div>,
    document.body
  );
}

function ToastCard({ item }: { item: ToastItem }) {
  useEffect(() => {
    const timer = setTimeout(() => dismissToast(item.id), item.duration);
    return () => clearTimeout(timer);
  }, [item.id, item.duration]);

  const icon = {
    success: (
      <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m3.5 8.3 2.9 2.9 6.1-6.4" />
      </svg>
    ),
    error: (
      <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M8 4.5v4M8 11.2v.3" />
      </svg>
    ),
    info: (
      <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M8 7.5v4M8 4.6v.3" />
      </svg>
    ),
  }[item.tone];

  return (
    <div
      role={item.tone === "error" ? "alert" : "status"}
      className={cn(
        "pointer-events-auto flex items-start gap-3 rounded-xl border bg-surface px-4 py-3 shadow-lg",
        "animate-[toast-in_260ms_var(--ease-out-soft)_both]",
        item.tone === "error" ? "border-danger/25" : "border-navy-900/10"
      )}
    >
      <span
        className={cn(
          "mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full",
          item.tone === "success" && "bg-success-bg text-success",
          item.tone === "error" && "bg-danger-bg text-danger",
          item.tone === "info" && "bg-info-bg text-info"
        )}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-semibold leading-snug text-navy-900">{item.title}</p>
        {item.description && (
          <p className="mt-0.5 text-[12.5px] leading-snug text-navy-500">{item.description}</p>
        )}
      </div>
      {item.action && (
        <button
          type="button"
          onClick={() => {
            item.action?.onClick();
            dismissToast(item.id);
          }}
          className="shrink-0 cursor-pointer rounded-md px-2 py-1 text-[12.5px] font-semibold text-navy-700 transition-colors hover:bg-navy-900/6 hover:text-navy-900"
        >
          {item.action.label}
        </button>
      )}
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => dismissToast(item.id)}
        className="-mr-1 shrink-0 cursor-pointer rounded-md p-1 text-navy-300 transition-colors hover:bg-navy-900/6 hover:text-navy-700"
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M4 4l8 8M12 4l-8 8" />
        </svg>
      </button>
    </div>
  );
}
