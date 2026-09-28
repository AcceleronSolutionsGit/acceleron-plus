"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Combobox, type ComboboxOption } from "@/components/ui/Combobox";
import { cn } from "@/lib/utils";

// ═══════════════════════════════════════════════════════════════
// My Projects — employees put themselves on the projects they work on.
//
// Pick a project from a searchable dropdown — the list is every live
// project, most of them imported from the Zoho sales-order Excel, so it
// runs to hundreds and a wall of cards stops working — choose a role and
// an allocation, and you are on it. There is no approval first: the
// project shows up in My Timesheet straight away. Your reporting manager
// reviews self-allocations afterwards and can take you off one.
//
// Below the picker are only the projects that concern you.
// ═══════════════════════════════════════════════════════════════

const PROJECT_STATUS_BADGE: Record<string, string> = {
  initiated: "bg-slate-100 text-slate-600",
  planning:  "bg-blue-100 text-blue-700",
  active:    "bg-emerald-100 text-emerald-700",
  on_hold:   "bg-amber-100 text-amber-700",
};

interface MyRequest {
  id: string;
  role: string;
  /** self_allocated | reviewed | removed | withdrawn — and, from before
   *  self-service, pending | approved | rejected. */
  status: string;
  reviewNotes: string | null;
}

interface MyAllocation {
  role: string;
  allocationPercent: number;
}

interface Project {
  id: string;
  code: string;
  name: string;
  status: string;
  startDate: string | null;
  plannedEndDate: string | null;
  /** Customer, from the sales order. */
  clientName: string | null;
  /** Zoho sales order number, when the project came from the Excel import. */
  salesOrderRef: string | null;
  myAllocation: MyAllocation | null;
  myRequest: MyRequest | null;
}

type FormMode = "add" | "edit";

interface AllocationForm {
  mode: FormMode;
  projectId: string;
  projectName: string;
  projectMeta: string;
}

/** "ACC-014 · Gainwell Commosales · SO-00231" — whatever the project has. */
function projectMeta(p: Project): string {
  return [p.code, p.clientName, p.salesOrderRef && `SO ${p.salesOrderRef}`].filter(Boolean).join(" · ");
}

/** Taken off by the manager, and not back on since. */
function wasRemoved(p: Project): boolean {
  return !p.myAllocation && (p.myRequest?.status === "removed" || p.myRequest?.status === "rejected");
}

/** An old-style request still waiting for approval. */
function isLegacyPending(p: Project): boolean {
  return !p.myAllocation && p.myRequest?.status === "pending";
}

/** On it first, then old requests still waiting, then removed. */
function rank(p: Project): number {
  if (p.myAllocation) return 0;
  if (isLegacyPending(p)) return 1;
  return 2;
}

