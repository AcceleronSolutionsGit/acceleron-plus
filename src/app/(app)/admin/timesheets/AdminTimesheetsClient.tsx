"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

// ═══════════════════════════════════════════════════════════════
// Timesheet Approvals — One-Liner per Individual + Expand to
// Project Hours Breakdown + Missing Timesheets Tracker for PMs.
//
// Rules enforced by backend & reflected here:
//  • Self-approval is disabled for everyone (including PMs).
//  • A PM's timesheet on their own project is routed to their RM.
//  • PMs can see who in their projects has NOT filled timesheets
//    for any week and send one-click reminders.
// ═══════════════════════════════════════════════════════════════

const STATUS_STYLES: Record<string, string> = {
  draft:     "bg-neutral-100 text-navy-500 border border-neutral-200",
  submitted: "bg-blue-50 text-blue-700 border border-blue-200",
  pending:   "bg-blue-50 text-blue-700 border border-blue-200",
  approved:  "bg-emerald-50 text-emerald-700 border border-emerald-200",
  rejected:  "bg-red-50 text-red-700 border border-red-200",
};

interface EntryItem {
  id: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  userId: string;
  userName: string;
  employeeId: string | null;
  logDate: string;
  hours: number;
  activityType: string;
  wbsName: string | null;
  notes: string | null;
  status: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  isPmOnProject: boolean;
  approvalVia: "rm" | "pm" | "admin";
}

interface ProjectGroup {
  projectId: string;
  projectCode: string;
  projectName: string;
  totalHours: number;
  pendingHours: number;
  approvedHours: number;
  rejectedHours: number;
  pendingEntryIds: string[];
  isPmOnProject: boolean;
  entries: EntryItem[];
}

interface IndividualGroup {
  userId: string;
  userName: string;
  employeeId: string | null;
  email: string | null;
  designation: string | null;
  isDirectReport: boolean;
  hasPmRoutedEntries: boolean;
  totalHours: number;
  pendingHours: number;
  approvedHours: number;
  rejectedHours: number;
  pendingEntryIds: string[];
  totalEntries: number;
  dateRange: { min: string; max: string };
  projectCount: number;
  projects: ProjectGroup[];
}

interface ApprovalSummary {
  totalPeople: number;
  pendingPeople: number;
  pendingHours: number;
  approvedHours: number;
  rejectedEntries: number;
  totalHours: number;
}

interface MissingProjectItem {
  projectId: string;
  projectCode: string;
  projectName: string;
  roleInProject: string | null;
  allocationPercent: number;
  draftHours: number;
  rejectedHours: number;
  status: "not_logged" | "draft_only" | "rejected_only";
}

interface MissingIndividual {
  userId: string;
  canRemind: boolean;
  userName: string;
  employeeId: string | null;
  email: string | null;
  designation: string | null;
  isDirectReport: boolean;
  status: "not_logged" | "draft_only" | "rejected_only";
  totalDraftHours: number;
  totalRejectedHours: number;
  lastLoggedDate: string | null;
  missingProjectCount: number;
  missingProjects: MissingProjectItem[];
}

interface MissingSummary {
  totalAllocated: number;
  missingCount: number;
  notLoggedCount: number;
  draftOnlyCount: number;
  compliantCount: number;
}

interface ProjectOption {
  id: string;
  code: string;
  name: string;
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function shiftDays(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

function getMondayOf(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay();
  dt.setUTCDate(dt.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  return dt.toISOString().slice(0, 10);
}

function fmtShortDate(iso: string | null): string {
  if (!iso) return "—";
  const parts = iso.slice(0, 10).split("-").map(Number);
  if (parts.length === 3 && !parts.some(Number.isNaN)) {
    const dt = new Date(parts[0], parts[1] - 1, parts[2]);
    return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
  }
  return iso;
}

function fmtDayDate(iso: string | null): string {
  if (!iso) return "—";
  const parts = iso.slice(0, 10).split("-").map(Number);
  if (parts.length === 3 && !parts.some(Number.isNaN)) {
    const dt = new Date(parts[0], parts[1] - 1, parts[2]);
    return dt.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short" });
  }
  return iso;
}

function fmtFullDate(iso: string | null): string {
  if (!iso) return "—";
  const parts = iso.slice(0, 10).split("-").map(Number);
  if (parts.length === 3 && !parts.some(Number.isNaN)) {
    const dt = new Date(parts[0], parts[1] - 1, parts[2]);
    return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  }
  return iso;
}

function fmtHours(h: number): string {
  const rounded = Math.round((h + Number.EPSILON) * 100) / 100;
  return Number.isInteger(rounded) ? `${rounded}h` : `${rounded.toFixed(1)}h`;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function AdminTimesheetsClient() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") === "missing" ? "missing" : "approvals";
  const initialProject = searchParams.get("project") || "";

  const [activeTab, setActiveTab] = useState<"approvals" | "missing">(initialTab);

  // Approvals state
  const [individuals, setIndividuals] = useState<IndividualGroup[]>([]);
  const [summary, setSummary] = useState<ApprovalSummary>({
    totalPeople: 0,
    pendingPeople: 0,
    pendingHours: 0,
    approvedHours: 0,
    rejectedEntries: 0,
    totalHours: 0,
  });
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Missing timesheets state
  const [missingWeekAnchor, setMissingWeekAnchor] = useState<string>(() => getMondayOf(todayISO()));
  const [missingWeekRange, setMissingWeekRange] = useState<{ start: string; end: string }>({
    start: getMondayOf(todayISO()),
    end: shiftDays(getMondayOf(todayISO()), 6),
  });
  const [missingIndividuals, setMissingIndividuals] = useState<MissingIndividual[]>([]);
  const [missingSummary, setMissingSummary] = useState<MissingSummary>({
    totalAllocated: 0,
    missingCount: 0,
    notLoggedCount: 0,
    draftOnlyCount: 0,
    compliantCount: 0,
  });
  const [missingProjects, setMissingProjects] = useState<ProjectOption[]>([]);
  const [missingLoading, setMissingLoading] = useState(true);
  const [missingStatusFilter, setMissingStatusFilter] = useState<"all" | "not_logged" | "draft_only">("all");
  const [remindingId, setRemindingId] = useState<string | null>(null);
  const [remindedUsers, setRemindedUsers] = useState<Set<string>>(new Set());

  // Filters
  const [statusFilter, setStatusFilter] = useState<"submitted" | "approved" | "rejected" | "all">("submitted");
  const [projectFilter, setProjectFilter] = useState(initialProject);
  const [weekFilter, setWeekFilter] = useState("");
  const [searchText, setSearchText] = useState("");

  // Accordion expansion (individuals & optional project daily rows)
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [expandedMissingUsers, setExpandedMissingUsers] = useState<Set<string>>(new Set());

  // Selection (entry IDs)
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Action & Feedback state
  const [actionBusy, setActionBusy] = useState(false);
  const [error, setError] = useState("");
  const [hint, setHint] = useState("");
  const [exporting, setExporting] = useState(false);

  // Rejection modal
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectTargetIds, setRejectTargetIds] = useState<string[]>([]);
  const [rejectContextLabel, setRejectContextLabel] = useState("");

  // Export modal
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState<"xlsx" | "csv">("xlsx");
  const [exportRange, setExportRange] = useState<"current" | "month" | "last_month" | "all" | "custom">("current");
  const [exportCustomFrom, setExportCustomFrom] = useState("");
  const [exportCustomTo, setExportCustomTo] = useState("");

  // ── Load Approvals ─────────────────────────────────────────────
  const loadApprovals = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status: statusFilter });
      if (projectFilter) params.set("project", projectFilter);
      if (weekFilter) params.set("week", weekFilter);

