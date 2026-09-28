"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DropdownPanel } from "@/components/ui/DropdownPanel";

interface NotificationItem {
  id: string;
  title: string;
  message?: string;
  severity?: "info" | "warning" | "critical";
  eventType: string;
  projectCode?: string;
  actionUrl?: string;
  isRead: boolean;
  createdAt: string;
}

const POLL_INTERVAL_MS = 60_000;

const severityDot: Record<string, string> = {
  info: "bg-navy-500",
  warning: "bg-amber-500",
  critical: "bg-red-600",
};

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?limit=15", { cache: "no-store" });
      if (!res.ok) {
        // A 401 here just means the session lapsed; the next navigation redirects.
        if (mounted.current) setFailed(res.status !== 401);
        return;
      }
      const data = await res.json();
      if (!mounted.current) return;
      setItems(data.notifications ?? []);
      setUnread(data.unreadCount ?? 0);
      setFailed(false);
    } catch {
      if (mounted.current) setFailed(true);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    load();
    const timer = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      mounted.current = false;
      clearInterval(timer);
    };
  }, [load]);

  const markAllRead = async () => {
    setLoading(true);
    // Optimistic — the panel feels instant; a failure re-syncs on the next poll.
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnread(0);
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
    } finally {
      setLoading(false);
      load();
    }
  };

  const openItem = async (item: NotificationItem) => {
    setOpen(false);
    if (!item.isRead) {
      setUnread((n) => Math.max(0, n - 1));
      setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n)));
      void fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [item.id] }),
      });
    }
    if (item.actionUrl) router.push(item.actionUrl);
  };

  const bellRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="relative">
      <button
        ref={bellRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        className="relative flex items-center justify-center w-9 h-9 rounded-lg hover:bg-neutral-50 transition-colors cursor-pointer"
      >
        <svg className="w-5 h-5 text-navy-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-red-600 text-white text-[10px] font-semibold tabular-nums">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      <DropdownPanel
        anchorRef={bellRef}
        open={open}
        onClose={() => setOpen(false)}
        width={360}
        label="Notifications"
        role="dialog"
      >
        <div>
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-50">
              <p className="text-sm font-semibold text-navy-900">
                Notifications{unread > 0 && <span className="text-navy-500 font-normal"> · {unread} new</span>}
              </p>
              {unread > 0 && (
                <button
                  onClick={markAllRead}
                  disabled={loading}
                  className="text-xs text-navy-700 hover:underline cursor-pointer disabled:opacity-50"
                >
                  Mark all read
                </button>
              )}
            </div>

            <div className="max-h-[420px] overflow-y-auto">
              {failed && (
                <p className="px-4 py-6 text-sm text-navy-500 text-center">
                  Could not load notifications.
                </p>
              )}

              {!failed && items.length === 0 && (
                <div className="px-4 py-10 text-center">
                  <p className="text-sm text-navy-900 font-medium">You&apos;re all caught up</p>
                  <p className="text-xs text-navy-500 mt-1">
                    Phase changes, milestones and linked tickets appear here.
                  </p>
                </div>
              )}

              {items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => openItem(item)}
                  className={`w-full text-left px-4 py-3 border-b border-neutral-50 last:border-0 hover:bg-neutral-50 transition-colors cursor-pointer ${
                    item.isRead ? "" : "bg-navy-900/[0.02]"
                  }`}
                >
                  <div className="flex gap-2.5">
                    <span
                      className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        item.isRead ? "bg-transparent" : severityDot[item.severity ?? "info"]
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm leading-snug ${item.isRead ? "text-navy-500" : "text-navy-900 font-medium"}`}>
                        {item.title}
                      </p>
                      {item.message && (
                        <p className="text-xs text-navy-500 mt-0.5 line-clamp-2">{item.message}</p>
                      )}
                      <p className="text-[11px] text-navy-500/70 mt-1">
                        {item.projectCode ? `${item.projectCode} · ` : ""}
                        {relativeTime(item.createdAt)}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <div className="px-4 py-2.5 border-t border-neutral-50 bg-neutral-50/50">
              <Link
                href="/pmt/dashboard"
                onClick={() => setOpen(false)}
                className="text-xs text-navy-700 hover:underline"
              >
                Go to dashboard
              </Link>
            </div>
        </div>
      </DropdownPanel>
    </div>
  );
}
