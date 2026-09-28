"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

// ═══════════════════════════════════════════════════════════════
// Team Allocations — reviewing the projects people put themselves on.
//
// Employees add themselves to projects from My Projects and are on them
// at once. This is where their reporting manager (or an admin) looks
// over those self-allocations afterwards: mark one reviewed, or take the
// person off a project they should not be on.
//
// Requests made before self-service ("pending") can still be approved or
// rejected here.
// ═══════════════════════════════════════════════════════════════

type Status = "self_allocated" | "reviewed" | "removed" | "pending" | "approved" | "rejected";
type Action = "review" | "remove" | "approve" | "reject";
type Filter = "self_allocated" | "reviewed" | "removed" | "pending" | "all";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "self_allocated", label: "To review" },
  { value: "reviewed", label: "Reviewed" },
  { value: "removed", label: "Removed" },
  { value: "pending", label: "Old requests" },
  { value: "all", label: "All" },
];

const STATUS_LABEL: Record<string, string> = {
  self_allocated: "To review",
  reviewed: "Reviewed",
  removed: "Removed",
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

const STATUS_STYLES: Record<string, string> = {
  self_allocated: "bg-blue-50 text-blue-700 border-blue-200",
  reviewed: "bg-emerald-100 text-emerald-800 border-emerald-200",
  removed: "bg-red-100 text-red-700 border-red-200",
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  approved: "bg-emerald-100 text-emerald-800 border-emerald-200",
  rejected: "bg-red-100 text-red-700 border-red-200",
};

const EMPTY: Record<Filter, string> = {
  self_allocated: "Nothing to review. When your team adds themselves to projects, it shows up here.",
  reviewed: "Nothing reviewed yet.",
  removed: "Nobody has been taken off a project.",
  pending: "No requests from before self-service are waiting.",
  all: "No allocations from your team yet.",
};

interface Allocation {
  id: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  userId: string;
  userName: string | null;
  employeeId: string | null;
  requestedRole: string;
  requestedAllocationPercent: number;
  requestedStartDate: string | null;
  requestedEndDate: string | null;
  notes: string | null;
  status: Status;
  onProject: boolean;
  reviewNotes: string | null;
  reviewedAt: string | null;
  createdAt: string | null;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

/** What can be done to a row in this state. */
function actionsFor(status: Status): Action[] {
  switch (status) {
    case "self_allocated": return ["review", "remove"];
    case "reviewed": return ["remove"];
    case "pending": return ["approve", "reject"];
    default: return [];
  }
}

const ACTION_COPY: Record<Action, { title: string; button: string; done: string; tone: "good" | "bad" }> = {
  review:  { title: "Mark as reviewed", button: "Mark reviewed", done: "Reviewed", tone: "good" },
  remove:  { title: "Take off this project", button: "Remove from project", done: "Removed", tone: "bad" },
  approve: { title: "Approve request", button: "Approve", done: "Approved", tone: "good" },
  reject:  { title: "Reject request", button: "Reject", done: "Rejected", tone: "bad" },
};

export function AdminAllocationRequestsClient() {
  const [rows, setRows] = useState<Allocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("self_allocated");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [hint, setHint] = useState("");

  // Confirmation for remove / approve / reject. Review is one click.
  const [modal, setModal] = useState<{ row: Allocation; action: Action } | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/allocation-requests?status=${filter}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || "Failed to load."); return; }
      setRows(data.requests ?? []);
      setError("");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { void load(); }, [load]);

  const act = async (row: Allocation, action: Action, notes: string | null) => {
    setBusy(row.id);
    setError("");
    try {
      const res = await fetch("/api/admin/allocation-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: row.id, action, reviewNotes: notes }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || "That didn't go through."); return; }
      setHint(`${ACTION_COPY[action].done}: ${row.userName ?? "employee"} on ${row.projectName}.`);
      setTimeout(() => setHint(""), 5000);
      setModal(null);
      await load();
    } finally {
      setBusy(null);
    }
  };

  const onAction = (row: Allocation, action: Action) => {
    if (action === "review") {
      void act(row, action, null);
      return;
    }
    setModal({ row, action });
    setReviewNotes("");
  };

  const toReview = rows.filter((r) => r.status === "self_allocated").length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-navy-900 font-[family-name:var(--font-league-spartan)]">
          Team allocations
          {filter === "self_allocated" && toReview > 0 && (
            <span className="ml-2.5 inline-flex items-center justify-center h-6 min-w-[24px] px-1.5 rounded-full bg-blue-600 text-white text-[11px] font-bold">
              {toReview}
            </span>
          )}
        </h1>
        <p className="text-sm text-navy-500 mt-1 max-w-2xl">
          Your team adds themselves to the projects they work on and can log time straight away.
          Look them over here — mark each one reviewed, or take someone off a project they shouldn&rsquo;t be on.
        </p>
      </div>

      {/* Filters */}
      <div className="flex rounded-lg border border-navy-900/12 bg-surface shadow-xs overflow-hidden w-fit">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              "px-4 py-2 text-[12px] font-medium transition-colors cursor-pointer",
              filter === f.value ? "bg-navy-900 text-white" : "text-navy-600 hover:bg-navy-900/6"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <div role="alert" className="bg-red-600/5 border border-red-600/20 text-red-600 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}
      {hint && (
        <div role="status" className="bg-emerald-500/5 border border-emerald-500/20 text-emerald-700 text-sm rounded-lg px-4 py-3">
          {hint}
        </div>
      )}

      {/* Confirmation modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-900/40 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-neutral-200 overflow-hidden">
            <div className={cn(
              "px-6 py-4 border-b border-neutral-100",
              ACTION_COPY[modal.action].tone === "good" ? "bg-emerald-50/60" : "bg-red-50/60"
            )}>
              <h2 className="text-sm font-semibold text-navy-900">{ACTION_COPY[modal.action].title}</h2>
              <p className="text-xs text-navy-500 mt-0.5">
                {modal.row.userName} → {modal.row.projectName} as {modal.row.requestedRole}
              </p>
            </div>

            {modal.action === "remove" && (
              <div className="px-6 py-4 bg-red-500/5 text-red-800 text-xs border-b border-red-100">
                They come off the project and it leaves their timesheet. Hours already logged are kept.
                They will see your note on My Projects.
              </div>
            )}
            {modal.action === "approve" && (
              <div className="px-6 py-4 bg-emerald-500/5 text-emerald-800 text-xs border-b border-emerald-100">
                This adds them to the project team so they can log time against it.
              </div>
            )}

            <div className="px-6 py-5">
              <label className="block text-xs font-semibold text-navy-700 mb-1.5">
                Note <span className="font-normal text-navy-400">(optional)</span>
              </label>
              <textarea
                rows={2}
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder={ACTION_COPY[modal.action].tone === "bad" ? "Why…" : "Anything for them to know…"}
                className="w-full px-3 py-2 border border-navy-500/20 rounded-xl text-sm resize-none focus:ring-2 focus:ring-navy-900 focus:outline-none"
                autoFocus
              />
            </div>

            <div className="px-6 py-4 border-t border-neutral-100 flex justify-end gap-2.5">
              <button
                onClick={() => setModal(null)}
                className="px-4 py-2 text-xs font-semibold text-navy-700 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => act(modal.row, modal.action, reviewNotes.trim() || null)}
                disabled={busy === modal.row.id}
                className={cn(
                  "px-4 py-2 text-xs font-semibold text-white rounded-lg transition-colors disabled:opacity-50 cursor-pointer",
                  ACTION_COPY[modal.action].tone === "good"
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : "bg-red-600 hover:bg-red-700"
                )}
              >
                {busy === modal.row.id ? "Working…" : ACTION_COPY[modal.action].button}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <Card>
        {loading ? (
          <div className="p-12 text-center text-sm text-navy-500">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm font-medium text-navy-700">{EMPTY[filter]}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b border-neutral-100">
                  <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider text-navy-500 font-semibold">Employee</th>
                  <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider text-navy-500 font-semibold">Project</th>
                  <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider text-navy-500 font-semibold">Role</th>
                  <th className="text-right px-4 py-2.5 text-[10px] uppercase tracking-wider text-navy-500 font-semibold">Alloc %</th>
                  <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider text-navy-500 font-semibold">Added</th>
                  <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider text-navy-500 font-semibold">Status</th>
                  <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider text-navy-500 font-semibold">Notes</th>
                  <th className="text-right px-4 py-2.5 text-[10px] uppercase tracking-wider text-navy-500 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {rows.map((row) => {
                  const actions = actionsFor(row.status);
                  // Somebody who has since taken themselves off needs no removing.
                  const left = (row.status === "self_allocated" || row.status === "reviewed") && !row.onProject;
                  return (
                    <tr key={row.id} className="hover:bg-neutral-50/60 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-navy-900">{row.userName ?? <span className="text-navy-400 italic text-xs">Unknown</span>}</p>
                        {row.employeeId && (
                          <p className="text-[10px] text-navy-400 font-mono">{row.employeeId}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-navy-700">
                        <span className="font-mono text-[10px] text-navy-400 mr-1.5">{row.projectCode}</span>
                        {row.projectName}
                      </td>
                      <td className="px-4 py-3 text-navy-700">{row.requestedRole}</td>
                      <td className="px-4 py-3 text-right font-semibold text-navy-900">{row.requestedAllocationPercent}%</td>
                      <td className="px-4 py-3 text-[12px] text-navy-500 whitespace-nowrap">{fmtDate(row.createdAt)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={cn(
                          "text-[11px] font-semibold px-2 py-0.5 rounded-full border",
                          STATUS_STYLES[row.status] ?? "bg-neutral-100 text-navy-500 border-neutral-200"
                        )}>
                          {STATUS_LABEL[row.status] ?? row.status}
                        </span>
                        {left && <span className="ml-1.5 text-[11px] text-navy-400">· has left</span>}
                      </td>
                      <td className="px-4 py-3 text-[12px] text-navy-600 max-w-[220px]">
                        {row.reviewNotes ? (
                          <span>{row.reviewNotes}</span>
                        ) : row.notes ? (
                          <span className="text-navy-400">{row.notes}</span>
                        ) : (
                          <span className="text-navy-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1.5 whitespace-nowrap">
                          {actions.map((a) => {
                            if (a === "remove" && left) return null;
                            const good = ACTION_COPY[a].tone === "good";
                            return (
                              <button
                                key={a}
                                onClick={() => onAction(row, a)}
                                disabled={busy === row.id}
                                className={cn(
                                  "px-2.5 py-1 rounded-lg text-[11.5px] font-semibold transition-colors cursor-pointer disabled:opacity-40",
                                  good
                                    ? "text-emerald-700 hover:bg-emerald-50"
                                    : "text-red-600 hover:bg-red-50"
                                )}
                              >
                                {a === "review" ? "Looks right" : a === "remove" ? "Remove" : a === "approve" ? "Approve" : "Reject"}
                              </button>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