      const res = await fetch(`/api/pmt/timesheets?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not load timesheets.");
        return;
      }
      setIndividuals(data.individuals ?? []);
      setSummary(
        data.summary ?? {
          totalPeople: 0,
          pendingPeople: 0,
          pendingHours: 0,
          approvedHours: 0,
          rejectedEntries: 0,
          totalHours: 0,
        }
      );
      setProjects(data.projects ?? []);
      setSelected(new Set());
      setError("");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, projectFilter, weekFilter]);

  // ── Load Missing Timesheets ────────────────────────────────────
  const loadMissing = useCallback(async () => {
    setMissingLoading(true);
    try {
      const params = new URLSearchParams({ week: missingWeekAnchor });
      if (projectFilter) params.set("project", projectFilter);

      const res = await fetch(`/api/pmt/timesheets/missing?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;
      setMissingIndividuals(data.individuals ?? []);
      setMissingSummary(
        data.summary ?? {
          totalAllocated: 0,
          missingCount: 0,
          notLoggedCount: 0,
          draftOnlyCount: 0,
          compliantCount: 0,
        }
      );
      if (data.weekStart && data.weekEnd) {
        setMissingWeekRange({ start: data.weekStart, end: data.weekEnd });
      }
      if (Array.isArray(data.projects)) {
        setMissingProjects(data.projects);
      }
    } finally {
      setMissingLoading(false);
    }
  }, [missingWeekAnchor, projectFilter]);

  useEffect(() => {
    void loadApprovals();
  }, [loadApprovals]);

  useEffect(() => {
    void loadMissing();
  }, [loadMissing]);

  // Merge project options from both endpoints for the dropdown
  const allProjectOptions = useMemo(() => {
    const map = new Map<string, ProjectOption>();
    for (const p of projects) map.set(p.id, p);
    for (const p of missingProjects) map.set(p.id, p);
    return [...map.values()].sort((a, b) => a.code.localeCompare(b.code));
  }, [projects, missingProjects]);

  // Client-side search filtering (instant & snappy)
  const filteredIndividuals = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return individuals;
    return individuals.filter((ind) => {
      if (ind.userName.toLowerCase().includes(q)) return true;
      if (ind.employeeId && ind.employeeId.toLowerCase().includes(q)) return true;
      if (ind.email && ind.email.toLowerCase().includes(q)) return true;
      return ind.projects.some(
        (p) => p.projectCode.toLowerCase().includes(q) || p.projectName.toLowerCase().includes(q)
      );
    });
  }, [individuals, searchText]);

  const filteredMissing = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return missingIndividuals.filter((m) => {
      if (missingStatusFilter !== "all" && m.status !== missingStatusFilter) return false;
      if (!q) return true;
      if (m.userName.toLowerCase().includes(q)) return true;
      if (m.employeeId && m.employeeId.toLowerCase().includes(q)) return true;
      if (m.email && m.email.toLowerCase().includes(q)) return true;
      return m.missingProjects.some(
        (p) => p.projectCode.toLowerCase().includes(q) || p.projectName.toLowerCase().includes(q)
      );
    });
  }, [missingIndividuals, missingStatusFilter, searchText]);

  // Selection helpers
  const allPendingIds = useMemo(
    () => filteredIndividuals.flatMap((i) => i.pendingEntryIds),
    [filteredIndividuals]
  );
  const selectedList = useMemo(() => [...selected], [selected]);
  const allSelected = allPendingIds.length > 0 && allPendingIds.every((id) => selected.has(id));

  const toggleAllPending = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(allPendingIds));
    }
  };

  const toggleIds = (ids: string[]) => {
    if (ids.length === 0) return;
    setSelected((prev) => {
      const next = new Set(prev);
      const everyIn = ids.every((id) => next.has(id));
      if (everyIn) {
        ids.forEach((id) => next.delete(id));
      } else {
        ids.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const toggleUserExpand = (uid: string) => {
    setExpandedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const toggleProjectExpand = (key: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleMissingUserExpand = (uid: string) => {
    setExpandedMissingUsers((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const allExpanded =
    filteredIndividuals.length > 0 &&
    filteredIndividuals.every((i) => expandedUsers.has(i.userId));

  const toggleExpandAll = () => {
    if (allExpanded) {
      setExpandedUsers(new Set());
      setExpandedProjects(new Set());
    } else {
      setExpandedUsers(new Set(filteredIndividuals.map((i) => i.userId)));
    }
  };

  // ── Approve / Reject Action ────────────────────────────────────
  const openRejectModal = (ids: string[], contextLabel: string) => {
    setRejectTargetIds(ids);
    setRejectContextLabel(contextLabel);
    setRejectReason("");
    setShowRejectModal(true);
  };

  const bulkAction = async (action: "approve" | "reject", targetIds?: string[], reasonOverride?: string) => {
    const idsToAct = targetIds && targetIds.length > 0 ? targetIds : selectedList;
    if (idsToAct.length === 0) return;
    const finalReason = (reasonOverride ?? rejectReason).trim();

    if (action === "reject" && !finalReason) {
      openRejectModal(idsToAct, `${idsToAct.length} ${idsToAct.length === 1 ? "entry" : "entries"}`);
      return;
    }

    setActionBusy(true);
    setError("");
    try {
      const res = await fetch("/api/pmt/timesheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: idsToAct,
          action,
          rejectionReason: action === "reject" ? finalReason : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Action failed.");
        return;
      }
      const skippedNote =
        data.skipped > 0
          ? ` (${data.skipped} skipped — self-approval or already reviewed)`
          : "";
      setHint(
        `${action === "approve" ? "Approved" : "Rejected"} ${data.count} ${
          data.count === 1 ? "entry" : "entries"
        }.${skippedNote}`
      );
      setTimeout(() => setHint(""), 4500);
      setShowRejectModal(false);
      setRejectReason("");
      setRejectTargetIds([]);
      setRejectContextLabel("");
      await Promise.all([loadApprovals(), loadMissing()]);
    } finally {
      setActionBusy(false);
    }
  };

  // ── Send Missing Timesheet Reminder ────────────────────────────
  const sendReminder = async (targets: MissingIndividual[]) => {
    const recipients = targets.flatMap((t) =>
      t.canRemind
        ? t.missingProjects.map((p) => ({
            userId: t.userId,
            projectId: p.projectId,
            projectName: `${p.projectCode} ${p.projectName}`,
          }))
        : []
    );
    if (recipients.length === 0) {
      setError("No linked user accounts available to notify.");
      return;
    }

    const busyKey = targets.length === 1 ? targets[0].userId : "__all__";
    setRemindingId(busyKey);
    setError("");
    try {
      const res = await fetch("/api/pmt/timesheets/missing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipients,
          weekStart: missingWeekRange.start,
          weekEnd: missingWeekRange.end,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Failed to send reminder.");
        return;
      }
      setRemindedUsers((prev) => {
        const next = new Set(prev);
        targets.forEach((t) => next.add(t.userId));
        return next;
      });
      setHint(data.message || "Reminder sent.");
      setTimeout(() => setHint(""), 4500);
    } finally {
      setRemindingId(null);
    }
  };

  // ── Export ─────────────────────────────────────────────────────
  const triggerExport = async (fmt: "xlsx" | "csv" = exportFormat, range: string = exportRange) => {
    setExporting(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("format", fmt);
      if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);
      if (projectFilter) params.set("project", projectFilter);

      const now = new Date();
      if (range === "month") {
        params.set("from", new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10));
        params.set("to", new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10));
      } else if (range === "last_month") {
        params.set("from", new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10));
        params.set("to", new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10));
      } else if (range === "custom") {
        if (exportCustomFrom) params.set("from", exportCustomFrom);
        if (exportCustomTo) params.set("to", exportCustomTo);
      } else if (range === "current" && weekFilter) {
        const mon = getMondayOf(weekFilter);
        params.set("from", mon);
        params.set("to", shiftDays(mon, 6));
      }

      const res = await fetch(`/api/admin/timesheets?${params.toString()}`);
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        setError(errJson.error || "Export failed.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `timesheets_${new Date().toISOString().slice(0, 10)}.${fmt}`;
      a.click();
      URL.revokeObjectURL(url);
      setShowExportModal(false);
    } catch {
      setError("Failed to download timesheets export.");
    } finally {
      setExporting(false);
    }
  };

  const compliancePct =
    missingSummary.totalAllocated > 0
      ? Math.round((missingSummary.compliantCount / missingSummary.totalAllocated) * 100)
      : 100;

  return (
    <div className="space-y-5">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-navy-900 font-[family-name:var(--font-league-spartan)]">
            Timesheet Approvals
          </h1>
          <p className="text-sm text-navy-500 mt-0.5">
            Click any individual to inspect project-wise hours and approve or reject. Self-approvals are disabled — PM timesheets route to their Reporting Manager.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => triggerExport("xlsx", "current")}
            loading={exporting}
            id="export-timesheets-btn"
          >
            <svg className="w-4 h-4 mr-1.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3.5 13.5v2A1.5 1.5 0 0 0 5 17h10a1.5 1.5 0 0 0 1.5-1.5v-2M10 3.5v9M7 9.5l3 3.5 3-3.5" />
            </svg>
            Export Excel
          </Button>
          <Button
            variant="secondary"
            onClick={() => setShowExportModal(true)}
            id="advanced-export-btn"
            title="Advanced Export options (CSV, date ranges)"
          >
            <svg className="w-4 h-4 mr-1" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="M4 6h12M6 10h8M8 14h4" strokeLinecap="round" />
            </svg>
            Export Options
          </Button>
        </div>
      </div>

      {/* ── Summary KPI Strip ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={() => {
            setActiveTab("approvals");
            setStatusFilter("submitted");
          }}
          className={cn(
            "text-left rounded-xl border px-4 py-3.5 bg-white shadow-xs transition-all cursor-pointer",
            activeTab === "approvals" && statusFilter === "submitted"
              ? "border-blue-400 ring-1 ring-blue-300"
              : "border-navy-900/10 hover:border-navy-900/25"
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-navy-500">
              Pending Approval
            </span>
            <span className="h-2 w-2 rounded-full bg-blue-500" />
          </div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-navy-900">{summary.pendingPeople}</span>
            <span className="text-xs text-navy-500">
              {summary.pendingPeople === 1 ? "person" : "people"} · {fmtHours(summary.pendingHours)}
            </span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab("approvals");
            setStatusFilter("approved");
          }}
          className={cn(
            "text-left rounded-xl border px-4 py-3.5 bg-white shadow-xs transition-all cursor-pointer",
            activeTab === "approvals" && statusFilter === "approved"
              ? "border-emerald-400 ring-1 ring-emerald-300"
              : "border-navy-900/10 hover:border-navy-900/25"
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-navy-500">
              Approved (In View)
            </span>
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
          </div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-700">{fmtHours(summary.approvedHours)}</span>
            <span className="text-xs text-navy-500">total verified</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab("approvals");
            setStatusFilter("rejected");
          }}
          className={cn(
            "text-left rounded-xl border px-4 py-3.5 bg-white shadow-xs transition-all cursor-pointer",
            activeTab === "approvals" && statusFilter === "rejected"
              ? "border-red-400 ring-1 ring-red-300"
              : "border-navy-900/10 hover:border-navy-900/25"
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-navy-500">
              Rejected
            </span>
            <span className="h-2 w-2 rounded-full bg-red-500" />
          </div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-navy-900">{summary.rejectedEntries}</span>
            <span className="text-xs text-navy-500">
              {summary.rejectedEntries === 1 ? "entry" : "entries"} returned
            </span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("missing")}
          className={cn(
            "text-left rounded-xl border px-4 py-3.5 transition-all cursor-pointer shadow-xs",
            activeTab === "missing"
              ? "bg-amber-50/70 border-amber-400 ring-1 ring-amber-300"
              : missingSummary.missingCount > 0
              ? "bg-amber-50/30 border-amber-200 hover:border-amber-400"
              : "bg-white border-navy-900/10 hover:border-navy-900/25"
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-800">
              Not Filled This Week
            </span>
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                missingSummary.missingCount > 0 ? "bg-amber-500 animate-pulse" : "bg-emerald-500"
              )}
            />
          </div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-amber-900">{missingSummary.missingCount}</span>
            <span className="text-xs text-amber-800/80">
              of {missingSummary.totalAllocated} allocated ({compliancePct}% filled)
            </span>
          </div>
        </button>
      </div>

      {/* ── Main View Tabs ────────────────────────────────────────── */}
      <div className="flex items-center gap-1 border-b border-navy-900/10">
        <button
          type="button"
          onClick={() => setActiveTab("approvals")}
          className={cn(
            "px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-2 -mb-px",
            activeTab === "approvals"
              ? "border-navy-900 text-navy-900"
              : "border-transparent text-navy-500 hover:text-navy-800"
          )}
        >
          Timesheet Approvals
          {summary.pendingPeople > 0 && (
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
              {summary.pendingPeople}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("missing")}
          className={cn(
            "px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-2 -mb-px",
            activeTab === "missing"
              ? "border-amber-600 text-amber-900"
              : "border-transparent text-navy-500 hover:text-navy-800"
          )}
        >
          Not Filling Timesheets
          {missingSummary.missingCount > 0 && (
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
              {missingSummary.missingCount}
            </span>
          )}
        </button>
      </div>

      {/* ── Feedback banners ──────────────────────────────────────── */}
      {error && (
        <div role="alert" className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError("")} className="text-xs font-semibold hover:underline cursor-pointer">
            Dismiss
          </button>
        </div>
      )}
      {hint && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-xl px-4 py-3">
          {hint}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* TAB 1: APPROVALS (ONE-LINER PER INDIVIDUAL -> PROJECTS)     */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {activeTab === "approvals" && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <Card>
            <div className="px-4 py-3 flex flex-wrap items-center gap-2.5">
              {/* Status pills */}
              <div className="flex rounded-lg border border-navy-900/12 bg-surface shadow-xs overflow-hidden">
                {(
                  [
                    { key: "submitted", label: "Pending" },
                    { key: "approved", label: "Approved" },
                    { key: "rejected", label: "Rejected" },
                    { key: "all", label: "All" },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setStatusFilter(item.key)}
                    className={cn(
                      "px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer",
                      statusFilter === item.key
                        ? "bg-navy-900 text-white"
                        : "text-navy-600 hover:bg-navy-900/5"
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {/* Project filter */}
              <select
                value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}
                className="h-9 rounded-lg border border-navy-900/14 bg-surface px-2.5 text-xs text-navy-700 shadow-xs focus:border-navy-700 focus:outline-none max-w-[240px]"
              >
                <option value="">All projects</option>
                {allProjectOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} — {p.name}
                  </option>
                ))}
              </select>

              {/* Week filter */}
              <div className="flex items-center gap-1">
                <input
                  type="date"
                  value={weekFilter}
                  onChange={(e) => setWeekFilter(e.target.value)}
                  title="Filter to week containing this date (leave empty for all weeks)"
                  className="h-9 rounded-lg border border-navy-900/14 bg-surface px-2.5 text-xs text-navy-700 shadow-xs focus:border-navy-700 focus:outline-none"
                />
                {weekFilter && (
                  <button
                    type="button"
                    onClick={() => setWeekFilter("")}
                    className="h-9 px-2 text-xs text-navy-500 hover:text-navy-900 cursor-pointer"
                    title="Clear week filter"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Search */}
              <div className="relative flex-1 min-w-[180px] max-w-[280px]">
                <input
                  type="text"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="Search person, ID, or project…"
                  className="w-full h-9 rounded-lg border border-navy-900/14 bg-surface pl-8 pr-3 text-xs text-navy-800 placeholder:text-navy-400 focus:border-navy-700 focus:outline-none"
                />
                <svg
                  className="w-3.5 h-3.5 text-navy-400 absolute left-2.5 top-1/2 -translate-y-1/2"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="9" cy="9" r="6" />
                  <path d="M14 14l4 4" strokeLinecap="round" />
                </svg>
              </div>

              <div className="flex items-center gap-2 ml-auto">
                {filteredIndividuals.length > 0 && (
                  <button
                    type="button"
                    onClick={toggleExpandAll}
                    className="text-xs font-medium text-navy-600 hover:text-navy-900 px-2.5 py-1.5 rounded-lg hover:bg-navy-50 transition-colors cursor-pointer"
                  >
                    {allExpanded ? "Collapse all" : "Expand all"}
                  </button>
                )}
                <span className="text-xs text-navy-500 font-medium">
                  {filteredIndividuals.length}{" "}
                  {filteredIndividuals.length === 1 ? "individual" : "individuals"}
                </span>
              </div>
            </div>
          </Card>

          {/* Bulk Action Bar */}
          {selectedList.length > 0 && (
            <div className="flex items-center gap-3 px-4 py-2.5 bg-navy-900 rounded-xl text-white text-sm shadow-md">
              <span className="font-semibold">
                {selectedList.length} {selectedList.length === 1 ? "entry" : "entries"} selected
              </span>
              <div className="flex gap-2 ml-auto">
                <button
                  type="button"
                  onClick={() => void bulkAction("approve")}
                  disabled={actionBusy}
                  className="px-3.5 py-1.5 text-xs font-semibold bg-emerald-500 hover:bg-emerald-600 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
                >
                  Approve selected
                </button>
                <button
                  type="button"
                  onClick={() =>
                    openRejectModal(
                      selectedList,
                      `${selectedList.length} selected ${selectedList.length === 1 ? "entry" : "entries"}`
                    )
                  }
                  disabled={actionBusy}
                  className="px-3.5 py-1.5 text-xs font-semibold bg-red-500 hover:bg-red-600 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
                >
                  Reject selected
                </button>
                <button
                  type="button"
                  onClick={() => setSelected(new Set())}
                  className="px-3 py-1.5 text-xs font-semibold bg-white/10 hover:bg-white/20 rounded-lg transition-colors cursor-pointer"
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          {/* One-Liner Individual Accordion Card */}
          <Card>
            {loading ? (
              <div className="p-12 text-center text-sm text-navy-500">Loading timesheets…</div>
            ) : filteredIndividuals.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-sm font-semibold text-navy-800">No timesheets to display.</p>
                <p className="text-xs text-navy-500 mt-1">
                  {statusFilter === "submitted"
                    ? "All caught up! Try switching to Approved, Rejected, or check the Not Filling Timesheets tab."
                    : "Try adjusting your status, project, or week filter."}
                </p>
              </div>
            ) : (
              <div>
                {/* Table Header Strip */}
                <div className="hidden md:grid md:grid-cols-[36px_32px_minmax(200px,1.5fr)_minmax(160px,1.2fr)_110px_110px_170px] items-center gap-3 px-4 py-2.5 bg-neutral-50 border-b border-neutral-100 text-[10px] font-semibold uppercase tracking-wider text-navy-500">
                  <div className="flex justify-center">
                    {allPendingIds.length > 0 && (
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAllPending}
                        className="rounded cursor-pointer"
                        title="Select all pending entries"
                      />
                    )}
                  </div>
                  <div />
                  <div>Individual</div>
                  <div>Projects &amp; Period</div>
                  <div className="text-right">Total Hours</div>
                  <div className="text-center">Status</div>
                  <div className="text-right">Quick Action</div>
                </div>

                {/* Individual One-Liner Rows */}
                <div className="divide-y divide-neutral-100">
                  {filteredIndividuals.map((ind) => {
                    const isExpanded = expandedUsers.has(ind.userId);
                    const hasPending = ind.pendingEntryIds.length > 0;
                    const indAllSelected =
                      hasPending && ind.pendingEntryIds.every((id) => selected.has(id));
                    const indSomeSelected =
                      hasPending &&
                      !indAllSelected &&
                      ind.pendingEntryIds.some((id) => selected.has(id));

                    const overallStatus =
                      ind.pendingHours > 0 && ind.approvedHours === 0 && ind.rejectedHours === 0
                        ? "pending"
                        : ind.approvedHours > 0 && ind.pendingHours === 0 && ind.rejectedHours === 0
                        ? "approved"
                        : ind.rejectedHours > 0 && ind.pendingHours === 0 && ind.approvedHours === 0
                        ? "rejected"
                        : "mixed";

                    return (
                      <div key={ind.userId} className="transition-colors">
                        {/* ── ONE-LINER SUMMARY ROW ───────────────────── */}
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => toggleUserExpand(ind.userId)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              toggleUserExpand(ind.userId);
                            }
                          }}
                          className={cn(
                            "grid grid-cols-1 md:grid-cols-[36px_32px_minmax(200px,1.5fr)_minmax(160px,1.2fr)_110px_110px_170px] items-center gap-3 px-4 py-3 cursor-pointer select-none transition-colors",
                            isExpanded
                              ? "bg-navy-50/70"
                              : indAllSelected
                              ? "bg-blue-50/40"
                              : "hover:bg-neutral-50/80"
                          )}
                        >
                          {/* Checkbox */}
                          <div
                            className="hidden md:flex justify-center"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {hasPending && (
                              <input
                                type="checkbox"
                                checked={indAllSelected}
                                ref={(el) => {
                                  if (el) el.indeterminate = indSomeSelected;
                                }}
                                onChange={() => toggleIds(ind.pendingEntryIds)}
                                className="rounded cursor-pointer"
                              />
                            )}
                          </div>

                          {/* Expand Chevron */}
                          <div className="hidden md:flex justify-center text-navy-400">
                            <svg
                              className={cn(
                                "w-4 h-4 transition-transform duration-150",
                                isExpanded && "rotate-90 text-navy-900"
                              )}
                              viewBox="0 0 20 20"
                              fill="currentColor"
                            >
                              <path
                                fillRule="evenodd"
                                d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </div>

                          {/* Individual Name + Avatar + Badges */}
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="h-8 w-8 rounded-full bg-navy-900/8 text-navy-800 text-xs font-bold flex items-center justify-center shrink-0">
                              {initials(ind.userName)}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-semibold text-sm text-navy-900 truncate">
                                  {ind.userName}
                                </span>
                                {ind.employeeId && (
                                  <span className="font-mono text-[10px] text-navy-400 bg-neutral-100 px-1.5 py-0.5 rounded">
                                    {ind.employeeId}
                                  </span>
                                )}
                                {ind.hasPmRoutedEntries && (
                                  <span
                                    title="Submitted by a Project Manager — self-approval disabled, routed to Reporting Manager"
                                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 whitespace-nowrap"
                                  >
                                    PM → RM
                                  </span>
                                )}
                              </div>
                              {ind.designation && (
                                <p className="text-[11px] text-navy-400 truncate">{ind.designation}</p>
                              )}
                            </div>
                          </div>

                          {/* Projects Summary & Date Range */}
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-medium text-navy-700">
                                {ind.projectCount} {ind.projectCount === 1 ? "project" : "projects"}
                              </span>
                              <span className="text-navy-300">·</span>
                              <span className="text-[11px] text-navy-500 truncate">
                                {ind.projects
                                  .slice(0, 2)
                                  .map((p) => p.projectCode)
                                  .join(", ")}
                                {ind.projects.length > 2 ? ` +${ind.projects.length - 2}` : ""}
                              </span>
                            </div>
                            <p className="text-[11px] text-navy-400">
                              {ind.dateRange.min === ind.dateRange.max
                                ? fmtShortDate(ind.dateRange.min)
                                : `${fmtShortDate(ind.dateRange.min)} – ${fmtShortDate(ind.dateRange.max)}`}
                              {" · "}
                              {ind.totalEntries} {ind.totalEntries === 1 ? "entry" : "entries"}
                            </p>
                          </div>

                          {/* Total Hours */}
                          <div className="md:text-right">
                            <div className="text-sm font-bold text-navy-900">
                              {fmtHours(ind.totalHours)}
                            </div>
                            {ind.pendingHours > 0 && ind.pendingHours !== ind.totalHours && (
                              <div className="text-[10px] text-blue-600 font-medium">
                                {fmtHours(ind.pendingHours)} pending
                              </div>
                            )}
                          </div>

                          {/* Status Badge */}
                          <div className="md:text-center">
                            {overallStatus === "mixed" ? (
                              <span className="inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                                Mixed
                              </span>
                            ) : (
                              <span
                                className={cn(
                                  "inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize",
                                  STATUS_STYLES[overallStatus] ?? "bg-neutral-100 text-navy-600"
                                )}
                              >
                                {overallStatus}
                              </span>
                            )}
                          </div>

                          {/* Quick Approve / Reject All for this Individual */}
                          <div
                            className="flex items-center md:justify-end gap-1.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {hasPending ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => void bulkAction("approve", ind.pendingEntryIds)}
                                  disabled={actionBusy}
                                  className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-40 cursor-pointer"
                                  title={`Approve all ${fmtHours(ind.pendingHours)} pending for ${ind.userName}`}
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    openRejectModal(
                                      ind.pendingEntryIds,
                                      `${ind.userName} (${fmtHours(ind.pendingHours)})`
                                    )
                                  }
                                  disabled={actionBusy}
                                  className="px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-red-200 text-red-600 bg-white hover:bg-red-50 transition-colors disabled:opacity-40 cursor-pointer"
                                  title={`Reject pending entries for ${ind.userName}`}
                                >
                                  Reject
                                </button>
                              </>
                            ) : (
                              <span className="text-[11px] text-navy-400">
                                {isExpanded ? "Hide details" : "View details"}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* ── EXPANDED PROJECT-BY-PROJECT BREAKDOWN ──── */}
                        {isExpanded && (
                          <div className="bg-neutral-50/70 border-t border-neutral-100 px-4 md:pl-16 md:pr-5 py-3.5 space-y-3">
                            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-navy-400 px-1">
                              <span>Project Breakdown ({ind.projectCount})</span>
                              <span>Click a project to inspect daily logs</span>
                            </div>

                            {ind.projects.map((proj) => {
                              const projKey = `${ind.userId}::${proj.projectId}`;
                              const isProjOpen = expandedProjects.has(projKey);
                              const projHasPending = proj.pendingEntryIds.length > 0;

                              return (
                                <div
                                  key={proj.projectId}
                                  className="rounded-xl border border-navy-900/10 bg-white overflow-hidden shadow-2xs"
                                >
                                  {/* Project Header Line */}
                                  <div
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => toggleProjectExpand(projKey)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        toggleProjectExpand(projKey);
                                      }
                                    }}
                                    className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-navy-50/40 transition-colors cursor-pointer flex-wrap"
                                  >
                                    <div className="flex items-center gap-2.5 min-w-0">
                                      <svg
                                        className={cn(
                                          "w-3.5 h-3.5 text-navy-400 transition-transform shrink-0",
                                          isProjOpen && "rotate-90 text-navy-800"
                                        )}
                                        viewBox="0 0 20 20"
                                        fill="currentColor"
                                      >
                                        <path
                                          fillRule="evenodd"
                                          d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                                          clipRule="evenodd"
                                        />
                                      </svg>
                                      <span className="font-mono text-[11px] font-semibold px-2 py-0.5 rounded bg-navy-900/6 text-navy-700 shrink-0">
                                        {proj.projectCode}
                                      </span>
                                      <Link
                                        href={`/pmt/${proj.projectId}`}
                                        onClick={(e) => e.stopPropagation()}
                                        className="text-sm font-semibold text-navy-900 hover:underline truncate"
                                      >
                                        {proj.projectName}
                                      </Link>
                                      {proj.isPmOnProject && (
                                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 whitespace-nowrap">
                                          PM on project · RM Review
                                        </span>
                                      )}
                                    </div>

                                    <div
                                      className="flex items-center gap-3 ml-auto"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <div className="text-right">
                                        <span className="text-sm font-bold text-navy-900">
                                          {fmtHours(proj.totalHours)}
                                        </span>
                                        <span className="text-[11px] text-navy-400 ml-1.5">
                                          ({proj.entries.length}{" "}
                                          {proj.entries.length === 1 ? "day" : "days"})
                                        </span>
                                      </div>

                                      {projHasPending && (
                                        <div className="flex items-center gap-1.5">
                                          <button
                                            type="button"
                                            onClick={() =>
                                              void bulkAction("approve", proj.pendingEntryIds)
                                            }
                                            disabled={actionBusy}
                                            className="px-2.5 py-1 text-[11px] font-semibold rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors disabled:opacity-40 cursor-pointer"
                                          >
                                            Approve {fmtHours(proj.pendingHours)}
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              openRejectModal(
                                                proj.pendingEntryIds,
                                                `${ind.userName} · ${proj.projectCode} (${fmtHours(proj.pendingHours)})`
                                              )
                                            }
                                            disabled={actionBusy}
                                            className="px-2.5 py-1 text-[11px] font-semibold rounded-md bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors disabled:opacity-40 cursor-pointer"
                                          >
                                            Reject
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  {/* Daily Entries Breakdown under Project */}
                                  {isProjOpen && (
                                    <div className="border-t border-neutral-100 overflow-x-auto">
                                      <table className="w-full text-xs">
                                        <thead>
                                          <tr className="bg-neutral-50/80 text-[10px] uppercase tracking-wider text-navy-400 border-b border-neutral-100">
                                            <th className="text-left px-4 py-2 font-semibold">Date</th>
                                            <th className="text-right px-3 py-2 font-semibold">Hours</th>
                                            <th className="text-left px-3 py-2 font-semibold">Activity / Task</th>
                                            <th className="text-left px-3 py-2 font-semibold">Notes / Reason</th>
                                            <th className="text-center px-3 py-2 font-semibold">Status</th>
                                            <th className="text-right px-4 py-2 font-semibold">Action</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-neutral-100">
                                          {proj.entries.map((entry) => {
                                            const canAct =
                                              entry.status === "submitted" ||
                                              entry.status === "pending";
                                            return (
                                              <tr key={entry.id} className="hover:bg-neutral-50/60">
                                                <td className="px-4 py-2 font-medium text-navy-800 whitespace-nowrap">
                                                  {fmtDayDate(entry.logDate)}
                                                </td>
                                                <td className="px-3 py-2 text-right font-bold text-navy-900 whitespace-nowrap">
                                                  {fmtHours(entry.hours)}
                                                </td>
                                                <td className="px-3 py-2 text-navy-600">
                                                  <span className="capitalize">
                                                    {entry.activityType.replace(/_/g, " ")}
                                                  </span>
                                                  {entry.wbsName && (
                                                    <span className="block text-[10px] text-navy-400">
                                                      {entry.wbsName}
                                                    </span>
                                                  )}
                                                </td>
                                                <td className="px-3 py-2 text-navy-600 max-w-[260px]">
                                                  {entry.rejectionReason ? (
                                                    <span className="text-red-600">
                                                      Rejected: {entry.rejectionReason}
                                                    </span>
                                                  ) : entry.notes ? (
                                                    <span>{entry.notes}</span>
                                                  ) : (
                                                    <span className="text-navy-300">—</span>
                                                  )}
                                                </td>
                                                <td className="px-3 py-2 text-center">
                                                  <span
                                                    className={cn(
                                                      "inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize",
                                                      STATUS_STYLES[entry.status] ??
                                                        "bg-neutral-100 text-navy-500"
                                                    )}
                                                  >
                                                    {entry.status}
                                                  </span>
                                                </td>
                                                <td className="px-4 py-2 text-right whitespace-nowrap">
                                                  {canAct ? (
                                                    <div className="inline-flex items-center gap-1">
                                                      <button
                                                        type="button"
                                                        onClick={() =>
                                                          void bulkAction("approve", [entry.id])
                                                        }
                                                        disabled={actionBusy}
                                                        title="Approve this entry"
                                                        className="p-1 rounded text-emerald-600 hover:bg-emerald-50 cursor-pointer disabled:opacity-40"
                                                      >
                                                        <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                                                          <path
                                                            fillRule="evenodd"
                                                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                                            clipRule="evenodd"
                                                          />
                                                        </svg>
                                                      </button>
                                                      <button
                                                        type="button"
                                                        onClick={() =>
                                                          openRejectModal(
                                                            [entry.id],
                                                            `${ind.userName} · ${fmtDayDate(entry.logDate)} (${fmtHours(entry.hours)})`
                                                          )
                                                        }
                                                        disabled={actionBusy}
                                                        title="Reject this entry"
                                                        className="p-1 rounded text-red-500 hover:bg-red-50 cursor-pointer disabled:opacity-40"
                                                      >
                                                        <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                                                          <path
                                                            fillRule="evenodd"
                                                            d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                                                            clipRule="evenodd"
                                                          />
                                                        </svg>
                                                      </button>
                                                    </div>
                                                  ) : (
                                                    <span className="text-[11px] text-navy-400">
                                                      {entry.reviewedAt
                                                        ? fmtShortDate(entry.reviewedAt)
                                                        : "—"}
                                                    </span>
                                                  )}
                                                </td>
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* TAB 2: NOT FILLING TIMESHEETS (FOR PMs / RMs / ADMINS)      */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {activeTab === "missing" && (
        <div className="space-y-4">
          {/* Week & Filter Bar */}
          <Card>
            <div className="px-4 py-3 flex flex-wrap items-center gap-3">
              {/* Week Navigation */}
              <div className="flex items-center rounded-lg border border-navy-900/14 bg-surface shadow-xs overflow-hidden">
                <button
                  type="button"
                  onClick={() => setMissingWeekAnchor((w) => shiftDays(w, -7))}
                  className="px-2.5 py-1.5 text-xs font-semibold text-navy-700 hover:bg-navy-50 cursor-pointer border-r border-navy-900/10"
                  title="Previous week"
                >
                  ← Prev
                </button>
                <span className="px-3 py-1.5 text-xs font-semibold text-navy-900 whitespace-nowrap">
                  {fmtShortDate(missingWeekRange.start)} – {fmtFullDate(missingWeekRange.end)}
                </span>
                <button
                  type="button"
                  onClick={() => setMissingWeekAnchor((w) => shiftDays(w, 7))}
                  className="px-2.5 py-1.5 text-xs font-semibold text-navy-700 hover:bg-navy-50 cursor-pointer border-l border-navy-900/10"
                  title="Next week"
                >
                  Next →
                </button>
              </div>

              {missingWeekAnchor !== getMondayOf(todayISO()) && (
                <button
                  type="button"
                  onClick={() => setMissingWeekAnchor(getMondayOf(todayISO()))}
                  className="text-xs font-semibold text-blue-700 hover:underline cursor-pointer"
                >
                  This Week
                </button>
              )}

              {/* Sub-status pills */}
              <div className="flex rounded-lg border border-navy-900/12 bg-surface overflow-hidden">
                {(
                  [
                    { key: "all", label: `All (${missingSummary.missingCount})` },
                    { key: "not_logged", label: `Not Logged (${missingSummary.notLoggedCount})` },
                    { key: "draft_only", label: `Draft Only (${missingSummary.draftOnlyCount})` },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setMissingStatusFilter(item.key)}
                    className={cn(
                      "px-2.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer",
                      missingStatusFilter === item.key
                        ? "bg-navy-900 text-white"
                        : "text-navy-600 hover:bg-navy-900/5"
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {/* Project filter */}
              <select
                value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}
                className="h-9 rounded-lg border border-navy-900/14 bg-surface px-2.5 text-xs text-navy-700 shadow-xs focus:border-navy-700 focus:outline-none max-w-[230px]"
              >
                <option value="">All my projects</option>
                {allProjectOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} — {p.name}
                  </option>
                ))}
              </select>

              {/* Search */}
              <div className="relative flex-1 min-w-[160px] max-w-[240px]">
                <input
                  type="text"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="Search team member…"
                  className="w-full h-9 rounded-lg border border-navy-900/14 bg-surface pl-8 pr-3 text-xs text-navy-800 placeholder:text-navy-400 focus:border-navy-700 focus:outline-none"
                />
                <svg
                  className="w-3.5 h-3.5 text-navy-400 absolute left-2.5 top-1/2 -translate-y-1/2"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="9" cy="9" r="6" />
                  <path d="M14 14l4 4" strokeLinecap="round" />
                </svg>
              </div>

              {/* Remind All button */}
              {filteredMissing.some((m) => m.canRemind) && (
                <Button
                  variant="secondary"
                  onClick={() => void sendReminder(filteredMissing)}
                  loading={remindingId === "__all__"}
                  className="ml-auto"
                >
                  Remind All ({filteredMissing.filter((m) => m.canRemind).length})
                </Button>
              )}
            </div>

            {/* Compliance Progress Bar */}
            {missingSummary.totalAllocated > 0 && (
              <div className="px-4 pb-3.5 pt-1">
                <div className="flex items-center justify-between text-[11px] text-navy-600 mb-1">
                  <span>
                    Weekly Submission Compliance:{" "}
                    <strong className="text-navy-900">
                      {missingSummary.compliantCount} / {missingSummary.totalAllocated}
                    </strong>{" "}
                    team members filled
                  </span>
                  <span className="font-semibold text-navy-800">{compliancePct}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-neutral-100 overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      compliancePct >= 80
                        ? "bg-emerald-500"
                        : compliancePct >= 50
                        ? "bg-amber-500"
                        : "bg-red-500"
                    )}
                    style={{ width: `${compliancePct}%` }}
                  />
                </div>
              </div>
            )}
          </Card>

          {/* Missing Individuals One-Liner List */}
          <Card>
            {missingLoading ? (
              <div className="p-12 text-center text-sm text-navy-500">Checking team compliance…</div>
            ) : filteredMissing.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-sm font-semibold text-emerald-700">
                  Everyone has filled their timesheets for this week!
                </p>
                <p className="text-xs text-navy-500 mt-1">
                  No missing or unsubmitted timesheets found for{" "}
                  {fmtShortDate(missingWeekRange.start)} – {fmtFullDate(missingWeekRange.end)}.
                </p>
              </div>
            ) : (
              <div>
                <div className="hidden md:grid md:grid-cols-[32px_minmax(220px,1.5fr)_minmax(180px,1.3fr)_130px_120px_120px] items-center gap-3 px-4 py-2.5 bg-neutral-50 border-b border-neutral-100 text-[10px] font-semibold uppercase tracking-wider text-navy-500">
                  <div />
                  <div>Team Member</div>
                  <div>Projects Missing Timesheet</div>
                  <div className="text-center">Status</div>
                  <div className="text-right">Last Logged</div>
                  <div className="text-right">Reminder</div>
                </div>

                <div className="divide-y divide-neutral-100">
                  {filteredMissing.map((m) => {
                    const isOpen = expandedMissingUsers.has(m.userId);
                    const wasReminded = remindedUsers.has(m.userId);

                    return (
                      <div key={m.userId}>
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => toggleMissingUserExpand(m.userId)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              toggleMissingUserExpand(m.userId);
                            }
                          }}
                          className={cn(
                            "grid grid-cols-1 md:grid-cols-[32px_minmax(220px,1.5fr)_minmax(180px,1.3fr)_130px_120px_120px] items-center gap-3 px-4 py-3 cursor-pointer transition-colors",
                            isOpen ? "bg-amber-50/40" : "hover:bg-neutral-50/80"
                          )}
                        >
                          <div className="hidden md:flex justify-center text-navy-400">
                            <svg
                              className={cn(
                                "w-4 h-4 transition-transform duration-150",
                                isOpen && "rotate-90 text-navy-900"
                              )}
                              viewBox="0 0 20 20"
                              fill="currentColor"
                            >
                              <path
                                fillRule="evenodd"
                                d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </div>

                          {/* Person */}
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className={cn(
                                "h-8 w-8 rounded-full text-xs font-bold flex items-center justify-center shrink-0",
                                m.status === "not_logged"
                                  ? "bg-red-100 text-red-700"
                                  : "bg-amber-100 text-amber-800"
                              )}
                            >
                              {initials(m.userName)}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-semibold text-sm text-navy-900 truncate">
                                  {m.userName}
                                </span>
                                {m.employeeId && (
                                  <span className="font-mono text-[10px] text-navy-400 bg-neutral-100 px-1.5 py-0.5 rounded">
                                    {m.employeeId}
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-navy-400 truncate">
                                {m.email || m.designation || "No email linked"}
                              </p>
                            </div>
                          </div>

                          {/* Missing Projects */}
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {m.missingProjects.slice(0, 3).map((p) => (
                              <span
                                key={p.projectId}
                                className="font-mono text-[10px] font-semibold px-2 py-0.5 rounded bg-navy-900/6 text-navy-700"
                                title={p.projectName}
                              >
                                {p.projectCode}
                              </span>
                            ))}
                            {m.missingProjects.length > 3 && (
                              <span className="text-[11px] text-navy-500">
                                +{m.missingProjects.length - 3} more
                              </span>
                            )}
                          </div>

                          {/* Status */}
                          <div className="md:text-center">
                            {m.status === "not_logged" ? (
                              <span className="inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">
                                Not Logged (0h)
                              </span>
                            ) : m.status === "draft_only" ? (
                              <span className="inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                                Draft Only ({fmtHours(m.totalDraftHours)})
                              </span>
                            ) : (
                              <span className="inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                                Rejected · Resubmit
                              </span>
                            )}
                          </div>

                          {/* Last Logged */}
                          <div className="md:text-right text-xs text-navy-500 whitespace-nowrap">
                            {m.lastLoggedDate ? fmtFullDate(m.lastLoggedDate) : (
                              <span className="text-red-500 font-medium">Never</span>
                            )}
                          </div>

                          {/* Remind Button */}
                          <div
                            className="flex md:justify-end"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {m.canRemind ? (
                              <button
                                type="button"
                                onClick={() => void sendReminder([m])}
                                disabled={remindingId === m.userId || wasReminded}
                                className={cn(
                                  "px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer disabled:opacity-60",
                                  wasReminded
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                    : "bg-white text-navy-700 border-navy-900/15 hover:bg-navy-50"
                                )}
                              >
                                {remindingId === m.userId
                                  ? "Sending…"
                                  : wasReminded
                                  ? "Reminded ✓"
                                  : "Remind"}
                              </button>
                            ) : (
                              <span className="text-[11px] text-navy-400">No login</span>
                            )}
                          </div>
                        </div>

                        {/* Expanded Missing Projects Breakdown */}
                        {isOpen && (
                          <div className="bg-amber-50/25 border-t border-neutral-100 px-4 md:pl-14 md:pr-5 py-3 space-y-2">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-navy-400">
                              Allocated projects with no submitted timesheet ({fmtShortDate(missingWeekRange.start)} – {fmtShortDate(missingWeekRange.end)})
                            </p>
                            <div className="grid gap-2">
                              {m.missingProjects.map((p) => (
                                <div
                                  key={p.projectId}
                                  className="flex items-center justify-between gap-3 px-3.5 py-2 rounded-lg bg-white border border-navy-900/10 text-xs flex-wrap"
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded bg-navy-900/6 text-navy-700">
                                      {p.projectCode}
                                    </span>
                                    <Link
                                      href={`/pmt/${p.projectId}`}
                                      className="font-semibold text-navy-900 hover:underline truncate"
                                    >
                                      {p.projectName}
                                    </Link>
                                    {p.roleInProject && (
                                      <span className="text-[11px] text-navy-500">
                                        · {p.roleInProject}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-3 ml-auto">
                                    <span className="text-[11px] text-navy-500">
                                      {p.allocationPercent}% allocated
                                    </span>
                                    <span
                                      className={cn(
                                        "text-[10px] font-semibold px-2 py-0.5 rounded-full",
                                        p.status === "not_logged"
                                          ? "bg-red-50 text-red-700"
                                          : p.status === "draft_only"
                                          ? "bg-amber-50 text-amber-800"
                                          : "bg-rose-50 text-rose-700"
                                      )}
                                    >
                                      {p.status === "not_logged"
                                        ? "0h logged"
                                        : p.status === "draft_only"
                                        ? `${fmtHours(p.draftHours)} draft (not submitted)`
                                        : `${fmtHours(p.rejectedHours)} rejected`}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ── Reject Modal ──────────────────────────────────────────── */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-900/40 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-neutral-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-neutral-100 bg-neutral-50/60">
              <h2 className="text-sm font-semibold text-navy-900">
                Reject Timesheet — {rejectContextLabel || `${rejectTargetIds.length} entries`}
              </h2>
              <p className="text-xs text-navy-500 mt-0.5">
                A reason is required so the employee knows what to revise and resubmit.
              </p>
            </div>
            <div className="px-6 py-5">
              <textarea
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g. Please split hours accurately across projects and resubmit."
                className="w-full px-3 py-2 border border-navy-500/20 rounded-xl text-sm resize-none focus:ring-2 focus:ring-navy-900 focus:outline-none"
                autoFocus
              />
            </div>
            <div className="px-6 py-4 border-t border-neutral-100 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setShowRejectModal(false);
                  setRejectReason("");
                  setRejectTargetIds([]);
                }}
                className="px-4 py-2 text-xs font-semibold text-navy-700 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void bulkAction("reject", rejectTargetIds, rejectReason)}
                disabled={!rejectReason.trim() || actionBusy}
                className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
              >
                Confirm rejection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Export Options Modal ─────────────────────────────────── */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-navy-900/10 max-w-md w-full overflow-hidden">
            <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-navy-900">Export Timesheets</h2>
                <p className="text-xs text-navy-500 mt-0.5">Download company or team timesheet records</p>
              </div>
              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                className="text-navy-400 hover:text-navy-700 text-lg leading-none cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="px-6 py-5 space-y-4 text-sm text-navy-800">
              <div>
                <label className="block text-xs font-semibold text-navy-700 mb-2">Export Format</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setExportFormat("xlsx")}
                    className={cn(
                      "p-3 rounded-xl border text-left cursor-pointer transition-all",
                      exportFormat === "xlsx"
                        ? "border-navy-900 bg-navy-50/50 ring-1 ring-navy-900"
                        : "border-neutral-200 hover:border-neutral-300"
                    )}
                  >
                    <p className="font-semibold text-navy-900 text-xs">Excel (.xlsx)</p>
                    <p className="text-[11px] text-navy-500 mt-0.5">
                      Multi-sheet analysis: Raw entries, By Project, By Employee &amp; Summary
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setExportFormat("csv")}
                    className={cn(
                      "p-3 rounded-xl border text-left cursor-pointer transition-all",
                      exportFormat === "csv"
                        ? "border-navy-900 bg-navy-50/50 ring-1 ring-navy-900"
                        : "border-neutral-200 hover:border-neutral-300"
                    )}
                  >
                    <p className="font-semibold text-navy-900 text-xs">CSV (.csv)</p>
                    <p className="text-[11px] text-navy-500 mt-0.5">
                      Raw tabular data ready for reporting, BI tools &amp; spreadsheets
                    </p>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-navy-700 mb-2">Date Range</label>
                <select
                  value={exportRange}
                  onChange={(e) => setExportRange(e.target.value as any)}
                  className="w-full h-10 px-3 rounded-xl border border-navy-900/15 bg-surface text-xs text-navy-800 focus:outline-none focus:border-navy-900"
                >
                  <option value="current">Current Screen Filter</option>
                  <option value="month">This Month</option>
                  <option value="last_month">Last Month</option>
                  <option value="all">All Time (complete history)</option>
                  <option value="custom">Custom Date Range…</option>
                </select>
              </div>

              {exportRange === "custom" && (
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[11px] text-navy-500 mb-1">From Date</label>
                    <input
                      type="date"
                      value={exportCustomFrom}
                      onChange={(e) => setExportCustomFrom(e.target.value)}
                      className="w-full h-9 px-2.5 rounded-lg border border-navy-900/15 text-xs text-navy-800"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-navy-500 mb-1">To Date</label>
                    <input
                      type="date"
                      value={exportCustomTo}
                      onChange={(e) => setExportCustomTo(e.target.value)}
                      className="w-full h-9 px-2.5 rounded-lg border border-navy-900/15 text-xs text-navy-800"
                    />
                  </div>
                </div>
              )}

              {projectFilter && (
                <p className="text-[11px] text-navy-500 bg-navy-50 px-3 py-2 rounded-lg">
                  Filtered to project:{" "}
                  <span className="font-medium text-navy-800">
                    {allProjectOptions.find((p) => p.id === projectFilter)?.name || projectFilter}
                  </span>
                </p>
              )}
            </div>

            <div className="px-6 py-4 border-t border-neutral-100 flex justify-end gap-2.5 bg-neutral-50/50">
              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                disabled={exporting}
                className="px-4 py-2 text-xs font-semibold text-navy-700 hover:bg-neutral-200 rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <Button onClick={() => triggerExport(exportFormat, exportRange)} loading={exporting}>
                Download {exportFormat.toUpperCase()}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
