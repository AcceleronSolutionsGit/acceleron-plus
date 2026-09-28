"use client";

// ═══════════════════════════════════════════════════════════════
// "Auto-sync" beside "Sync with Darwinbox" on Master Data.
//
// The button shows the state at a glance (off / "Daily at 07:00" / a
// spinner while a sync runs). It opens a panel to switch auto-sync on,
// choose how often, and see the last few syncs — manual and automatic —
// with what each one did.
// ═══════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import {
  AUTOSYNC_FREQUENCIES,
  describeSchedule,
  type AutosyncFrequency,
} from "@/lib/darwinbox-schedule";

interface SyncRun {
  id: string;
  trigger: "manual" | "auto";
  startedAt: string;
  finishedAt: string | null;
  success: boolean | null;
  message: string | null;
}

interface Overview {
  settings: { enabled: boolean; frequency: AutosyncFrequency; dailyHour: number };
  running: boolean;
  nextRunAt: string | null;
  lastRun: SyncRun | null;
  recentRuns: SyncRun[];
}

const when = (value: string | null) =>
  value
    ? new Date(value).toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Kolkata",
      })
    : "—";

const HOURS = Array.from({ length: 24 }, (_, h) => h);

export function DarwinboxAutosync({ refreshKey = 0 }: { refreshKey?: number }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loadError, setLoadError] = useState("");
  const [open, setOpen] = useState(false);

  // Form state, copied from the overview when the panel opens.
  const [enabled, setEnabled] = useState(false);
  const [frequency, setFrequency] = useState<AutosyncFrequency>("daily");
  const [dailyHour, setDailyHour] = useState(2);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/darwinbox-autosync");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadError(data.error || "Could not load auto-sync settings.");
        return;
      }
      setOverview(data as Overview);
      setLoadError("");
    } catch {
      setLoadError("Could not reach the server.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  // While a sync is running, check back until it finishes.
  useEffect(() => {
    if (!overview?.running) return;
    const t = setTimeout(() => void load(), 5000);
    return () => clearTimeout(t);
  }, [overview, load]);

  const openPanel = () => {
    if (overview) {
      setEnabled(overview.settings.enabled);
      setFrequency(overview.settings.frequency);
      setDailyHour(overview.settings.dailyHour);
    }
    setSaveError("");
    setOpen(true);
    void load();
  };

  const save = async () => {
    setSaving(true);
    setSaveError("");
    try {
      const res = await fetch("/api/admin/darwinbox-autosync", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, frequency, dailyHour }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveError(
          (Array.isArray(data.details) ? data.details.map((d: { message?: string }) => d.message).join(" ") : "") ||
            data.error ||
            "Could not save."
        );
        return;
      }
      setOverview(data as Overview);
      setOpen(false);
    } catch {
      setSaveError("Could not reach the server.");
    } finally {
      setSaving(false);
    }
  };

  const on = overview?.settings.enabled ?? false;
  const label = !overview
    ? loadError
      ? "Auto-sync unavailable"
      : "Auto-sync…"
    : overview.running
      ? "Syncing now…"
      : on
        ? `Auto-sync: ${describeSchedule(overview.settings)}`
        : "Auto-sync: Off";

  return (
    <>
      <button
        type="button"
        onClick={openPanel}
        title={loadError || (on ? `Next automatic sync: ${when(overview?.nextRunAt ?? null)}` : "Sync the employee master from Darwinbox automatically")}
        className={`flex items-center gap-2 px-3.5 py-2.5 text-sm font-medium rounded-xl border transition-colors cursor-pointer ${
          on
            ? "bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100"
            : "bg-white border-navy-500/15 text-navy-700 hover:bg-neutral-50"
        }`}
      >
        <span
          className={`w-2 h-2 rounded-full ${overview?.running ? "bg-blue-500 animate-pulse" : on ? "bg-emerald-500" : "bg-neutral-300"}`}
        />
        <span>{label}</span>
      </button>

      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Darwinbox auto-sync"
        description="Keep the employee master up to date without clicking Sync. Each run does exactly what the Sync with Darwinbox button does."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} loading={saving} disabled={saving || !overview}>
              Save
            </Button>
          </>
        }
      >
        {!overview ? (
          <p className="text-sm text-navy-500">{loadError || "Loading…"}</p>
        ) : (
          <div className="space-y-5">
            {/* On / off */}
            <label className="flex items-center justify-between gap-4 rounded-xl border border-neutral-200 px-4 py-3 cursor-pointer">
              <span>
                <span className="block text-sm font-semibold text-navy-900">Sync automatically</span>
                <span className="block text-xs text-navy-500">
                  {enabled ? "On — the schedule below applies." : "Off — only the Sync with Darwinbox button updates the master."}
                </span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                onClick={() => setEnabled((v) => !v)}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                  enabled ? "bg-emerald-500" : "bg-neutral-300"
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                    enabled ? "translate-x-5" : "translate-x-0.5"
                  }`}
                />
              </button>
            </label>

            {/* Schedule */}
            <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${enabled ? "" : "opacity-50 pointer-events-none"}`}>
              <div>
                <label className="block text-xs font-semibold text-navy-700 mb-1.5">How often</label>
                <select
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value as AutosyncFrequency)}
                  className="w-full text-sm rounded-lg border border-neutral-200 px-3 py-2 text-navy-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {(Object.keys(AUTOSYNC_FREQUENCIES) as AutosyncFrequency[]).map((f) => (
                    <option key={f} value={f}>
                      {AUTOSYNC_FREQUENCIES[f].label}
                    </option>
                  ))}
                </select>
              </div>
              {frequency === "daily" && (
                <div>
                  <label className="block text-xs font-semibold text-navy-700 mb-1.5">At (India time)</label>
                  <select
                    value={dailyHour}
                    onChange={(e) => setDailyHour(Number(e.target.value))}
                    className="w-full text-sm rounded-lg border border-neutral-200 px-3 py-2 text-navy-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {HOURS.map((h) => (
                      <option key={h} value={h}>
                        {String(h).padStart(2, "0")}:00
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {enabled && (
              <p className="text-xs text-navy-500">
                {overview.settings.enabled && overview.nextRunAt
                  ? `Next automatic sync: ${when(overview.nextRunAt)} (checked every 15 minutes).`
                  : "The first automatic sync follows the schedule from the moment you save — it won't run straight away. Use Sync with Darwinbox for an immediate one."}
              </p>
            )}

            {saveError && (
              <p role="alert" className="text-sm text-red-600">
                {saveError}
              </p>
            )}

            {/* History */}
            <div>
              <p className="text-xs font-semibold text-navy-700 mb-2">Recent syncs</p>
              {overview.recentRuns.length === 0 ? (
                <p className="text-sm text-navy-500">No syncs recorded yet.</p>
              ) : (
                <div className="rounded-xl border border-neutral-200 divide-y divide-neutral-100 max-h-64 overflow-y-auto">
                  {overview.recentRuns.map((r) => (
                    <div key={r.id} className="px-3 py-2.5 text-sm flex items-start gap-3">
                      <span
                        className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                          r.success === null ? "bg-blue-500 animate-pulse" : r.success ? "bg-emerald-500" : "bg-red-500"
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-navy-900">
                          <span className="font-medium">{when(r.startedAt)}</span>
                          <span className="ml-2 text-[11px] uppercase tracking-wide text-navy-500">
                            {r.trigger === "auto" ? "Automatic" : "Manual"}
                          </span>
                        </p>
                        <p className={`text-xs ${r.success === false ? "text-red-600" : "text-navy-500"} break-words`}>
                          {r.success === null ? "Running…" : r.message || "—"}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
