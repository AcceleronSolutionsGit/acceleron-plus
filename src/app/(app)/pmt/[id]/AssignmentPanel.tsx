"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";

// ═══════════════════════════════════════════════════════════════
// Who is doing this work package.
//
// Opened from a row in the work breakdown. A package can be shared,
// each person carrying their own hours and their own progress, and the
// package's percentage is the weighted sum of theirs — which is why
// nobody types it directly any more.
// ═══════════════════════════════════════════════════════════════

/** Postgres hands numerics back as "420.00"; nobody wants to read that. */
const hours = (value: number | null | undefined) =>
  value === null || value === undefined ? "—" : String(Math.round(Number(value) * 100) / 100);

const STATUS_LABEL: Record<string, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  blocked: "Blocked",
  completed: "Completed",
};

const STATUS_STYLE: Record<string, string> = {
  not_started: "bg-navy-500/10 text-navy-700",
  in_progress: "bg-blue-500/10 text-blue-700",
  blocked: "bg-red-600/10 text-red-600",
  completed: "bg-emerald-500/10 text-emerald-700",
};

interface Assignment {
  id: string;
  userId: string;
  userName: string | null;
  plannedHours: number | null;
  loggedHours: number;
  progressPercent: number;
  status: string;
  startDate: string | null;
  dueDate: string | null;
  notes: string | null;
  isMine: boolean;
  canUpdate: boolean;
}

interface TeamMember {
  id: string;
  userName: string | null;
  roleInProject: string | null;
  designation: string | null;
  skills: { id: string; name: string; proficiency: number }[];
}

