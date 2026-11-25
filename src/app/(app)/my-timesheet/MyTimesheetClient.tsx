"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { todayISO, toISODate, parseISODate } from "@/lib/dates";
import { cn } from "@/lib/utils";

// ═══════════════════════════════════════════════════════════════
// A week of time, across every project somebody is allocated to.
//
// A grid rather than a form: the question "what did I do on Tuesday?"
// is answered by looking down a column, and the gaps are what people
// actually need to see.
// ═══════════════════════════════════════════════════════════════

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * "Last week" rather than "2026-09-14 – 2026-09-20".
 *
 * Back-dating a timesheet means moving between weeks repeatedly, and a
 * pair of ISO dates gives you nothing to hold on to — you have to read
 * and subtract to work out where you are. Near weeks get a name; far
 * ones get a count, which is the thing you are actually tracking when
 * you are three weeks behind.
 */
function describeWeek(weekStart: string, todayStr: string): string {
  const start = parseISODate(weekStart);
  const today = parseISODate(todayStr);
  if (!start || !today) return weekStart;

  const thisMonday = new Date(today);
  const dow = thisMonday.getDay();
  thisMonday.setDate(thisMonday.getDate() + (dow === 0 ? -6 : 1 - dow));
  thisMonday.setHours(0, 0, 0, 0);

  const weeks = Math.round((start.getTime() - thisMonday.getTime()) / (7 * 86400000));
  if (weeks === 0) return "This week";
  if (weeks === -1) return "Last week";
  if (weeks === 1) return "Next week";
  if (weeks < 0) return `${Math.abs(weeks)} weeks ago`;
  return `${weeks} weeks ahead`;
}

