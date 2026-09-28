"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

// ═══════════════════════════════════════════════════════════════
// Everything allotted to one person, across every project.
//
// Delivery work does not respect project boundaries: somebody on three
// projects should not have to open three pages to find out what they
// owe this week. Progress can be moved from here without leaving.
// ═══════════════════════════════════════════════════════════════

const STATUS_LABEL: Record<string, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  blocked: "Blocked",
  completed: "Completed",
};

interface Task {
  id: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  wbsItemId: string;
  wbsCode: string | null;
  wbsName: string;
  plannedHours: number | null;
  progressPercent: number;
  status: string;
  startDate: string | null;
  dueDate: string | null;
  notes: string | null;
  daysRemaining: number | null;
  overdue: boolean;
}

interface Summary {
  total: number;
  open: number;
  overdue: number;
  dueThisWeek: number;
  plannedHours: number;
  projects: number;
}

export function MyTasksClient({ userName }: { userName: string }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [groupBy, setGroupBy] = useState<"due" | "project">("due");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/pmt/my-tasks?includeCompleted=${showCompleted}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not load your tasks.");
        return;
      }
      setTasks(data.tasks ?? []);
      setSummary(data.summary ?? null);
      setError("");
    } finally {
      setLoading(false);
    }
  }, [showCompleted]);

  useEffect(() => {
    void load();
  }, [load]);

  const update = async (task: Task, patch: Record<string, unknown>) => {
    setBusy(task.id);
    setError("");

    // Optimistic: a slider that lags behind the thumb feels broken.
    const before = tasks;
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, ...patch } as Task : t)));

    try {
      const res = await fetch("/api/pmt/my-tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignmentId: task.id, ...patch }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setTasks(before);
        setError((data.errors ?? [data.error]).filter(Boolean).join(" ") || "Not saved.");
        return;
      }
      await load();
    } finally {
      setBusy(null);
    }
  };

  const grouped = useMemo(() => {
    if (groupBy === "project") {
      const map = new Map<string, Task[]>();
      for (const task of tasks) {
        const key = `${task.projectCode} · ${task.projectName}`;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(task);
      }
      return [...map.entries()];
    }

    const buckets: Record<string, Task[]> = {
      Overdue: [],
      "This week": [],
      Later: [],
      "No date": [],
      Done: [],
    };
    for (const task of tasks) {
      if (task.status === "completed") buckets.Done.push(task);
      else if (task.overdue) buckets.Overdue.push(task);
      else if (task.daysRemaining === null) buckets["No date"].push(task);
      else if (task.daysRemaining <= 7) buckets["This week"].push(task);
      else buckets.Later.push(task);
    }
    return Object.entries(buckets).filter(([, list]) => list.length > 0);
  }, [tasks, groupBy]);

  if (loading) {
    return <div className="p-8 text-center text-sm text-navy-500">Loading your tasks…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-navy-900 font-[family-name:var(--font-league-spartan)]">
            My tasks
          </h1>
          <p className="text-sm text-navy-500 mt-1">
            Everything allotted to {userName.split(" ")[0]}, across every project.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-neutral-200 overflow-hidden">
            {(["due", "project"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setGroupBy(mode)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                  groupBy === mode
                    ? "bg-navy-900 text-white"
                    : "bg-white text-navy-700 hover:bg-neutral-50"
                }`}
              >
                By {mode === "due" ? "when" : "project"}
              </button>
            ))}
          </div>
          <label className="text-xs text-navy-500 flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={showCompleted}
              onChange={(e) => setShowCompleted(e.target.checked)}
            />
            show finished
          </label>
        </div>
      </div>

      {summary && (
        <div className="flex gap-6 flex-wrap">
          <Stat label="Open" value={String(summary.open)} />
          <Stat label="Overdue" value={String(summary.overdue)} warn={summary.overdue > 0} />
          <Stat label="Due this week" value={String(summary.dueThisWeek)} />
          <Stat label="Hours planned" value={`${summary.plannedHours}h`} />
          <Stat label="Projects" value={String(summary.projects)} />
        </div>
      )}

      {error && (
        <div role="alert" className="bg-red-600/5 border border-red-600/20 text-red-600 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {tasks.length === 0 ? (
        <Card>
          <div className="p-12 text-center">
            <p className="text-sm font-medium text-navy-700">Nothing is allotted to you.</p>
            <p className="text-xs text-navy-500 mt-1.5 max-w-sm mx-auto">
              When a project manager gives you a work package it appears here, with what is due and
              when.
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-5">
          {grouped.map(([group, list]) => (
            <div key={group}>
              <p className="text-[10px] uppercase tracking-wider text-navy-500 font-semibold mb-2">
                {group}
                <span className="ml-1.5 text-navy-500/60">({list.length})</span>
              </p>
              <Card>
                <div className="divide-y divide-neutral-100">
                  {list.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      busy={busy === task.id}
                      onUpdate={(patch) => update(task, patch)}
                    />
                  ))}
                </div>
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-navy-500 font-semibold">{label}</p>
      <p className={`text-xl font-bold ${warn ? "text-red-600" : "text-navy-900"}`}>{value}</p>
    </div>
  );
}

function TaskRow({
  task,
  busy,
  onUpdate,
}: {
  task: Task;
  busy: boolean;
  onUpdate: (patch: Record<string, unknown>) => void;
}) {
  const due =
    task.daysRemaining === null
      ? "no due date"
      : task.daysRemaining < 0
        ? `${Math.abs(task.daysRemaining)} day${Math.abs(task.daysRemaining) === 1 ? "" : "s"} late`
        : task.daysRemaining === 0
          ? "due today"
          : `${task.daysRemaining} day${task.daysRemaining === 1 ? "" : "s"} left`;

  return (
    <div className={`px-5 py-4 ${task.status === "completed" ? "bg-neutral-50/60" : ""}`}>
      <div className="flex items-start gap-4 flex-wrap">
        <div className="min-w-[240px] flex-1">
          <p className="text-sm font-medium text-navy-900">
            {task.wbsCode && (
              <span className="font-mono text-[10px] text-navy-500 mr-1.5">{task.wbsCode}</span>
            )}
            {task.wbsName}
          </p>
          <p className="text-[11px] text-navy-500">
            <Link href={`/pmt/${task.projectCode}`} className="underline hover:text-navy-700">
              {task.projectCode}
            </Link>{" "}
            {task.projectName}
            {task.plannedHours !== null && ` · ${task.plannedHours}h planned`}
          </p>
        </div>

        <div className="min-w-[110px]">
          <p
            className={`text-xs font-medium ${
              task.overdue ? "text-red-600" : task.daysRemaining === null ? "text-navy-500" : "text-navy-700"
            }`}
          >
            {due}
          </p>
          {task.dueDate && <p className="text-[10px] text-navy-500">{task.dueDate}</p>}
        </div>

        <div className="flex-1 min-w-[180px]">
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            defaultValue={task.progressPercent}
            disabled={busy}
            onMouseUp={(e) =>
              onUpdate({ progressPercent: Number((e.target as HTMLInputElement).value) })
            }
            onTouchEnd={(e) =>
              onUpdate({ progressPercent: Number((e.target as HTMLInputElement).value) })
            }
            className="w-full cursor-pointer"
          />
          <p className="text-[10px] text-navy-500 mt-0.5">
            {task.progressPercent}%{busy && " · saving…"}
          </p>
        </div>

        <select
          value={task.status}
          disabled={busy}
          onChange={(e) => onUpdate({ status: e.target.value })}
          className="text-xs border border-neutral-200 rounded-lg px-2.5 py-1.5 bg-white cursor-pointer"
        >
          {Object.entries(STATUS_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        {task.status !== "completed" && (
          <Button variant="secondary" onClick={() => onUpdate({ status: "completed" })} disabled={busy}>
            Done
          </Button>
        )}
      </div>
    </div>
  );
}
