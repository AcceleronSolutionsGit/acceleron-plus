import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Priority, Impact, TicketStatus, ProjectStatus, MilestoneStatus, RiskStatus, TicketType } from "./types";

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
    case "new": return "bg-sky-50 text-sky-700 border border-sky-200/90";
    case "open": return "bg-blue-50 text-blue-700 border border-blue-200/90";
    case "pending": return "bg-amber-50 text-amber-800 border border-amber-200/90";
    case "on_hold": return "bg-purple-50 text-purple-700 border border-purple-200/90";
    case "resolved": return "bg-emerald-50 text-emerald-700 border border-emerald-200/90";
    case "closed": return "bg-slate-100 text-slate-700 border border-slate-300";
    case "cancelled": return "bg-rose-50 text-rose-700 border border-rose-200/90";
    default: return "bg-neutral-100 text-neutral-600 border border-neutral-200";
  }
}

/** Map ticket status to a colored indicator dot class */
export function ticketStatusDotColor(status: TicketStatus): string {
  switch (status) {
    case "new": return "bg-sky-500";
    case "open": return "bg-blue-500";
    case "pending": return "bg-amber-500";
    case "on_hold": return "bg-purple-500";
    case "resolved": return "bg-emerald-500";
    case "closed": return "bg-slate-500";
    case "cancelled": return "bg-rose-500";
    default: return "bg-neutral-400";
  }
}

/** Map ticket status to a solid color badge/button class */
export function ticketStatusSolidColor(status: TicketStatus): string {
  switch (status) {
    case "new": return "bg-sky-600 text-white";
    case "open": return "bg-blue-600 text-white";
    case "pending": return "bg-amber-600 text-white";
    case "on_hold": return "bg-purple-600 text-white";
    case "resolved": return "bg-emerald-600 text-white";
    case "closed": return "bg-slate-700 text-white";
    case "cancelled": return "bg-rose-600 text-white";
    default: return "bg-neutral-700 text-white";
  }
}

/** Map ticket/request type to badge color classes */
export function ticketTypeColor(type: TicketType | string | undefined | null): string {
  switch (type) {
    case "incident":
      return "bg-rose-50 text-rose-700 border border-rose-200/90";
    case "service_request":
      return "bg-purple-50 text-purple-700 border border-purple-200/90";
    case "problem":
      return "bg-amber-50 text-amber-800 border border-amber-200/90";
    case "query":
      return "bg-sky-50 text-sky-700 border border-sky-200/90";
    case "change_request":
      return "bg-teal-50 text-teal-700 border border-teal-200/90";
    default:
      return "bg-neutral-100 text-neutral-700 border border-neutral-200";
  }
}

/** Map ticket/request type to indicator dot color class */
export function ticketTypeDotColor(type: TicketType | string | undefined | null): string {
  switch (type) {
    case "incident":
      return "bg-rose-500";
    case "service_request":
      return "bg-purple-500";
    case "problem":
      return "bg-amber-500";
    case "query":
      return "bg-sky-500";
    case "change_request":
      return "bg-teal-500";
    default:
      return "bg-neutral-400";
  }
}

/** Map ticket/request type to a solid badge class */
export function ticketTypeSolidColor(type: TicketType | string | undefined | null): string {
  switch (type) {
    case "incident":
      return "bg-rose-600 text-white";
    case "service_request":
      return "bg-purple-600 text-white";
    case "problem":
      return "bg-amber-600 text-white";
    case "query":
      return "bg-sky-600 text-white";
    case "change_request":
      return "bg-teal-600 text-white";
    default:
      return "bg-neutral-700 text-white";
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
