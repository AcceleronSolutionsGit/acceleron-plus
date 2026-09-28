import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Priority, Impact, TicketStatus, ProjectStatus, MilestoneStatus, RiskStatus } from "./types";

/** Merge Tailwind classes with conflict resolution */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a date string to locale display */
export function formatDate(dateStr: string | undefined | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Format currency */
export function formatCurrency(amount: number | string | undefined | null): string {
  if (amount === undefined || amount === null) return "—";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(num);
}

/** Format a date with time */
export function formatDateTime(dateStr: string | undefined | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Relative time display (e.g., "2 hours ago") */
export function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(dateStr);
}

/** Calculate time remaining until SLA deadline */
export function slaTimeRemaining(deadline: string): {
  text: string;
  isBreached: boolean;
  isNearBreach: boolean;
  totalMinutes: number;
} {
  const now = Date.now();
  const target = new Date(deadline).getTime();
  const diffMs = target - now;
  const totalMinutes = Math.floor(diffMs / 60000);

  if (diffMs <= 0) {
    const overMs = Math.abs(diffMs);
    const overHours = Math.floor(overMs / 3600000);
    const overMins = Math.floor((overMs % 3600000) / 60000);
    return {
      text: `Breached by ${overHours}h ${overMins}m`,
      isBreached: true,
      isNearBreach: false,
      totalMinutes,
    };
  }

  const hours = Math.floor(diffMs / 3600000);
  const mins = Math.floor((diffMs % 3600000) / 60000);

  return {
    text: `${hours}h ${mins}m remaining`,
    isBreached: false,
    isNearBreach: hours < 1,
    totalMinutes,
  };
}

/** Map priority to badge variant color classes */
export function priorityColor(priority: Priority | undefined): string {
  switch (priority) {
    case "urgent": return "bg-red-800 text-white";
    case "high": return "bg-red-600 text-white";
    case "medium": return "bg-warning text-white";
    case "low": return "bg-navy-500 text-white";
    default: return "bg-neutral-50 text-navy-900";
  }
}

// ─── Status colours ────────────────────────────────────────────────
//
// Every one of these returns a *tinted* pair — a pale background with
// the colour carried by the text — rather than a saturated fill.
//
// A project list shows a status on every row. Filled chips down a whole
// column make each row shout, and once every row shouts, the one that
// actually needs attention is invisible. Tints keep the colour legible
// while letting the row read as a row. `danger` stays strong, because
// that one is meant to stop you.

const TINT = {
  info: "bg-info-bg text-info",
  navy: "bg-navy-900/7 text-navy-600",
  success: "bg-success-bg text-success",
  warning: "bg-warning-bg text-warning",
  danger: "bg-danger-bg text-danger",
  muted: "bg-surface-3 text-navy-400",
} as const;

/** Map impact/urgency to badge color classes */
export function impactColor(impact: Impact | undefined): string {
  switch (impact) {
    case "high": return TINT.danger;
    case "medium": return TINT.warning;
    case "low": return TINT.navy;
    default: return TINT.muted;
  }
}

/** Map ticket status to badge color classes */
export function ticketStatusColor(status: TicketStatus): string {
  switch (status) {
    case "new": return TINT.info;
    case "open": return "bg-navy-900/10 text-navy-800";
    case "pending": return TINT.warning;
    case "on_hold": return TINT.navy;
    case "resolved": return TINT.success;
    case "closed": return TINT.muted;
    case "cancelled": return TINT.muted;
    default: return TINT.muted;
  }
}

/** Map project status to badge color classes */
export function projectStatusColor(status: ProjectStatus): string {
  switch (status) {
    case "initiated": return TINT.info;
    case "planning": return TINT.navy;
    case "active": return TINT.success;
    case "on_hold": return TINT.warning;
    case "closed": return TINT.muted;
    case "cancelled": return TINT.danger;
    default: return TINT.muted;
  }
}

/** Map milestone status to badge color classes */
export function milestoneStatusColor(status: MilestoneStatus): string {
  switch (status) {
    case "pending": return TINT.navy;
    case "at_risk": return TINT.warning;
    case "completed": return TINT.success;
    case "missed": return TINT.danger;
    default: return TINT.muted;
  }
}

/** Map risk status to badge color classes */
export function riskStatusColor(status: RiskStatus): string {
  switch (status) {
    case "open": return TINT.danger;
    case "mitigating": return TINT.warning;
    case "closed": return TINT.success;
    case "accepted": return TINT.navy;
    default: return TINT.muted;
  }
}

/** Format a status string for display (replace underscores, title case) */
export function formatStatus(status: string): string {
  return status
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Get initials from a full name */
export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

import type { WBSItem } from "./types";

export function buildWBSTree(items: WBSItem[]): WBSItem[] {
  const map = new Map<string, WBSItem>();
  const roots: WBSItem[] = [];

  items.forEach((item) => {
    map.set(item.id, { ...item, children: [], level: 0 });
  });

  map.forEach((item) => {
    if (item.parentWbsId && map.has(item.parentWbsId)) {
      const parent = map.get(item.parentWbsId)!;
      parent.children = parent.children || [];
      parent.children.push({ ...item, level: (parent.level || 0) + 1 });
    } else {
      roots.push(item);
    }
  });

  return roots.sort((a, b) => a.sequence - b.sequence);
}