export function AssignmentPanel({
  projectId,
  wbsItemId,
  wbsName,
  estimatedHours,
  onClose,
  onChanged,
}: {
  projectId: string;
  wbsItemId: string;
  wbsName: string;
  estimatedHours: number | null;
  onClose: () => void;
  onChanged?: (rollup: { progressPercent: number; assignedHours: number } | null) => void;
}) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [canAssign, setCanAssign] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const [pickMember, setPickMember] = useState("");
  const [pickHours, setPickHours] = useState("");

  const load = useCallback(async () => {
    try {
      const [aRes, tRes] = await Promise.all([
        fetch(`/api/pmt/projects/${projectId}/wbs/${wbsItemId}/assignments`),
        fetch(`/api/pmt/projects/${projectId}/team`),
      ]);
      const aData = await aRes.json().catch(() => ({}));
      const tData = await tRes.json().catch(() => ({}));

      if (!aRes.ok) {
        setError(aData.error || "Could not load the assignments.");
        return;
      }
      setAssignments(aData.assignments ?? []);
      setCanAssign(Boolean(aData.canAssign));
      setTeam(tData.team ?? []);
      setError("");
    } finally {
      setLoading(false);
    }
  }, [projectId, wbsItemId]);

  useEffect(() => {
    void load();
  }, [load]);

  const assignedHours = assignments.reduce((sum, a) => sum + (a.plannedHours ?? 0), 0);
  const unassigned = team.filter((m) => !assignments.some((a) => a.userName === m.userName));

  const assign = async () => {
    if (!pickMember) return;
    setBusy("new");
    setError("");
    setWarning("");
    try {
      const res = await fetch(`/api/pmt/projects/${projectId}/wbs/${wbsItemId}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamMemberId: pickMember,
          plannedHours: pickHours === "" ? null : Number(pickHours),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data.errors ?? [data.error]).filter(Boolean).join(" ") || "Could not allot it.");
        return;
      }
      if (data.warning) setWarning(data.warning);
      setPickMember("");
      setPickHours("");
      onChanged?.(data.rollup ?? null);
      await load();
    } finally {
      setBusy(null);
    }
  };

  const update = async (assignment: Assignment, patch: Record<string, unknown>) => {
    setBusy(assignment.id);
    setError("");
    try {
      const res = await fetch(
        `/api/pmt/projects/${projectId}/wbs/${wbsItemId}/assignments/${assignment.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data.errors ?? [data.error]).filter(Boolean).join(" ") || "Not saved.");
        return;
      }
      onChanged?.(data.rollup ?? null);
      await load();
    } finally {
      setBusy(null);
    }
  };

  const unassign = async (assignment: Assignment) => {
    if (!window.confirm(`Take this work back from ${assignment.userName}?`)) return;
    setBusy(assignment.id);
    try {
      const res = await fetch(
        `/api/pmt/projects/${projectId}/wbs/${wbsItemId}/assignments/${assignment.id}`,
        { method: "DELETE" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not unassign.");
        return;
      }
      onChanged?.(data.rollup ?? null);
      await load();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/40 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-3xl max-h-[88vh] overflow-y-auto rounded-xl shadow-2xl">
        <div className="px-6 py-4 border-b border-neutral-100 flex items-start justify-between gap-4 sticky top-0 bg-white z-10">
          <div>
            <h3 className="text-lg font-bold text-navy-900 font-[family-name:var(--font-league-spartan)]">
              Who is doing this
            </h3>
            <p className="text-xs text-navy-500 mt-0.5">{wbsName}</p>
          </div>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="p-6 space-y-4">
          {/* Hours against the estimate */}
          <div className="flex gap-6 flex-wrap">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-navy-500 font-semibold">
                People
              </p>
              <p className="text-lg font-bold text-navy-900">{assignments.length}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-navy-500 font-semibold">
                Hours allotted
              </p>
              <p
                className={`text-lg font-bold ${
                  estimatedHours && assignedHours > estimatedHours
                    ? "text-amber-700"
                    : "text-navy-900"
                }`}
              >
                {hours(assignedHours)}
                {estimatedHours ? (
                  <span className="text-navy-500 text-sm font-normal"> of {hours(estimatedHours)}</span>
                ) : null}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-navy-500 font-semibold">
                Package progress
              </p>
              <p className="text-lg font-bold text-navy-900">
                {assignments.length === 0
                  ? "—"
                  : `${Math.round(
                      assignedHours > 0
                        ? assignments.reduce(
                            (s, a) => s + a.progressPercent * (a.plannedHours ?? 0),
                            0
                          ) / assignedHours
                        : assignments.reduce((s, a) => s + a.progressPercent, 0) /
                            assignments.length
                    )}%`}
              </p>
              <p className="text-[10px] text-navy-500">weighted by hours</p>
            </div>
          </div>

          {warning && (
            <div className="bg-amber-500/5 border border-amber-500/30 text-amber-800 text-sm rounded-lg px-4 py-3">
              {warning}
            </div>
          )}
          {error && (
            <div role="alert" className="bg-red-600/5 border border-red-600/20 text-red-600 text-sm rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          {/* The people on it */}
          {loading ? (
            <p className="text-sm text-navy-500">Loading…</p>
          ) : assignments.length === 0 ? (
            <p className="text-sm text-navy-500 py-4">
              Nobody has this work package yet.{" "}
              {canAssign
                ? "Allot it below and its progress will follow whoever is doing it."
                : "A project manager allots the work."}
            </p>
          ) : (
            <div className="space-y-2">
              {assignments.map((a) => (
                <div
                  key={a.id}
                  className={`rounded-lg border px-4 py-3 ${
                    a.isMine ? "border-navy-700/30 bg-navy-900/[0.03]" : "border-neutral-200"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-[150px]">
                      <p className="text-sm font-medium text-navy-900">
                        {a.userName}
                        {a.isMine && (
                          <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-navy-900 text-white">
                            you
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-navy-500">
                        {hours(a.plannedHours)}h planned
                        {a.dueDate && ` · due ${a.dueDate}`}
                      </p>
                    </div>

                    <span
                      className={`text-[10px] font-medium px-2 py-1 rounded ${
                        STATUS_STYLE[a.status] ?? STATUS_STYLE.not_started
                      }`}
                    >
                      {STATUS_LABEL[a.status] ?? a.status}
                    </span>

                    <div className="flex-1 min-w-[160px]">
                      <div className="h-1.5 rounded-full bg-neutral-100 overflow-hidden">
                        <div
                          className={a.status === "blocked" ? "bg-red-600 h-full" : "bg-navy-700 h-full"}
                          style={{ width: `${a.progressPercent}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-navy-500 mt-1">{a.progressPercent}%</p>
                    </div>

                    {canAssign && (
                      <button
                        onClick={() => unassign(a)}
                        disabled={busy === a.id}
                        className="text-[11px] text-red-600 underline cursor-pointer disabled:opacity-40"
                      >
                        unassign
                      </button>
                    )}
                  </div>

                  {a.canUpdate && (
                    <div className="mt-3 flex items-center gap-3 flex-wrap">
                      <label className="text-[11px] text-navy-500 flex items-center gap-1.5">
                        progress
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={5}
                          defaultValue={a.progressPercent}
                          onMouseUp={(e) =>
                            update(a, { progressPercent: Number((e.target as HTMLInputElement).value) })
                          }
                          onTouchEnd={(e) =>
                            update(a, { progressPercent: Number((e.target as HTMLInputElement).value) })
                          }
                          className="w-36 cursor-pointer"
                        />
                      </label>

                      <select
                        value={a.status}
                        onChange={(e) => update(a, { status: e.target.value })}
                        disabled={busy === a.id}
                        className="text-xs border border-neutral-200 rounded px-2 py-1 bg-white cursor-pointer"
                      >
                        {Object.entries(STATUS_LABEL).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>

                      {busy === a.id && <span className="text-[11px] text-navy-500">saving…</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Allot it */}
          {canAssign && (
            <div className="border-t border-neutral-100 pt-4">
              <p className="text-[10px] uppercase tracking-wider text-navy-500 font-semibold mb-2">
                Allot to somebody
              </p>
              {unassigned.length === 0 ? (
                <p className="text-xs text-navy-500">
                  Everybody on the team already has this package. Add more people under{" "}
                  <span className="font-medium">Team &amp; Resources</span>.
                </p>
              ) : (
                <div className="flex gap-2 flex-wrap items-end">
                  <div className="flex-1 min-w-[220px]">
                    <select
                      value={pickMember}
                      onChange={(e) => setPickMember(e.target.value)}
                      className="w-full px-3 py-2.5 text-sm rounded-lg border border-navy-500/30 bg-white"
                    >
                      <option value="">Choose from the project team…</option>
                      {unassigned.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.userName}
                          {m.roleInProject ? ` — ${m.roleInProject}` : ""}
                          {m.skills.length > 0
                            ? ` (${m.skills.slice(0, 3).map((s) => s.name).join(", ")})`
                            : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="w-28">
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={pickHours}
                      onChange={(e) => setPickHours(e.target.value)}
                      placeholder="hours"
                      className="w-full px-3 py-2.5 text-sm rounded-lg border border-navy-500/30"
                    />
                  </div>
                  <Button onClick={assign} disabled={!pickMember || busy === "new"}>
                    {busy === "new" ? "Allotting…" : "Allot"}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
