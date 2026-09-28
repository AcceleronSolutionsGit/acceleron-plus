"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

// ═══════════════════════════════════════════════════════════════
// What the project earns, against what its PM said it would.
//
// Three numbers that answer different questions: the target somebody
// committed to, what the staffing plan implies before anybody works,
// and what the hours logged so far have actually earned.
// ═══════════════════════════════════════════════════════════════

const rupees = (value: number | null | undefined) =>
  value === null || value === undefined
    ? "—"
    : `₹${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

const percent = (value: number | null | undefined) =>
  value === null || value === undefined ? "—" : `${value}%`;

interface Side {
  costInr: number;
  billableInr: number;
  marginInr: number;
  marginPercent: number | null;
  variancePoints: number | null;
  daysLogged?: number;
}

interface Margin {
  targetPercent: number | null;
  setAt: string | null;
  notes: string | null;
  planned: Side;
  actual: Side;
  budgetInr: number | null;
  headcount: number;
  belowTarget: boolean;
}

export function MarginPanel({ projectId }: { projectId: string }) {
  const [margin, setMargin] = useState<Margin | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [target, setTarget] = useState("");
  const [notes, setNotes] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/pmt/projects/${projectId}/margin`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not load the margin.");
        return;
      }
      setMargin(data.margin);
      setTarget(data.margin?.targetPercent === null ? "" : String(data.margin.targetPercent));
      setNotes(data.margin?.notes ?? "");
      setError("");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setBusy(true);
    setError("");
    setHint("");
    try {
      const res = await fetch(`/api/pmt/projects/${projectId}/margin`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set",
          targetMarginPercent: target === "" ? null : Number(target),
          notes,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data.errors ?? [data.error]).filter(Boolean).join(" ") || "Not saved.");
        return;
      }
      setMargin(data.margin);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  const reprice = async () => {
    if (
      !window.confirm(
        `This rewrites every team member's billable rate so the project hits ${target}%.\n\n` +
          "What each person costs is untouched — only what the client is charged changes.\n\nGo ahead?"
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    setHint("");
    try {
      const res = await fetch(`/api/pmt/projects/${projectId}/margin`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reprice", targetMarginPercent: Number(target) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data.errors ?? [data.error]).filter(Boolean).join(" ") || "Could not reprice.");
        return;
      }
      setMargin(data.margin);
      setHint(data.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <Card><div className="p-8 text-center text-sm text-navy-500">Loading margin…</div></Card>;
  }
  if (!margin) {
    return (
      <Card>
        <div className="p-6 text-sm text-red-600">{error || "No margin data."}</div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Target ────────────────────────────────────────────── */}
      <Card>
        <div className="px-5 py-4 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-navy-500 font-semibold">
              Target margin
            </p>
            {editing ? (
              <div className="flex items-end gap-2 mt-1.5 flex-wrap">
                <input
                  type="number"
                  step={0.5}
                  min={-99}
                  max={99}
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  placeholder="e.g. 35"
                  className="w-24 px-3 py-2 text-sm rounded-lg border border-navy-500/30"
                />
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Why this number (optional)"
                  className="flex-1 min-w-[220px] px-3 py-2 text-sm rounded-lg border border-navy-500/30"
                />
                <Button onClick={save} disabled={busy}>
                  {busy ? "Saving…" : "Save"}
                </Button>
                <Button variant="secondary" onClick={() => setEditing(false)} disabled={busy}>
                  Cancel
                </Button>
              </div>
            ) : (
              <>
                <p className="text-3xl font-bold text-navy-900 mt-0.5">
                  {percent(margin.targetPercent)}
                </p>
                {margin.notes && <p className="text-xs text-navy-500 mt-1">{margin.notes}</p>}
                {margin.targetPercent === null && (
                  <p className="text-xs text-navy-500 mt-1 max-w-sm">
                    No target set. Without one there is nothing to measure the plan against.
                  </p>
                )}
              </>
            )}
          </div>

          {!editing && (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setEditing(true)}>
                {margin.targetPercent === null ? "Set a target" : "Change target"}
              </Button>
              {margin.targetPercent !== null && (
                <Button onClick={reprice} disabled={busy}>
                  {busy ? "Pricing…" : "Price the team to it"}
                </Button>
              )}
            </div>
          )}
        </div>

        {hint && (
          <div className="mx-5 mb-4 bg-emerald-500/5 border border-emerald-500/20 text-emerald-700 text-sm rounded-lg px-4 py-3">
            {hint}
          </div>
        )}
        {error && (
          <div role="alert" className="mx-5 mb-4 bg-red-600/5 border border-red-600/20 text-red-600 text-sm rounded-lg px-4 py-3">
            {error}
          </div>
        )}
      </Card>

      {/* ── Planned vs actual ─────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <MarginSide
          title="Planned"
          subtitle={`What the staffing plan implies · ${margin.headcount} ${margin.headcount === 1 ? "person" : "people"}`}
          side={margin.planned}
          target={margin.targetPercent}
        />
        <MarginSide
          title="Actual"
          subtitle={
            (margin.actual.daysLogged ?? 0) > 0
              ? `From ${margin.actual.daysLogged} days logged so far`
              : "Nothing logged yet"
          }
          side={margin.actual}
          target={margin.targetPercent}
          muted={(margin.actual.daysLogged ?? 0) === 0}
        />
      </div>

      {margin.budgetInr !== null && (
        <Card>
          <div className="px-5 py-4 flex gap-8 flex-wrap items-center">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-navy-500 font-semibold">
                Project budget
              </p>
              <p className="text-lg font-bold text-navy-900">{rupees(margin.budgetInr)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-navy-500 font-semibold">
                Planned billable value
              </p>
              <p className="text-lg font-bold text-navy-900">{rupees(margin.planned.billableInr)}</p>
            </div>
            <p className="text-xs text-navy-500 flex-1 min-w-[200px]">
              {margin.planned.billableInr > margin.budgetInr
                ? "The staffing plan bills past the agreed budget. Either the budget moves or the plan does."
                : "The staffing plan sits inside the agreed budget."}
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}

function MarginSide({
  title,
  subtitle,
  side,
  target,
  muted,
}: {
  title: string;
  subtitle: string;
  side: Side;
  target: number | null;
  muted?: boolean;
}) {
  const variance = side.variancePoints;
  const short = variance !== null && variance < 0;

  return (
    <Card>
      <div className={`px-5 py-4 ${muted ? "opacity-60" : ""}`}>
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-navy-500 font-semibold">
              {title} margin
            </p>
            <p
              className={`text-3xl font-bold ${
                side.marginPercent === null
                  ? "text-navy-500"
                  : short
                    ? "text-red-600"
                    : "text-navy-900"
              }`}
            >
              {percent(side.marginPercent)}
            </p>
          </div>
          {variance !== null && (
            <span
              className={`text-xs font-medium px-2 py-1 rounded ${
                short ? "bg-red-600/10 text-red-600" : "bg-emerald-500/10 text-emerald-700"
              }`}
              title={`Against a ${target}% target`}
            >
              {variance > 0 ? "+" : ""}
              {variance} pts
            </span>
          )}
        </div>
        <p className="text-[11px] text-navy-500 mt-0.5">{subtitle}</p>

        <div className="mt-3 space-y-1 text-sm">
          <Line label="Billable" value={rupees(side.billableInr)} />
          <Line label="Cost" value={rupees(side.costInr)} />
          <Line
            label="Margin"
            value={rupees(side.marginInr)}
            bold
            negative={side.marginInr < 0}
          />
        </div>
      </div>
    </Card>
  );
}

function Line({
  label,
  value,
  bold,
  negative,
}: {
  label: string;
  value: string;
  bold?: boolean;
  negative?: boolean;
}) {
  return (
    <div className="flex justify-between border-t border-neutral-100 pt-1">
      <span className="text-navy-500">{label}</span>
      <span
        className={`${bold ? "font-bold" : "font-medium"} ${
          negative ? "text-red-600" : "text-navy-900"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