export function MyProjectsClient({ userName }: { userName: string }) {
  void userName;
  const [projects, setProjects] = useState<Project[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // The project chosen in the picker, before the form opens.
  const [pickedId, setPickedId] = useState("");

  // Add / edit form
  const [form, setForm] = useState<AllocationForm | null>(null);
  const [selectedRole, setSelectedRole] = useState("");
  const [allocationPct, setAllocationPct] = useState(100);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // Leaving a project
  const [leaving, setLeaving] = useState<Project | null>(null);
  const [leaveBusy, setLeaveBusy] = useState(false);

  // A line at the top saying what just happened.
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/me/projects");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadError(data.error || "Could not load projects.");
        return;
      }
      setProjects(data.projects ?? []);
      setRoles(data.roles ?? []);
      setLoadError("");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  // Everything you are not on, for the picker. The search matches the
  // name, the code, the customer and the sales order number.
  const joinable = useMemo(() => projects.filter((p) => !p.myAllocation), [projects]);
  const pickerOptions = useMemo<ComboboxOption[]>(
    () =>
      joinable.map((p) => ({
        value: p.id,
        label: p.name,
        hint: p.code,
        detail: [p.clientName, p.salesOrderRef && `SO ${p.salesOrderRef}`].filter(Boolean).join(" · ") || undefined,
        keywords: [p.clientName, p.salesOrderRef, p.status].filter(Boolean).join(" "),
      })),
    [joinable]
  );
  const picked = joinable.find((p) => p.id === pickedId) ?? null;

  // Projects that concern you: on it, an old request waiting, or removed.
  const mine = useMemo(
    () =>
      projects
        .filter((p) => p.myAllocation || isLegacyPending(p) || wasRemoved(p))
        .sort((a, b) => rank(a) - rank(b) || a.code.localeCompare(b.code)),
    [projects]
  );

  const openForm = (p: Project, mode: FormMode) => {
    setForm({ mode, projectId: p.id, projectName: p.name, projectMeta: projectMeta(p) });
    setSelectedRole(mode === "edit" ? p.myAllocation?.role ?? "" : "");
    setAllocationPct(mode === "edit" ? p.myAllocation?.allocationPercent ?? 100 : 100);
    setNotes("");
    setFormError("");
  };

  const closeForm = () => {
    setForm(null);
    setFormError("");
  };

  const submitForm = async () => {
    if (!form) return;
    setFormError("");
    if (!selectedRole) { setFormError("Choose your role on this project."); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/me/projects", {
        method: form.mode === "add" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: form.projectId,
          role: selectedRole,
          allocationPercent: allocationPct,
          ...(form.mode === "add" ? { notes: notes.trim() || null } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(data.error || "That didn't save.");
        return;
      }
      setNotice(
        form.mode === "add"
          ? `You're on ${form.projectName}. You can log time against it in My Timesheet now.`
          : `Updated ${form.projectName}.`
      );
      setPickedId("");
      closeForm();
      await load();
    } finally {
      setSubmitting(false);
    }
  };

  const confirmLeave = async () => {
    if (!leaving) return;
    setLeaveBusy(true);
    try {
      const res = await fetch(`/api/me/projects?projectId=${encodeURIComponent(leaving.id)}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice(data.error || "Could not take you off that project.");
      } else {
        setNotice(`You're off ${leaving.name}. Hours you already logged are kept.`);
      }
      setLeaving(null);
      await load();
    } finally {
      setLeaveBusy(false);
    }
  };

  const allocatedCount = projects.filter((p) => p.myAllocation).length;
  const totalAllocationPct = projects.reduce(
    (sum, p) => sum + (p.myAllocation?.allocationPercent ?? 0),
    0
  );

  if (loading) {
    return <div className="p-8 text-center text-sm text-navy-500">Loading projects…</div>;
  }

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-navy-900 font-[family-name:var(--font-league-spartan)]">
          My projects
        </h1>
        <p className="text-sm text-navy-500 mt-1 max-w-xl">
          Add yourself to the projects you work on. You can log time against a project as soon as
          you add it; your reporting manager reviews your allocations.
        </p>
      </div>

      {/* ── Stats strip ───────────────────────────────────────────── */}
      <div className="flex gap-6 flex-wrap items-center">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-navy-500 font-semibold">Allocated to</p>
          <p className="text-2xl font-bold text-navy-900">{allocatedCount}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-navy-500 font-semibold">Total Allocation</p>
          <div className="flex items-center gap-2">
            <p className={cn("text-2xl font-bold", totalAllocationPct > 100 ? "text-blue-600" : "text-navy-900")}>
              {totalAllocationPct}%
            </p>
            {totalAllocationPct > 100 ? (
              <span className="text-[10px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                Multi-Project (&gt;100%)
              </span>
            ) : totalAllocationPct > 0 ? (
              <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                Active
              </span>
            ) : null}
          </div>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-navy-500 font-semibold">Projects available</p>
          <p className="text-2xl font-bold text-navy-900">{joinable.length}</p>
        </div>
      </div>

      {loadError && (
        <div role="alert" className="bg-red-600/5 border border-red-600/20 text-red-600 text-sm rounded-lg px-4 py-3">
          {loadError}
        </div>
      )}
      {notice && (
        <div role="status" className="bg-emerald-500/5 border border-emerald-500/20 text-emerald-700 text-sm rounded-lg px-4 py-3">
          {notice}
        </div>
      )}

      {/* ── Add a project ─────────────────────────────────────────── */}
      <section
        className="rounded-2xl border border-navy-900/10 bg-white px-5 py-4 shadow-xs"
        data-guide="my-projects:picker"
      >
        <h2 className="text-sm font-semibold text-navy-900">Add a project</h2>
        <p className="text-xs text-navy-500 mt-0.5">
          Search by project name, code, customer or sales order number.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start">
          <Combobox
            options={pickerOptions}
            value={pickedId}
            onChange={setPickedId}
            placeholder={
              joinable.length === 0
                ? "You're on every open project"
                : `Choose from ${joinable.length} project${joinable.length === 1 ? "" : "s"}…`
            }
            searchPlaceholder="Project, code, customer or SO number…"
            searchThreshold={0}
            disabled={joinable.length === 0}
            fieldClassName="min-w-0 flex-1"
          />
          <Button
            onClick={() => picked && openForm(picked, "add")}
            disabled={!picked}
            className="shrink-0"
          >
            Add to my projects
          </Button>
        </div>
        {picked && (
          <p className="mt-2 text-[11.5px] text-navy-500">
            <span className="font-mono">{picked.code}</span>
            {picked.clientName && <> · {picked.clientName}</>}
            {picked.salesOrderRef && <> · SO {picked.salesOrderRef}</>}
            {" · "}
            <span className="capitalize">{picked.status.replace("_", " ")}</span>
            {picked.startDate && <> · from {picked.startDate}</>}
          </p>
        )}
      </section>

      {/* ── Add / edit modal ──────────────────────────────────────── */}
      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-900/40 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-neutral-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-neutral-100 bg-neutral-50/60">
              <h2 className="text-sm font-semibold text-navy-900">
                {form.mode === "add" ? "Add yourself to this project" : "Change your allocation"}
              </h2>
              <p className="text-xs text-navy-700 mt-0.5 truncate font-medium">{form.projectName}</p>
              {form.projectMeta && (
                <p className="text-[11px] text-navy-400 mt-0.5 truncate">{form.projectMeta}</p>
              )}
            </div>
            <div className="px-6 py-5 space-y-4">
              {formError && (
                <div role="alert" className="bg-red-600/5 border border-red-600/20 text-red-600 text-xs rounded-lg px-3 py-2">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-navy-700 mb-1.5">
                  Your role on this project
                </label>
                <select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                  className="w-full px-3 py-2 border border-navy-500/20 rounded-xl text-sm focus:ring-2 focus:ring-navy-900 focus:outline-none bg-white"
                >
                  <option value="">— Select a role —</option>
                  {/* Someone already made PM by an admin keeps seeing it. */}
                  {selectedRole && !roles.includes(selectedRole) && (
                    <option value={selectedRole}>{selectedRole}</option>
                  )}
                  {roles.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <p className="mt-1 text-[11px] text-navy-500">
                  Developer or Team Lead. A PM is set by an administrator or the project&apos;s PMs.
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-navy-700">
                    Allocation <span className="font-normal text-navy-400">(% of your time)</span>
                  </label>
                  <span className="text-[11px] text-navy-400">Total can exceed 100%</span>
                </div>

                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={10}
                    max={200}
                    step={5}
                    value={allocationPct}
                    onChange={(e) => setAllocationPct(Number(e.target.value))}
                    className="flex-1 accent-navy-900"
                  />
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={5}
                      max={500}
                      value={allocationPct}
                      onChange={(e) => setAllocationPct(Math.max(5, Math.min(500, Number(e.target.value) || 0)))}
                      className="w-16 px-2 py-1 border border-navy-500/20 rounded-lg text-sm text-right font-semibold text-navy-900 focus:outline-none focus:ring-1 focus:ring-navy-900"
                    />
                    <span className="text-sm font-semibold text-navy-700">%</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  {[25, 50, 75, 100, 120, 150, 200].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setAllocationPct(pct)}
                      className={cn(
                        "px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer",
                        allocationPct === pct
                          ? "bg-navy-900 text-white font-semibold"
                          : "bg-navy-900/5 text-navy-700 hover:bg-navy-900/10"
                      )}
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-navy-500 mt-1.5">
                  You can be on several projects at once, and the total across them can be above 100%.
                </p>
              </div>

              {form.mode === "add" && (
                <div>
                  <label className="block text-xs font-semibold text-navy-700 mb-1.5">
                    Note for your manager <span className="font-normal text-navy-400">(optional)</span>
                  </label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Who asked you to join, what you're doing on it…"
                    className="w-full px-3 py-2 border border-navy-500/20 rounded-xl text-sm resize-none focus:ring-2 focus:ring-navy-900 focus:outline-none"
                  />
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-neutral-100 flex justify-end gap-2.5">
              <button
                onClick={closeForm}
                disabled={submitting}
                className="px-4 py-2 text-xs font-semibold text-navy-700 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <Button onClick={submitForm} loading={submitting}>
                {form.mode === "add" ? "Add project" : "Save"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Leave confirmation ────────────────────────────────────── */}
      {leaving && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-900/40 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-neutral-200 overflow-hidden">
            <div className="px-6 py-5 space-y-2">
              <h2 className="text-sm font-semibold text-navy-900">Remove this project?</h2>
              <p className="text-xs text-navy-600 leading-relaxed">
                <span className="font-medium">{leaving.name}</span> will leave your timesheet. Hours you have
                already logged against it are kept. You can add it again later.
              </p>
            </div>
            <div className="px-6 py-4 border-t border-neutral-100 flex justify-end gap-2.5">
              <button
                onClick={() => setLeaving(null)}
                disabled={leaveBusy}
                className="px-4 py-2 text-xs font-semibold text-navy-700 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
              >
                Keep it
              </button>
              <Button variant="destructive" onClick={confirmLeave} loading={leaveBusy}>
                Remove
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Your projects ─────────────────────────────────────────── */}
      <h2 className="text-sm font-semibold text-navy-900 -mb-2">Your projects</h2>
      {mine.length === 0 ? (
        <Card>
          <div className="p-12 text-center">
            <p className="text-sm font-medium text-navy-700">You are not on any projects yet.</p>
            <p className="text-xs text-navy-500 mt-1">
              Pick one above and add it. It shows up here and in your timesheet straight away.
            </p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {mine.map((p) => {
            const isAllocated = Boolean(p.myAllocation);
            const pending = isLegacyPending(p);
            const removed = wasRemoved(p);

            return (
              <div
                key={p.id}
                className={cn(
                  "rounded-2xl border bg-white shadow-xs transition-shadow hover:shadow-md flex flex-col",
                  isAllocated
                    ? "border-emerald-200 ring-1 ring-emerald-100"
                    : pending
                      ? "border-amber-200"
                      : "border-neutral-200"
                )}
              >
                <div className="px-5 py-4 flex-1">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="font-mono text-[10px] text-navy-400 bg-navy-900/5 px-2 py-0.5 rounded-full">
                      {p.code}
                    </span>
                    <span className={cn(
                      "text-[10px] font-semibold px-2 py-0.5 rounded-full",
                      PROJECT_STATUS_BADGE[p.status] ?? "bg-neutral-100 text-navy-500"
                    )}>
                      {p.status.replace("_", " ")}
                    </span>
                  </div>

                  <h3 className="text-sm font-semibold text-navy-900 leading-snug">{p.name}</h3>
                  {(p.clientName || p.salesOrderRef) && (
                    <p className="text-[11px] text-navy-500 mt-0.5 truncate">
                      {[p.clientName, p.salesOrderRef && `SO ${p.salesOrderRef}`].filter(Boolean).join(" · ")}
                    </p>
                  )}

                  {(p.startDate || p.plannedEndDate) && (
                    <p className="text-[11px] text-navy-400 mt-1">
                      {p.startDate ?? "?"} → {p.plannedEndDate ?? "?"}
                    </p>
                  )}

                  {isAllocated && (
                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-0.5">
                        <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
                          <path fillRule="evenodd" d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
                        </svg>
                        {p.myAllocation!.allocationPercent}%
                      </span>
                      {p.myAllocation!.role && (
                        <span className="text-[11px] text-navy-500">{p.myAllocation!.role}</span>
                      )}
                      {p.myRequest?.status === "reviewed" && (
                        <span className="text-[10.5px] text-navy-400">· Reviewed by manager</span>
                      )}
                    </div>
                  )}

                  {pending && (
                    <p className="mt-3 text-[11px] text-amber-700">
                      You asked to join this before self-service. Add it above to be on it now.
                    </p>
                  )}

                  {removed && (
                    <p className="mt-3 text-[11px] text-red-600">
                      Your manager took you off this project
                      {p.myRequest?.reviewNotes ? <> — {p.myRequest.reviewNotes}</> : "."}
                    </p>
                  )}
                </div>

                <div className="px-5 py-3 border-t border-neutral-100 flex items-center gap-4">
                  {isAllocated ? (
                    <>
                      <a
                        href="/my-timesheet"
                        className="text-[12px] font-semibold text-navy-900 hover:text-navy-600 transition-colors"
                      >
                        Log time →
                      </a>
                      <button
                        onClick={() => openForm(p, "edit")}
                        className="text-[12px] font-medium text-navy-500 hover:text-navy-900 transition-colors cursor-pointer"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setLeaving(p)}
                        className="ml-auto text-[12px] font-medium text-navy-400 hover:text-red-600 transition-colors cursor-pointer"
                      >
                        Remove
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => openForm(p, "add")}
                      className="text-[12px] font-semibold text-navy-900 hover:text-navy-600 transition-colors cursor-pointer"
                    >
                      {removed ? "Add again →" : "Add now →"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
