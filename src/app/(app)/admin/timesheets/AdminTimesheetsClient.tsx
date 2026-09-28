"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

// ═══════════════════════════════════════════════════════════════
// Timesheet Approval — reporting manager / admin view.
//
// Reporting managers see submitted entries from their direct reports.
// Admins see all entries. Both can bulk approve or reject with a reason.
// Export button downloads an Excel workbook of the visible entries.
// ═══════════════════════════════════════════════════════════════

const STATUS_STYLES: Record<string, string> = {
  draft:     "bg-neutral-100 text-navy-500",
  submitted: "bg-blue-50 text-blue-700 border border-blue-200",
  approved:  "bg-emerald-50 text-emerald-700 border border-emerald-200",
  rejected:  "bg-red-50 text-red-700 border border-red-200",
};

interface Entry {
  id: string;
  projectCode: string;
  projectName: string;
  userId: string;
  userName: string | null;
  logDate: string;
  hours: number;
  activityType: string;
  notes: string | null;
  status: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
}

interface Project {
  id: string;
  code: string;
  name: string;
}

interface Meta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function AdminTimesheetsClient() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [meta, setMeta] = useState<Meta>({ total: 0, page: 1, limit: 50, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);
  const [error, setError] = useState("");
  const [hint, setHint] = useState("");
  const [exporting, setExporting] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState("submitted");
  const [projectFilter, setProjectFilter] = useState("");
  const [weekFilter, setWeekFilter] = useState("");

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Rejection modal
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectModal, setShowRejectModal] = useState(false);

  const load = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        status: statusFilter,
        page: String(page),
        limit: "50",
      });
      if (projectFilter) params.set("project", projectFilter);
      if (weekFilter) params.set("week", weekFilter);

      const res = await fetch(`/api/pmt/timesheets?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || "Could not load timesheets."); return; }
      setEntries(data.entries ?? []);
      setProjects(data.projects ?? []);
      setMeta(data.meta ?? { total: 0, page: 1, limit: 50, totalPages: 0 });
      setSelected(new Set());
      setError("");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, projectFilter, weekFilter]);

  useEffect(() => { void load(); }, [load]);

  const selectedList = useMemo(() => [...selected], [selected]);
  const allSelected = entries.length > 0 && entries.every((e) => selected.has(e.id));

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(entries.filter((e) => e.status === "submitted").map((e) => e.id)));
    }
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const bulkAction = async (action: "approve" | "reject") => {
    if (selectedList.length === 0) return;
    if (action === "reject" && !rejectReason.trim()) {
      setShowRejectModal(true);
      return;
    }
    setActionBusy(true);
    setError("");
    try {
      const res = await fetch("/api/pmt/timesheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: selectedList,
          action,
          rejectionReason: action === "reject" ? rejectReason.trim() : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || "Action failed."); return; }
      const skippedNote =
        data.skipped > 0
          ? ` ${data.skipped} skipped — your own entries, or ones already reviewed, can't be ${action === "approve" ? "approved" : "rejected"} here.`
          : "";
      setHint(`${action === "approve" ? "Approved" : "Rejected"} ${data.count} ${data.count === 1 ? "entry" : "entries"}.${skippedNote}`);
      setTimeout(() => setHint(""), 4000);
      setShowRejectModal(false);
      setRejectReason("");
      await load();
    } finally {
      setActionBusy(false);
    }
  };

  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState<"xlsx" | "csv">("xlsx");
  const [exportRange, setExportRange] = useState<"current" | "month" | "last_month" | "all" | "custom">("current");
  const [exportCustomFrom, setExportCustomFrom] = useState("");
  const [exportCustomTo, setExportCustomTo] = useState("");

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
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
        params.set("from", firstDay);
        params.set("to", lastDay);
      } else if (range === "last_month") {
        const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
        const lastDay = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10);
        params.set("from", firstDay);
        params.set("to", lastDay);
      } else if (range === "custom") {
        if (exportCustomFrom) params.set("from", exportCustomFrom);
        if (exportCustomTo) params.set("to", exportCustomTo);
      } else if (range === "current" && weekFilter) {
        params.set("from", weekFilter);
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

  const submittedInView = entries.filter((e) => e.status === "submitted");

  return (
    <div className="space-y-5">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-navy-900 font-[family-name:var(--font-league-spartan)]">
            Timesheet approvals
          </h1>
          <p className="text-sm text-navy-500 mt-1">
            Review and approve your team&apos;s submitted timesheets.
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

      {/* ── Filters ───────────────────────────────────────────────── */}
      <Card>
        <div className="px-5 py-4 flex flex-wrap items-center gap-3">
          {/* Status filter */}
          <div className="flex rounded-lg border border-navy-900/12 bg-surface shadow-xs overflow-hidden">
            {(["submitted", "approved", "rejected", "all"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setStatusFilter(v)}
                className={cn(
                  "px-3 py-1.5 text-[12px] font-medium transition-colors cursor-pointer capitalize",
                  statusFilter === v ? "bg-navy-900 text-white" : "text-navy-600 hover:bg-navy-900/6"
                )}
              >
                {v}
              </button>
            ))}
          </div>

          {/* Project filter */}
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="h-9 rounded-lg border border-navy-900/14 bg-surface px-2.5 text-[13px] text-navy-700 shadow-xs focus:border-navy-700 focus:outline-none"
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
            ))}
          </select>

          {/* Week filter */}
          <input
            type="date"
            value={weekFilter}
            onChange={(e) => setWeekFilter(e.target.value)}
            title="Filter by week containing this date"
            className="h-9 rounded-lg border border-navy-900/14 bg-surface px-2.5 text-[13px] text-navy-700 shadow-xs focus:border-navy-700 focus:outline-none"
          />

          <span className="text-[12px] text-navy-500 ml-auto">
            {meta.total} {meta.total === 1 ? "entry" : "entries"}
          </span>
        </div>
      </Card>

      {/* ── Bulk actions ──────────────────────────────────────────── */}
      {selectedList.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-navy-900 rounded-xl text-white text-sm">
          <span className="font-medium">{selectedList.length} selected</span>
          <div className="flex gap-2 ml-auto">
            <button
              onClick={() => bulkAction("approve")}
              disabled={actionBusy}
              className="px-3.5 py-1.5 text-xs font-semibold bg-emerald-500 hover:bg-emerald-600 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
            >
              Approve all
            </button>
            <button
              onClick={() => setShowRejectModal(true)}
              disabled={actionBusy}
              className="px-3.5 py-1.5 text-xs font-semibold bg-red-500 hover:bg-red-600 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
            >
              Reject all
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="px-3.5 py-1.5 text-xs font-semibold bg-white/10 hover:bg-white/20 rounded-lg transition-colors cursor-pointer"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* ── Reject modal ──────────────────────────────────────────── */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-900/40 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-neutral-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-neutral-100 bg-neutral-50/60">
              <h2 className="text-sm font-semibold text-navy-900">Reject {selectedList.length} {selectedList.length === 1 ? "entry" : "entries"}</h2>
              <p className="text-xs text-navy-500 mt-0.5">A reason is required so the employee knows what to fix.</p>
            </div>
            <div className="px-6 py-5">
              <textarea
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g. Hours appear inflated — please review and resubmit."
                className="w-full px-3 py-2 border border-navy-500/20 rounded-xl text-sm resize-none focus:ring-2 focus:ring-navy-900 focus:outline-none"
                autoFocus
              />
            </div>
            <div className="px-6 py-4 border-t border-neutral-100 flex justify-end gap-2.5">
              <button
                onClick={() => { setShowRejectModal(false); setRejectReason(""); }}
                className="px-4 py-2 text-xs font-semibold text-navy-700 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => bulkAction("reject")}
                disabled={!rejectReason.trim() || actionBusy}
                className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
              >
                Confirm rejection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Feedback ──────────────────────────────────────────────── */}
      {error && (
        <div role="alert" className="bg-red-600/5 border border-red-600/20 text-red-600 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}
      {hint && (
        <div className="bg-emerald-500/5 border border-emerald-500/20 text-emerald-700 text-sm rounded-lg px-4 py-3">
          {hint}
        </div>
      )}

      {/* ── Entries table ─────────────────────────────────────────── */}
      <Card>
        {loading ? (
          <div className="p-12 text-center text-sm text-navy-500">Loading…</div>
        ) : entries.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm font-medium text-navy-700">No entries found.</p>
            <p className="text-xs text-navy-500 mt-1">Try a different status filter.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b border-neutral-100">
                  <th className="px-4 py-2.5 w-10">
                    {submittedInView.length > 0 && (
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAll}
                        className="rounded cursor-pointer"
                      />
                    )}
                  </th>
                  <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider text-navy-500 font-semibold">Employee</th>
                  <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider text-navy-500 font-semibold">Project</th>
                  <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider text-navy-500 font-semibold">Date</th>
                  <th className="text-right px-4 py-2.5 text-[10px] uppercase tracking-wider text-navy-500 font-semibold">Hours</th>
                  <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider text-navy-500 font-semibold">Activity</th>
                  <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider text-navy-500 font-semibold">Status</th>
                  <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider text-navy-500 font-semibold">Submitted</th>
                  <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider text-navy-500 font-semibold min-w-[180px]">Notes / Reason</th>
                  <th className="text-center px-4 py-2.5 text-[10px] uppercase tracking-wider text-navy-500 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {entries.map((entry) => {
                  const isSelected = selected.has(entry.id);
                  const canAct = entry.status === "submitted";
                  return (
                    <tr
                      key={entry.id}
                      className={cn(
                        "transition-colors",
                        isSelected ? "bg-navy-900/[0.04]" : "hover:bg-neutral-50/60"
                      )}
                    >
                      <td className="px-4 py-2.5">
                        {canAct && (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggle(entry.id)}
                            className="rounded cursor-pointer"
                          />
                        )}
                      </td>
                      <td className="px-4 py-2.5 font-medium text-navy-900 whitespace-nowrap">
                        {entry.userName ?? <span className="text-navy-400 italic text-xs">Unknown</span>}
                      </td>
                      <td className="px-4 py-2.5 text-navy-700 whitespace-nowrap">
                        <span className="font-mono text-[10px] text-navy-400 mr-1.5">{entry.projectCode}</span>
                        {entry.projectName}
                      </td>
                      <td className="px-4 py-2.5 text-navy-600 whitespace-nowrap">{fmtDate(entry.logDate)}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-navy-900">{entry.hours}h</td>
                      <td className="px-4 py-2.5 text-navy-600 capitalize">{entry.activityType}</td>
                      <td className="px-4 py-2.5">
                        <span className={cn(
                          "text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize",
                          STATUS_STYLES[entry.status] ?? "bg-neutral-100 text-navy-500"
                        )}>
                          {entry.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-[11px] text-navy-500 whitespace-nowrap">
                        {fmtDateTime(entry.submittedAt)}
                      </td>
                      <td className="px-4 py-2.5 text-[12px] text-navy-600 max-w-[240px]">
                        {entry.rejectionReason ? (
                          <span className="text-red-600">{entry.rejectionReason}</span>
                        ) : entry.notes ? (
                          <span className="truncate block">{entry.notes}</span>
                        ) : (
                          <span className="text-navy-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {canAct && (
                          <div className="flex justify-center gap-1.5">
                            <button
                              onClick={async () => {
                                setSelected(new Set([entry.id]));
                                await bulkAction("approve");
                              }}
                              disabled={actionBusy}
                              title="Approve"
                              className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-40 cursor-pointer"
                            >
                              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                              </svg>
                            </button>
                            <button
                              onClick={() => { setSelected(new Set([entry.id])); setShowRejectModal(true); }}
                              disabled={actionBusy}
                              title="Reject"
                              className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40 cursor-pointer"
                            >
                              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                              </svg>
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {meta.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-neutral-100 px-5 py-3">
            <span className="text-[12px] text-navy-500">
              Page {meta.page} of {meta.totalPages} · {meta.total} entries
            </span>
            <div className="flex gap-2">
              {Array.from({ length: meta.totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === meta.totalPages || Math.abs(p - meta.page) <= 1)
                .map((p, idx, arr) => {
                  const prev = arr[idx - 1];
                  const showEllipsis = prev !== undefined && p - prev > 1;
                  return (
                    <React.Fragment key={p}>
                      {showEllipsis && <span className="px-2 text-navy-400">…</span>}
                      <button
                        onClick={() => load(p)}
                        className={cn(
                          "min-w-[32px] px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer",
                          meta.page === p ? "bg-navy-900 text-white" : "text-navy-600 hover:bg-neutral-100"
                        )}
                      >
                        {p}
                      </button>
                    </React.Fragment>
                  );
                })}
            </div>
          </div>
        )}
      </Card>

      {/* ── Legend ────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-4 text-[11px] text-navy-500 px-1">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-blue-100 border border-blue-200" /> Submitted — awaiting your review
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-emerald-100 border border-emerald-200" /> Approved
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-red-100 border border-red-200" /> Rejected
        </span>
      </div>

      {/* ── Export Options Modal ─────────────────────────────────── */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-navy-900/10 max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-navy-900">Export Timesheets</h2>
                <p className="text-xs text-navy-500 mt-0.5">Download company or team timesheet records</p>
              </div>
              <button
                onClick={() => setShowExportModal(false)}
                className="text-navy-400 hover:text-navy-700 text-lg leading-none cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="px-6 py-5 space-y-4 text-sm text-navy-800">
              {/* Format */}
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
                    <p className="text-[11px] text-navy-500 mt-0.5">Multi-sheet analysis: Raw entries, By Project, By Employee & Summary</p>
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
                    <p className="text-[11px] text-navy-500 mt-0.5">Raw tabular data ready for reporting, BI tools & spreadsheets</p>
                  </button>
                </div>
              </div>

              {/* Date Scope */}
              <div>
                <label className="block text-xs font-semibold text-navy-700 mb-2">Date Range</label>
                <select
                  value={exportRange}
                  onChange={(e) => setExportRange(e.target.value as any)}
                  className="w-full h-10 px-3 rounded-xl border border-navy-900/15 bg-surface text-xs text-navy-800 focus:outline-none focus:border-navy-900"
                >
                  <option value="current">Current Screen Filter (as filtered)</option>
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
                  Filtered to project: <span className="font-medium text-navy-800">{projects.find(p => p.id === projectFilter)?.name || projectFilter}</span>
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
              <Button
                onClick={() => triggerExport(exportFormat, exportRange)}
                loading={exporting}
              >
                <svg className="w-4 h-4 mr-1.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3.5 13.5v2A1.5 1.5 0 0 0 5 17h10a1.5 1.5 0 0 0 1.5-1.5v-2M10 3.5v9M7 9.5l3 3.5 3-3.5" />
                </svg>
                Download {exportFormat.toUpperCase()}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