/** "15 – 21 Sept 2026", collapsing the month when both ends share it. */
function describeRange(days: string[]): string {
  if (days.length < 7) return "";
  const a = parseISODate(days[0]);
  const b = parseISODate(days[6]);
  if (!a || !b) return "";
  const month = (d: Date) => d.toLocaleDateString("en-IN", { month: "short" });
  const sameMonth = a.getMonth() === b.getMonth();
  const left = sameMonth ? String(a.getDate()) : `${a.getDate()} ${month(a)}`;
  return `${left} – ${b.getDate()} ${month(b)} ${b.getFullYear()}`;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

interface Task {
  id: string;
  code: string | null;
  name: string;
  plannedHours?: number | null;
  loggedHours?: number;
}

interface Project {
  id: string;
  code: string;
  name: string;
  roleInProject: string | null;
  allocationPercent: number;
  dailyAllocatedHours: number;
  weeklyAllocatedHours: number;
  plannedDays?: number | null;
  tasks: Task[];
}

interface Entry {
  id: string;
  projectId: string;
  wbsItemId: string | null;
  logDate: string;
  hours: number;
  activityType: string;
  status: string;
  notes: string | null;
  extraHoursReason?: string | null;
}

interface ExtraHourPromptState {
  project: Project;
  task: Task | null;
  day: string;
  hours: number;
  activityType?: string;
  existingReason: string;
  allocatedDaily: number;
  allocatedWeekly: number;
  isExceedingDaily: boolean;
  isExceedingWeekly: boolean;
}

export function MyTimesheetClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // The week being looked at lives in the URL. Without it a reload, a
  // back button or a shared link all snap to the current week — which
  // is exactly the wrong moment to lose your place when you are
  // working through a month of back-dated time.
  const anchorParam = searchParams.get("week");

  const [week, setWeek] = useState<string | null>(null);
  const [days, setDays] = useState<string[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [totals, setTotals] = useState<{ byDay: Record<string, number>; week: number } | null>(null);
  const [activityTypes, setActivityTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hint, setHint] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async (anchor?: string) => {
    try {
      const res = await fetch(`/api/pmt/my-timesheet${anchor ? `?week=${anchor}` : ""}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not load your timesheet.");
        return;
      }
      setWeek(data.weekStart);
      setDays(data.days ?? []);
      setProjects(data.projects ?? []);
      setEntries(data.entries ?? []);
      setTotals(data.totals ?? null);
      setActivityTypes(data.activityTypes ?? []);
      setError("");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void load(anchorParam ?? undefined);
  }, [load, anchorParam]);

  /** Change the week by changing the URL; the effect above reloads. */
  const goToWeek = useCallback(
    (anchor: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (anchor) params.set("week", anchor);
      else params.delete("week");
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  const shiftWeek = (weeks: number) => {
    if (!week) return;
    const d = parseISODate(week);
    if (!d) return;
    d.setDate(d.getDate() + weeks * 7);
    goToWeek(toISODate(d));
  };

  // One row per project/task combination somebody might book against.
  const rows = useMemo(() => {
    const out: { key: string; project: Project; task: Task | null }[] = [];
    for (const project of projects) {
      out.push({ key: `${project.id}:none`, project, task: null });
      for (const task of project.tasks) {
        if (!task.id) continue;
        out.push({ key: `${project.id}:${task.id}`, project, task });
      }
    }
    return out;
  }, [projects]);

  const find = (projectId: string, wbsItemId: string | null, day: string) =>
    entries.find(
      (e) => e.projectId === projectId && (e.wbsItemId ?? null) === wbsItemId && e.logDate === day
    );

  const [extraPrompt, setExtraPrompt] = useState<ExtraHourPromptState | null>(null);
  const [promptReason, setPromptReason] = useState("");

  const openExtraPrompt = (state: ExtraHourPromptState) => {
    setExtraPrompt(state);
    setPromptReason(state.existingReason || "");
  };

  const log = async (
    project: Project,
    task: Task | null,
    day: string,
    value: string,
    activityType?: string,
    extraHoursReason?: string | null
  ) => {
    const hours = value === "" ? 0 : Number(value);
    if (!Number.isFinite(hours) || hours < 0 || hours > 24) {
      setError("Hours must be between 0 and 24.");
      return;
    }
    const key = `${project.id}:${task?.id ?? "none"}:${day}`;
    setSaving(key);
    setError("");
    setHint("");
    try {
      const res = await fetch("/api/pmt/my-timesheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          wbsItemId: task?.id ?? null,
          logDate: day,
          hours,
          activityType: activityType ?? find(project.id, task?.id ?? null, day)?.activityType,
          extraHoursReason,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data.errors ?? [data.error]).filter(Boolean).join(" ") || "Not saved.");
        return;
      }
      await load(week ?? undefined);
    } finally {
      setSaving(null);
    }
  };

  const handleCellBlur = (
    project: Project,
    task: Task | null,
    day: string,
    nextVal: string
  ) => {
    const currentEntry = find(project.id, task?.id ?? null, day);
    const currentHours = currentEntry?.hours ?? 0;
    const nextHours = nextVal === "" ? 0 : Number(nextVal);
    if (String(nextHours) === String(currentHours)) return;

    if (!Number.isFinite(nextHours) || nextHours < 0 || nextHours > 24) {
      setError("Hours must be between 0 and 24.");
      return;
    }

    if (nextHours === 0) {
      void log(project, task, day, "0", undefined, null);
      return;
    }

    const dailyAlloc = project.dailyAllocatedHours ?? 8;
    const weeklyAlloc = project.weeklyAllocatedHours ?? 40;

    // Check row total across all days for this project/task
    const otherDaysHours = days
      .filter((d) => d !== day)
      .reduce((sum, d) => sum + (find(project.id, task?.id ?? null, d)?.hours ?? 0), 0);
    const newRowTotal = otherDaysHours + nextHours;

    const isExceedingDaily = nextHours > dailyAlloc;
    const isExceedingWeekly = newRowTotal > weeklyAlloc;

    if (isExceedingDaily || isExceedingWeekly) {
      if (!currentEntry?.extraHoursReason) {
        openExtraPrompt({
          project,
          task,
          day,
          hours: nextHours,
          activityType: currentEntry?.activityType,
          existingReason: "",
          allocatedDaily: dailyAlloc,
          allocatedWeekly: weeklyAlloc,
          isExceedingDaily,
          isExceedingWeekly,
        });
        return;
      }
    }

    void log(project, task, day, nextVal, undefined, currentEntry?.extraHoursReason ?? null);
  };

  const submitWeek = async () => {
    const draft = entries.filter((e) => e.status === "draft");
    if (draft.length === 0) {
      setHint("Nothing to submit — every entry this week is already in.");
      return;
    }

    // Enforce one-liner reason on any draft entry exceeding allocation
    const missingReason = draft.find((entry) => {
      const proj = projects.find((p) => p.id === entry.projectId);
      const dailyAlloc = proj?.dailyAllocatedHours ?? 8;
      const weeklyAlloc = proj?.weeklyAllocatedHours ?? 40;
      const isDailyExceeded = entry.hours > dailyAlloc;
      const projTotal = entries
        .filter((e) => e.projectId === entry.projectId)
        .reduce((sum, e) => sum + e.hours, 0);
      const isWeeklyExceeded = projTotal > weeklyAlloc;
      return (isDailyExceeded || isWeeklyExceeded) && !entry.extraHoursReason?.trim();
    });

    if (missingReason) {
      const proj = projects.find((p) => p.id === missingReason.projectId);
      if (proj) {
        const t = proj.tasks.find((tk) => tk.id === missingReason.wbsItemId) ?? null;
        openExtraPrompt({
          project: proj,
          task: t,
          day: missingReason.logDate,
          hours: missingReason.hours,
          activityType: missingReason.activityType,
          existingReason: "",
          allocatedDaily: proj.dailyAllocatedHours ?? 8,
          allocatedWeekly: proj.weeklyAllocatedHours ?? 40,
          isExceedingDaily: missingReason.hours > (proj.dailyAllocatedHours ?? 8),
          isExceedingWeekly: true,
        });
      }
      setError("Please write a one-liner to define what was being done in the extra hour(s) before submitting.");
      return;
    }

    if (!window.confirm(`Submit ${draft.length} entries for approval?`)) return;

    setSaving("week");
    try {
      for (const entry of draft) {
        await fetch("/api/pmt/my-timesheet", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId: entry.projectId,
            wbsItemId: entry.wbsItemId,
            logDate: entry.logDate,
            hours: entry.hours,
            activityType: entry.activityType,
            extraHoursReason: entry.extraHoursReason ?? null,
            submit: true,
          }),
        });
      }
      setHint(`Submitted ${draft.length} ${draft.length === 1 ? "entry" : "entries"}.`);
      await load(week ?? undefined);
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-sm text-navy-500">Loading your week…</div>;
  }

  const today = todayISO();
  const isThisWeek = days.length > 0 && days[0] <= today && today <= days[6];
  const weekName = week ? describeWeek(week, today) : "";
  const draftCount = entries.filter((e) => e.status === "draft").length;
  const submittedCount = entries.filter((e) => e.status === "submitted").length;
  const approvedCount = entries.filter((e) => e.status === "approved").length;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-navy-900 font-[family-name:var(--font-league-spartan)]">
            My timesheet
          </h1>
          <p className="text-sm text-navy-500 mt-1">
            Only the projects you are allocated to, and the work packages allotted to you.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Jump to any week at all, rather than clicking Previous
              eight times to reach something two months back. */}
          <input
            type="date"
            value={week ?? ""}
            onChange={(e) => e.target.value && goToWeek(e.target.value)}
            aria-label="Jump to the week containing this date"
            title="Jump to any week"
            className={cn(
              "h-9 rounded-lg border border-navy-900/14 bg-surface px-2.5 text-[13px] text-navy-700 shadow-xs",
              "transition-[border-color,box-shadow] duration-200",
              "hover:border-navy-900/25 focus:border-navy-700 focus:outline-none",
              "focus:shadow-[0_0_0_3px_rgb(33_47_96_/_0.12)]"
            )}
          />

          <div className="flex items-center rounded-lg border border-navy-900/12 bg-surface shadow-xs">
            <button
              onClick={() => shiftWeek(-1)}
              aria-label="The week before"
              className="cursor-pointer rounded-l-lg px-2.5 py-2 text-navy-500 transition-colors hover:bg-navy-900/6 hover:text-navy-900"
            >
              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="m9.5 4-4 4 4 4" />
              </svg>
            </button>

            <span className="min-w-[164px] border-x border-navy-900/10 px-3 py-1 text-center">
              <span className="block text-[13px] font-semibold leading-tight text-navy-900">
                {weekName}
              </span>
              <span className="block text-[11px] leading-tight text-navy-400">
                {describeRange(days)}
              </span>
            </span>

            <button
              onClick={() => shiftWeek(1)}
              aria-label="The week after"
              className="cursor-pointer rounded-r-lg px-2.5 py-2 text-navy-500 transition-colors hover:bg-navy-900/6 hover:text-navy-900"
            >
              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="m6.5 4 4 4-4 4" />
              </svg>
            </button>
          </div>

          {/* Only offered when it would do something. */}
          {!isThisWeek && (
            <Button variant="secondary" onClick={() => goToWeek(null)}>
              This week
            </Button>
          )}

          <Button
            data-guide="timesheet:submit"
            onClick={submitWeek}
            loading={saving === "week"}
            disabled={draftCount === 0}
            title={draftCount === 0 ? "Nothing in draft this week" : undefined}
          >
            {draftCount > 0 ? `Submit ${draftCount}` : "Submit week"}
          </Button>
        </div>
      </div>

      {totals && (
        <div className="flex gap-6 flex-wrap items-end">
          <div>
            {/* Follows the week being looked at. It said "This week"
                over somebody's back-dated total, which is the one
                number on the page you must not mislabel. */}
            <p className="text-[10px] uppercase tracking-wider text-navy-500 font-semibold">
              {weekName || "This week"} Logged
            </p>
            <div className="flex items-baseline gap-2">
              <p
                className={`text-xl font-bold ${
                  totals.week > (projects.reduce((s, p) => s + (p.weeklyAllocatedHours ?? 40), 0) || 40)
                    ? "text-amber-700"
                    : "text-navy-900"
                }`}
              >
                {totals.week}h
              </p>
              {projects.length > 0 && (
                <span className="text-xs text-navy-500">
                  / {round2(projects.reduce((s, p) => s + (p.weeklyAllocatedHours ?? 40), 0))}h allocated
                  {totals.week > round2(projects.reduce((s, p) => s + (p.weeklyAllocatedHours ?? 40), 0)) && (
                    <span className="ml-1.5 font-bold text-amber-700">
                      (+{round2(totals.week - round2(projects.reduce((s, p) => s + (p.weeklyAllocatedHours ?? 40), 0)))}h extra)
                    </span>
                  )}
                </span>
              )}
            </div>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-navy-500 font-semibold">
              Allocated Projects
            </p>
            <p className="text-xl font-bold text-navy-900">{projects.length}</p>
          </div>
        </div>
      )}

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

      {projects.length === 0 ? (
        <Card>
          <div className="p-12 text-center">
            <p className="text-sm font-medium text-navy-700">
              You are not allocated to any projects.
            </p>
            <p className="text-xs text-navy-500 mt-1.5 max-w-sm mx-auto">
              Time can only be booked against a project you are staffed on — that is what keeps the
              hours reconcilable. A project manager adds you under Team &amp; Resources.
            </p>
          </div>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b border-neutral-100">
                  <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider text-navy-500 font-semibold min-w-[240px]">
                    Project / work package
                  </th>
                  {days.map((day, i) => {
                    const isToday = day === today;
                    const isFuture = day > today;
                    const isWeekend = i >= 5;
                    return (
                      <th
                        key={day}
                        className={cn(
                          "w-20 px-2 py-2.5 text-[10px] font-semibold uppercase tracking-wider",
                          isToday && "bg-navy-900/[0.05] text-navy-900",
                          !isToday && isFuture && "text-navy-300",
                          !isToday && !isFuture && isWeekend && "bg-navy-900/[0.02] text-navy-400",
                          !isToday && !isFuture && !isWeekend && "text-navy-500"
                        )}
                      >
                        {DAY_NAMES[i]}
                        <span className="mt-0.5 block text-[10px] font-normal normal-case">
                          {isToday ? (
                            <span className="rounded-full bg-red-600 px-1.5 py-px font-semibold text-white">
                              today
                            </span>
                          ) : (
                            <span className={isFuture ? "text-navy-300" : "text-navy-400"}>
                              {day.slice(8)}/{day.slice(5, 7)}
                            </span>
                          )}
                        </span>
                      </th>
                    );
                  })}
                  <th className="px-3 py-2.5 text-[10px] uppercase tracking-wider text-navy-500 font-semibold w-24 text-center">
                    Total / Alloc
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {rows.map(({ key, project, task }) => {
                  const rowTotal = days.reduce(
                    (sum, day) => sum + (find(project.id, task?.id ?? null, day)?.hours ?? 0),
                    0
                  );
                  const weeklyAlloc = project.weeklyAllocatedHours ?? 40;
                  const isOverWeekly = rowTotal > weeklyAlloc;
                  return (
                    <tr key={key} className={task ? "" : "bg-neutral-50/40"}>
                      <td className="px-4 py-2">
                        {task ? (
                          <div className="pl-4">
                            <span className="text-sm text-navy-900">
                              {task.code && (
                                <span className="font-mono text-[10px] text-navy-500 mr-1.5">
                                  {task.code}
                                </span>
                              )}
                              {task.name}
                            </span>
                            {task.plannedHours != null && (
                              <span className="block text-[10px] text-navy-400 mt-0.5">
                                Planned: {task.plannedHours}h
                                {task.loggedHours != null ? ` · Logged: ${task.loggedHours}h` : ""}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div>
                            <span className="text-sm font-medium text-navy-900">
                              <span className="font-mono text-[10px] text-navy-500 mr-1.5">
                                {project.code}
                              </span>
                              {project.name}
                              <span className="text-[10px] text-navy-500 font-normal ml-1.5">
                                general
                              </span>
                            </span>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="inline-flex items-center text-[10px] font-semibold text-navy-600 bg-navy-100/80 px-1.5 py-0.5 rounded">
                                {project.allocationPercent}% · {weeklyAlloc}h/wk ({project.dailyAllocatedHours ?? 8}h/day)
                              </span>
                            </div>
                          </div>
                        )}
                      </td>

                      {days.map((day, i) => {
                        const entry = find(project.id, task?.id ?? null, day);
                        const locked = entry?.status === "approved";
                        const isFuture = day > today;
                        const isToday = day === today;
                        const isWeekend = i >= 5;
                        const cellKey = `${project.id}:${task?.id ?? "none"}:${day}`;
                        const dailyAlloc = project.dailyAllocatedHours ?? 8;
                        const isDailyExtra = (entry?.hours ?? 0) > dailyAlloc;
                        return (
                          <td
                            key={day}
                            className={cn(
                              "px-1 py-1.5 text-center align-top",
                              isToday && "bg-navy-900/[0.035]",
                              !isToday && isWeekend && !isFuture && "bg-navy-900/[0.015]"
                            )}
                          >
                            <div className="flex flex-col items-center justify-center">
                              <input
                                type="number"
                                min={0}
                                max={24}
                                step={0.5}
                                key={`${cellKey}:${entry?.hours ?? ""}`}
                                defaultValue={entry?.hours ?? ""}
                                disabled={locked || isFuture || saving === cellKey}
                                title={
                                  isFuture
                                    ? "Not yet — you cannot book time against a day that has not happened."
                                    : locked
                                      ? "Approved — ask your PM to reopen it"
                                      : entry?.status === "submitted"
                                        ? "Submitted for approval"
                                        : undefined
                                }
                                onBlur={(e) => {
                                  handleCellBlur(project, task, day, e.target.value);
                                }}
                                className={cn(
                                  "w-14 rounded border px-1 py-1.5 text-center text-sm",
                                  "transition-[border-color,box-shadow,background] duration-150",
                                  isFuture
                                    ? "cursor-not-allowed border-transparent bg-transparent text-navy-200"
                                    : locked
                                      ? "border-neutral-200 bg-neutral-100 text-navy-500"
                                      : entry?.status === "submitted"
                                        ? "border-info/30 bg-info-bg/60"
                                        : isDailyExtra
                                          ? "border-amber-400 bg-amber-50/50 text-amber-900 focus:border-amber-600 focus:outline-none"
                                          : "border-neutral-200 focus:border-navy-700 focus:outline-none focus:shadow-[0_0_0_3px_rgb(33_47_96_/_0.1)]"
                                )}
                              />

                              {/* Extra Hours Reason indicator & prompt trigger */}
                              {entry && entry.extraHoursReason ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    openExtraPrompt({
                                      project,
                                      task,
                                      day,
                                      hours: entry.hours,
                                      activityType: entry.activityType,
                                      existingReason: entry.extraHoursReason || "",
                                      allocatedDaily: dailyAlloc,
                                      allocatedWeekly: weeklyAlloc,
                                      isExceedingDaily: entry.hours > dailyAlloc,
                                      isExceedingWeekly: isOverWeekly,
                                    })
                                  }
                                  className="mt-1 flex items-center gap-0.5 max-w-[56px] px-1 py-0.5 rounded bg-amber-50 hover:bg-amber-100 text-[9px] font-medium text-amber-800 border border-amber-200/90 cursor-pointer"
                                  title={`Extra hour note: "${entry.extraHoursReason}" (click to edit)`}
                                >
                                  <span>📝</span>
                                  <span className="truncate">{entry.extraHoursReason}</span>
                                </button>
                              ) : entry && isDailyExtra ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    openExtraPrompt({
                                      project,
                                      task,
                                      day,
                                      hours: entry.hours,
                                      activityType: entry.activityType,
                                      existingReason: "",
                                      allocatedDaily: dailyAlloc,
                                      allocatedWeekly: weeklyAlloc,
                                      isExceedingDaily: true,
                                      isExceedingWeekly: isOverWeekly,
                                    })
                                  }
                                  className="mt-1 px-1 py-0.5 rounded bg-red-50 hover:bg-red-100 text-[9px] font-semibold text-red-700 border border-red-200 cursor-pointer whitespace-nowrap"
                                  title="Define what was done in the extra hour"
                                >
                                  ⚠️ Add reason
                                </button>
                              ) : null}
                            </div>
                          </td>
                        );
                      })}

                      <td className="px-3 py-2 text-center align-middle font-medium">
                        <div className="text-sm font-bold text-navy-900">
                          {rowTotal > 0 ? `${rowTotal}h` : "—"}
                        </div>
                        {!task && (
                          <div className="text-[10px] text-navy-400 mt-0.5">
                            / {weeklyAlloc}h
                          </div>
                        )}
                        {!task && isOverWeekly && (
                          <span className="inline-block mt-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 whitespace-nowrap">
                            +{round2(rowTotal - weeklyAlloc)}h extra
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-neutral-50 border-t-2 border-neutral-200">
                  <td className="px-4 py-2.5 text-[10px] uppercase tracking-wider text-navy-500 font-semibold">
                    Day total
                  </td>
                  {days.map((day) => {
                    const dayTotal = totals?.byDay[day] ?? 0;
                    return (
                      <td
                        key={day}
                        className={`px-2 py-2.5 text-center text-sm font-bold ${
                          dayTotal > 12
                            ? "text-amber-700"
                            : dayTotal > 0
                              ? "text-navy-900"
                              : "text-navy-500/50"
                        }`}
                      >
                        {dayTotal > 0 ? dayTotal : "—"}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2.5 text-center text-sm font-bold text-navy-900">
                    {totals?.week ?? 0}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-neutral-100 px-4 py-3 text-[11px] text-navy-500">
            <span>
              Type hours and click away to save. Hours exceeding allocation require a one-liner justification.
            </span>
            {(draftCount > 0 || submittedCount > 0 || approvedCount > 0) && (
              <span className="flex items-center gap-3">
                {draftCount > 0 && (
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-sm border border-neutral-300 bg-white" />
                    {draftCount} draft
                  </span>
                )}
                {submittedCount > 0 && (
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-sm border border-info/40 bg-info-bg" />
                    {submittedCount} submitted
                  </span>
                )}
                {approvedCount > 0 && (
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-sm border border-neutral-300 bg-neutral-200" />
                    {approvedCount} approved · locked
                  </span>
                )}
              </span>
            )}
            {activityTypes.length > 0 && (
              <> Entries default to <span className="font-medium">{activityTypes[0]}</span>.</>
            )}
          </div>
        </Card>
      )}

      {/* ── Extra Hours Justification Modal ────────────────────── */}
      {extraPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-navy-900/10 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-xs font-semibold mb-2">
                <span>⚠️ Extra Hours Logged</span>
              </div>
              <h2 className="text-lg font-bold text-navy-900">
                Define what was done in the extra hour(s)
              </h2>
              <p className="text-xs text-navy-500 mt-1">
                You logged <strong className="text-navy-900">{extraPrompt.hours}h</strong> on{" "}
                <strong className="text-navy-900">{extraPrompt.day}</strong> for{" "}
                <strong className="text-navy-900">{extraPrompt.project.name}</strong>.
                {extraPrompt.isExceedingDaily
                  ? ` This exceeds your allocated ${extraPrompt.allocatedDaily}h/day.`
                  : ` This exceeds your allocated ${extraPrompt.allocatedWeekly}h/week.`}
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-navy-700 mb-1.5">
                One-liner justification <span className="text-red-500">*</span>
              </label>
              <textarea
                rows={3}
                autoFocus
                value={promptReason}
                onChange={(e) => setPromptReason(e.target.value)}
                placeholder="e.g. Critical release testing / Emergency client bug resolution"
                className="w-full rounded-lg border border-navy-900/20 px-3 py-2 text-xs text-navy-900 placeholder:text-navy-400 focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
              />
              <p className="text-[11px] text-navy-400 mt-1">
                Your Project Manager &amp; Approver will review this note against your allocated hours.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100">
              <Button
                variant="secondary"
                onClick={() => setExtraPrompt(null)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={!promptReason.trim()}
                onClick={() => {
                  if (!promptReason.trim()) return;
                  void log(
                    extraPrompt.project,
                    extraPrompt.task,
                    extraPrompt.day,
                    String(extraPrompt.hours),
                    extraPrompt.activityType,
                    promptReason.trim()
                  );
                  setExtraPrompt(null);
                }}
              >
                Save Justification
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
