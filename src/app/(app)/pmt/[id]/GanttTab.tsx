"use client";

import React, { useState, useMemo } from "react";
import type { WBSItem, Milestone } from "@/lib/types";
import { Card } from "@/components/ui/Card";
import { ColorBadge } from "@/components/ui/Badge";
import { formatDate } from "@/lib/utils";

interface Props {
  wbsItems: WBSItem[];
  milestones: Milestone[];
  projectStartDate?: string;
  projectEndDate?: string;
}

interface GanttTask {
  id: string;
  code: string;
  name: string;
  type: "phase" | "task" | "milestone";
  startDate: string;
  endDate: string;
  durationDays: number;
  progressPercent: number;
  status: string;
  parentId?: string;
  /** True when no real dates are set and the bar is a projection. */
  estimated?: boolean;
}

export function GanttTab({ wbsItems, milestones, projectStartDate, projectEndDate }: Props) {
  const [viewMode, setViewMode] = useState<"weeks" | "months">("weeks");
  const [filterType, setFilterType] = useState<"all" | "phases" | "milestones">("all");

  // Transform WBS items & milestones into timeline items
  const tasks: GanttTask[] = useMemo(() => {
    const list: GanttTask[] = [];

    // Base start date anchor
    const baseStart = projectStartDate ? new Date(projectStartDate) : new Date("2026-06-01");

    wbsItems.forEach((wbs, index) => {
      // Prefer the dates the project manager actually set. Only fall back to
      // a projected slot when a work package has not been scheduled yet —
      // those rows are flagged `estimated` so the chart can say so.
      const hasRealDates = Boolean(wbs.startDate && wbs.endDate);

      let start: Date;
      let end: Date;

      if (hasRealDates) {
        start = new Date(wbs.startDate as string);
        end = new Date(wbs.endDate as string);
      } else {
        const estimatedHours = wbs.estimatedHours;
        const duration = estimatedHours ? Math.max(1, Math.round(estimatedHours / 8)) : 10;
        start = new Date(baseStart.getTime() + index * 7 * 86400000);
        end = new Date(start.getTime() + duration * 86400000);
      }

      // Guard against a bad row inverting the bar.
      if (end < start) end = start;

      const durationDays = Math.max(
        1,
        Math.round((end.getTime() - start.getTime()) / 86400000)
      );

      const isPhase = !wbs.parentWbsId;

      list.push({
        id: wbs.id,
        code: wbs.code,
        name: wbs.name,
        type: isPhase ? "phase" : "task",
        startDate: start.toISOString().split("T")[0],
        endDate: end.toISOString().split("T")[0],
        durationDays,
        progressPercent: Math.min(100, Math.max(0, wbs.progressPercent ?? 0)),
        status: wbs.status ?? "not_started",
        parentId: wbs.parentWbsId,
        estimated: !hasRealDates,
      });
    });

    // Add milestones
    milestones.forEach((m, idx) => {
      list.push({
        id: m.id,
        code: `MS-${idx + 1}`,
        name: m.name,
        type: "milestone",
        startDate: m.dueDate ? m.dueDate.split("T")[0] : new Date().toISOString().split("T")[0],
        endDate: m.dueDate ? m.dueDate.split("T")[0] : new Date().toISOString().split("T")[0],
        durationDays: 1,
        progressPercent: m.status === "completed" ? 100 : 0,
        status: m.status,
        estimated: !m.dueDate,
      });
    });

    return list;
  }, [wbsItems, milestones, projectStartDate]);

  const filteredTasks = useMemo(() => {
    if (filterType === "phases") return tasks.filter((t) => t.type === "phase");
    if (filterType === "milestones") return tasks.filter((t) => t.type === "milestone");
    return tasks;
  }, [tasks, filterType]);

  // Determine timeline range
  const timelineDates = useMemo(() => {
    let minTime = Infinity;
    let maxTime = -Infinity;

    tasks.forEach((t) => {
      const s = new Date(t.startDate).getTime();
      const e = new Date(t.endDate).getTime();
      if (s < minTime) minTime = s;
      if (e > maxTime) maxTime = e;
    });

    if (minTime === Infinity) {
      minTime = Date.now();
      maxTime = Date.now() + 60 * 86400000;
    }

    // Add padding
    minTime -= 7 * 86400000;
    maxTime += 14 * 86400000;

    const totalDays = Math.ceil((maxTime - minTime) / 86400000);
    return { minTime, maxTime, totalDays };
  }, [tasks]);

  const getPositionPercent = (dateStr: string) => {
    const time = new Date(dateStr).getTime();
    const range = timelineDates.maxTime - timelineDates.minTime;
    return Math.max(0, Math.min(100, ((time - timelineDates.minTime) / range) * 100));
  };

  const getWidthPercent = (startStr: string, endStr: string) => {
    const start = new Date(startStr).getTime();
    const end = new Date(endStr).getTime();
    const range = timelineDates.maxTime - timelineDates.minTime;
    return Math.max(2, Math.min(100, ((end - start) / range) * 100));
  };

  // Only leaf work packages are counted. A parent phase's bar spans its
  // children, so including both would double-count the same days — and the
  // previous `type === "task"` filter totalled zero for any flat plan, where
  // every item is top-level and therefore typed "phase".
  const workPackages = useMemo(() => {
    const parentIds = new Set(tasks.map((t) => t.parentId).filter(Boolean));
    return tasks.filter((t) => t.type !== "milestone" && !parentIds.has(t.id));
  }, [tasks]);

  const totalDurationDays = useMemo(
    () => workPackages.reduce((sum, t) => sum + t.durationDays, 0),
    [workPackages]
  );

  // Weighted by duration: a 40-day package at 50% should move the number
  // more than a 2-day one at 100%. Milestones are excluded — they are
  // points in time, not effort.
  const overallProgress = useMemo(() => {
    if (workPackages.length === 0) return 0;
    const totalDays = workPackages.reduce((acc, t) => acc + t.durationDays, 0);
    if (totalDays === 0) {
      const flat = workPackages.reduce((acc, t) => acc + t.progressPercent, 0);
      return Math.round(flat / workPackages.length);
    }
    const weighted = workPackages.reduce((acc, t) => acc + t.progressPercent * t.durationDays, 0);
    return Math.round(weighted / totalDays);
  }, [workPackages]);

  return (
    <div className="space-y-6">
      {/* Controls & Summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-navy-500/15 shadow-sm">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs font-semibold text-navy-500 uppercase tracking-wider">Filter:</span>
          <div className="flex items-center rounded-lg border border-neutral-200 overflow-hidden text-xs">
            <button
              onClick={() => setFilterType("all")}
              className={`px-3 py-1.5 font-medium transition-colors ${
                filterType === "all" ? "bg-navy-900 text-white" : "bg-white text-navy-700 hover:bg-neutral-50"
              }`}
            >
              All Items ({tasks.length})
            </button>
            <button
              onClick={() => setFilterType("phases")}
              className={`px-3 py-1.5 font-medium border-l border-neutral-200 transition-colors ${
                filterType === "phases" ? "bg-navy-900 text-white" : "bg-white text-navy-700 hover:bg-neutral-50"
              }`}
            >
              Phases
            </button>
            <button
              onClick={() => setFilterType("milestones")}
              className={`px-3 py-1.5 font-medium border-l border-neutral-200 transition-colors ${
                filterType === "milestones" ? "bg-navy-900 text-white" : "bg-white text-navy-700 hover:bg-neutral-50"
              }`}
            >
              Milestones ({milestones.length})
            </button>
          </div>
        </div>

        <div className="flex items-center gap-6 text-sm">
          <div>
            <span className="text-xs text-navy-500 block">Total Est. Work</span>
            <span className="font-bold text-navy-900">{totalDurationDays} Days</span>
          </div>
          <div className="border-l border-neutral-200 pl-4">
            <span className="text-xs text-navy-500 block">Overall Progress</span>
            <span className="font-bold text-emerald-600">{overallProgress}%</span>
          </div>
        </div>
      </div>

      {/* Gantt Timeline View */}
      <Card padding="none" className="overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <div className="min-w-[850px]">
            {/* Timeline Header */}
            <div className="flex border-b border-neutral-200 bg-neutral-50/75 text-xs font-semibold text-navy-600">
              <div className="w-80 p-3.5 border-r border-neutral-200 flex-shrink-0 uppercase tracking-wider">
                Work Breakdown & Deliverable
              </div>
              <div className="flex-1 p-3.5 relative">
                <div className="flex justify-between text-xs text-navy-400">
                  <span>{formatDate(new Date(timelineDates.minTime).toISOString())}</span>
                  <span className="font-bold text-navy-700">Project Execution Timeline</span>
                  <span>{formatDate(new Date(timelineDates.maxTime).toISOString())}</span>
                </div>
              </div>
            </div>

            {/* Task Rows */}
            <div className="divide-y divide-neutral-100">
              {filteredTasks.length === 0 ? (
                <div className="p-8 text-center text-sm text-navy-400">No tasks or phases found.</div>
              ) : (
                filteredTasks.map((t) => {
                  const leftPos = getPositionPercent(t.startDate);
                  const width = t.type === "milestone" ? 3 : getWidthPercent(t.startDate, t.endDate);

                  return (
                    <div
                      key={t.id}
                      className={`flex items-center hover:bg-neutral-50/80 transition-colors ${
                        t.type === "phase" ? "bg-neutral-50/30 font-semibold" : ""
                      }`}
                    >
                      {/* Left Column: Metadata */}
                      <div className="w-80 p-3 border-r border-neutral-200 flex-shrink-0 flex items-center justify-between gap-2">
                        <div className="min-w-0 flex items-center gap-2">
                          {t.type === "phase" && (
                            <span className="w-2 h-2 rounded-full bg-indigo-600 flex-shrink-0" />
                          )}
                          {t.type === "milestone" && (
                            <span className="w-2.5 h-2.5 rotate-45 bg-amber-500 flex-shrink-0" />
                          )}
                          {t.type === "task" && (
                            <span className="w-1.5 h-1.5 rounded-full bg-navy-300 flex-shrink-0 ml-3" />
                          )}
                          <div className="truncate">
                            <span className="font-mono text-xs text-navy-400 mr-1.5">{t.code}</span>
                            <span className="text-xs text-navy-900">{t.name}</span>
                          </div>
                        </div>
                        <span className="text-[10px] text-navy-500 tabular-nums whitespace-nowrap">
                          {t.durationDays}d
                        </span>
                      </div>

                      {/* Right Column: Visual Timeline Bar */}
                      <div className="flex-1 p-2 relative h-12 flex items-center">
                        {/* Background guideline grid */}
                        <div className="absolute inset-0 flex justify-between pointer-events-none opacity-20">
                          <div className="w-px h-full bg-neutral-300" />
                          <div className="w-px h-full bg-neutral-300" />
                          <div className="w-px h-full bg-neutral-300" />
                          <div className="w-px h-full bg-neutral-300" />
                        </div>

                        {t.type === "milestone" ? (
                          // Milestone Diamond
                          <div
                            className="absolute flex items-center gap-1.5 group cursor-pointer z-10"
                            style={{ left: `${leftPos}%` }}
                          >
                            <div className="w-4 h-4 rotate-45 bg-amber-500 shadow-md border-2 border-white transform transition-transform group-hover:scale-125" />
                            <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200/60 whitespace-nowrap opacity-90 group-hover:opacity-100">
                              {t.name} ({formatDate(t.startDate)})
                            </span>
                          </div>
                        ) : (
                          // Bar
                          <div
                            className={`absolute h-6 rounded-lg shadow-sm flex items-center px-2 text-white text-[10px] font-medium transition-all group overflow-hidden cursor-pointer ${
                              t.type === "phase"
                                ? "bg-navy-900 border border-navy-800"
                                : "bg-blue-600 border border-blue-500"
                            }`}
                            style={{
                              left: `${leftPos}%`,
                              width: `${width}%`,
                              minWidth: "60px",
                            }}
                          >
                            {/* Inner progress bar */}
                            <div
                              className="absolute top-0 bottom-0 left-0 bg-white/20"
                              style={{ width: `${t.progressPercent}%` }}
                            />
                            <span className="relative z-10 truncate drop-shadow-sm">
                              {t.name} ({t.progressPercent}%)
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Legend */}
      <div className="flex items-center gap-6 text-xs text-navy-500 px-1">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-navy-900" />
          <span>WBS Level 1 Phase</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-blue-600" />
          <span>Deliverable / Work Task</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rotate-45 bg-amber-500" />
          <span>Milestone Release</span>
        </div>
      </div>
    </div>
  );
}
