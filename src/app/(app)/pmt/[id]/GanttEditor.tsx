"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WBSItem, Milestone, WBSStatus } from "@/lib/types";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { toDateInput, toISODate, parseISODate } from "@/lib/dates";

// ═══════════════════════════════════════════════════════════════
// A Gantt chart you can draw on.
//
//   • drag a bar               → move the work package
//   • drag either end          → change the start or the end
//   • drag the progress handle → set completion
//   • drag across empty space  → draw a new work package
//
// Everything snaps to whole days. Edits apply optimistically and roll
// back if the server refuses, so a rejected change never leaves the
// chart showing something the database does not hold.
// ═══════════════════════════════════════════════════════════════

type Zoom = "day" | "week" | "month";

const PX_PER_DAY: Record<Zoom, number> = { day: 28, week: 9, month: 3.2 };
const ROW_H = 38;
const LABEL_W = 260;
const MS_DAY = 86400000;

interface Swatch {
  /** The pale trough behind the bar. */
  bar: string;
  /** The saturated progress fill. */
  fill: string;
  label: string;
}

const STATUS_STYLE: Record<WBSStatus, Swatch> = {
  not_started: { bar: "bg-navy-500/20", fill: "bg-navy-500", label: "Not started" },
  in_progress: { bar: "bg-blue-500/20", fill: "bg-blue-500", label: "In progress" },
  blocked: { bar: "bg-red-600/20", fill: "bg-red-600", label: "Blocked" },
  completed: { bar: "bg-emerald-500/20", fill: "bg-emerald-500", label: "Completed" },
};

/**
 * Schedule health, which is a different question from status: a package
 * can be "in progress" and three weeks late. Derived from the dates and
 * the percentage rather than stored, so it cannot go stale.
 */
type Health = "done" | "overdue" | "due_soon" | "behind" | "on_track";

const HEALTH_STYLE: Record<Health, Swatch> = {
  done: { bar: "bg-emerald-500/20", fill: "bg-emerald-500", label: "Finished" },
  overdue: { bar: "bg-red-600/20", fill: "bg-red-600", label: "Past its end date" },
  behind: { bar: "bg-orange-500/20", fill: "bg-orange-500", label: "Behind the curve" },
  due_soon: { bar: "bg-amber-500/20", fill: "bg-amber-500", label: "Ends within a week" },
  on_track: { bar: "bg-blue-500/20", fill: "bg-blue-500", label: "On track" },
};

/**
 * One hue per phase, so a long plan reads as blocks of work rather than
 * a wall of identical bars. Written out in full because Tailwind only
 * ships the class names it can see in the source.
 */
const PHASE_STYLES: Swatch[] = [
  { bar: "bg-blue-500/20", fill: "bg-blue-500", label: "" },
  { bar: "bg-purple-500/20", fill: "bg-purple-500", label: "" },
  { bar: "bg-emerald-500/20", fill: "bg-emerald-500", label: "" },
  { bar: "bg-amber-500/20", fill: "bg-amber-500", label: "" },
  { bar: "bg-pink-500/20", fill: "bg-pink-500", label: "" },
  { bar: "bg-teal-500/20", fill: "bg-teal-500", label: "" },
  { bar: "bg-indigo-500/20", fill: "bg-indigo-500", label: "" },
  { bar: "bg-orange-500/20", fill: "bg-orange-500", label: "" },
];

type ColourBy = "status" | "health" | "phase";

const COLOUR_BY_LABEL: Record<ColourBy, string> = {
  status: "Status",
  health: "Health",
  phase: "Phase",
};

function healthOf(item: WBSItem, today: Date): Health {
  const progress = item.progressPercent ?? 0;
  if (item.status === "completed" || progress >= 100) return "done";

  const start = item.startDate ? new Date(item.startDate) : null;
  const end = item.endDate ? new Date(item.endDate) : null;
  if (!end) return "on_track";

  const endDay = startOfDay(end);
  if (endDay < today) return "overdue";

  const daysLeft = daysBetween(today, endDay);
  if (start) {
    // How far through the window we are, against how far through the work.
    const startDay = startOfDay(start);
    const span = Math.max(1, daysBetween(startDay, endDay));
    const elapsed = Math.max(0, daysBetween(startDay, today));
    const expected = Math.min(100, (elapsed / span) * 100);
    if (progress + 15 < expected) return "behind";
  }
  if (daysLeft <= 7) return "due_soon";
  return "on_track";
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * MS_DAY);
// A `date` column arrives as an ISO timestamp in UTC. parseISODate reads
// the local calendar day it stands for, so a bar never lands a day early.
const parseDate = (value?: string | null) => parseISODate(value);
const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / MS_DAY);

/**
 * Turn a failed save into something the person can act on. A bare
 * "that didn't save" sends people hunting through their own data when
 * the cause is usually one of three specific things.
 */
function describeSaveFailure(status: number, data: { error?: string }): string {
  if (data.error) return data.error;
  if (status === 401) return "Your session has expired. Sign in again and the change will stick.";
  if (status === 404) {
    return (
      "The server did not recognise that address (404). If the work package is " +
      "still on screen this is usually a stale dev build — stop the server, " +
      "delete the .next folder and start it again."
    );
  }
  if (status === 503) return "The database is missing something this needs. Check the migrations in src/lib/migrations.";
  return `That change was not saved (HTTP ${status}).`;
}

/**
 * Two gestures draw a rectangle across empty space: creating a new work
 * package, and placing an existing unscheduled one onto the timeline.
 */
function drawsRange(kind: DragState["kind"] | undefined): boolean {
  return kind === "create" || kind === "schedule";
}

interface DragState {
  kind: "move" | "resize-start" | "resize-end" | "progress" | "create" | "schedule";
  itemId: string | null;
  originX: number;
  originStart: Date | null;
  originEnd: Date | null;
  originProgress: number;
  rowIndex: number;
  previewStart: Date | null;
  previewEnd: Date | null;
  previewProgress: number;
  moved: boolean;
}

export interface GanttEditorProps {
  projectId: string;
  wbsItems: WBSItem[];
  milestones: Milestone[];
  projectStartDate?: string;
  projectEndDate?: string;
  canReschedule: boolean;
  canCreate: boolean;
  canUpdateProgress: boolean;
  accessSummary?: string;
  onItemsChange?: (items: WBSItem[]) => void;
}

export function GanttEditor({
  projectId,
  wbsItems,
  milestones,
  projectStartDate,
  projectEndDate,
  canReschedule,
  canCreate,
  canUpdateProgress,
  accessSummary,
  onItemsChange,
}: GanttEditorProps) {
  const [items, setItems] = useState<WBSItem[]>(wbsItems);
  const [zoom, setZoom] = useState<Zoom>("week");
  const [colourBy, setColourBy] = useState<ColourBy>("status");
  const [drag, setDrag] = useState<DragState | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [hint, setHint] = useState("");
  const [newName, setNewName] = useState<{ start: Date; end: Date } | null>(null);
  const [draftName, setDraftName] = useState("");

  const chartRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const pxPerDay = PX_PER_DAY[zoom];

  useEffect(() => setItems(wbsItems), [wbsItems]);
  useEffect(() => {
    dragRef.current = drag;
  }, [drag]);

  // ─── Timeline bounds ─────────────────────────────────────────
  const { origin, totalDays } = useMemo(() => {
    const dates: Date[] = [];
    items.forEach((i) => {
      const s = parseDate(i.startDate);
      const e = parseDate(i.endDate);
      if (s) dates.push(s);
      if (e) dates.push(e);
    });
    milestones.forEach((m) => {
      const d = parseDate(m.dueDate);
      if (d) dates.push(d);
    });
    const ps = parseDate(projectStartDate);
    const pe = parseDate(projectEndDate);
    if (ps) dates.push(ps);
    if (pe) dates.push(pe);
    dates.push(startOfDay(new Date()));

    const min = new Date(Math.min(...dates.map((d) => d.getTime())));
    const max = new Date(Math.max(...dates.map((d) => d.getTime())));
    // Room either side so a bar can always be dragged outward.
    const from = addDays(min, -14);
    const to = addDays(max, 30);
    return { origin: from, totalDays: Math.max(30, daysBetween(from, to)) };
  }, [items, milestones, projectStartDate, projectEndDate]);

  const chartWidth = totalDays * pxPerDay;
  const xFor = useCallback((date: Date) => daysBetween(origin, date) * pxPerDay, [origin, pxPerDay]);
  const dayAt = useCallback(
    (clientX: number) => {
      const rect = chartRef.current?.getBoundingClientRect();
      if (!rect) return 0;
      const scroll = chartRef.current?.scrollLeft ?? 0;
      return Math.round((clientX - rect.left + scroll) / pxPerDay);
    },
    [pxPerDay]
  );

  // ─── Month / week ruler ──────────────────────────────────────
  const ruler = useMemo(() => {
    const months: { label: string; x: number; width: number }[] = [];
    const ticks: { x: number; label: string; major: boolean }[] = [];

    const cursor = new Date(origin.getFullYear(), origin.getMonth(), 1);
    const end = addDays(origin, totalDays);
    while (cursor <= end) {
      const next = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      const x = Math.max(0, xFor(cursor));
      const width = Math.min(xFor(next), chartWidth) - x;
      if (width > 24) {
        months.push({
          label: cursor.toLocaleDateString("en-IN", { month: "short", year: "numeric" }),
          x,
          width,
        });
      }
      cursor.setMonth(cursor.getMonth() + 1);
    }

    const step = zoom === "day" ? 1 : zoom === "week" ? 7 : 30;
    for (let d = 0; d <= totalDays; d += step) {
      const date = addDays(origin, d);
      ticks.push({
        x: d * pxPerDay,
        label:
          zoom === "day"
            ? String(date.getDate())
            : zoom === "week"
              ? `${date.getDate()}/${date.getMonth() + 1}`
              : date.toLocaleDateString("en-IN", { month: "short" }),
        major: date.getDate() === 1,
      });
    }
    return { months, ticks };
  }, [origin, totalDays, pxPerDay, chartWidth, xFor, zoom]);

  const todayX = xFor(startOfDay(new Date()));

  // Where the eye should land. The timeline starts two weeks before the
  // earliest date anywhere in the plan, which can be months before the
  // work itself — one stray early date used to push every bar off the
  // right of the viewport, so the chart opened looking empty.
  const focusX = useMemo(() => {
    const starts = items
      .map((i) => parseDate(i.startDate))
      .filter((d): d is Date => d !== null)
      .map((d) => xFor(d));
    if (starts.length === 0) return todayX;

    const earliest = Math.min(...starts);
    const latest = Math.max(...starts);
    // Today is the more useful anchor, but only while it sits inside the
    // work — on a plan that finished last year it is not.
    return todayX >= earliest && todayX <= latest ? todayX : earliest;
  }, [items, xFor, todayX]);

  // Only on mount and when the zoom changes: once somebody has scrolled
  // the chart themselves, moving it under them would be worse than
  // leaving it where they put it.
  const scrolledFor = useRef<string>("");
  useEffect(() => {
    const el = chartRef.current;
    if (!el) return;
    const key = `${zoom}:${items.length}`;
    if (scrolledFor.current === key) return;
    scrolledFor.current = key;
    // A little lead-in so the first bar is not flush against the edge.
    el.scrollLeft = Math.max(0, focusX - Math.min(120, el.clientWidth * 0.15));
  }, [zoom, items.length, focusX]);

  // Pick a zoom that shows the whole plan, once, on first load. A
  // two-year programme at week zoom is four screens wide, and the part
  // you land on tells you nothing about the shape of it.
  const autoZoomed = useRef(false);
  useEffect(() => {
    const el = chartRef.current;
    if (autoZoomed.current || !el || el.clientWidth === 0 || totalDays <= 0) return;
    autoZoomed.current = true;

    const fits = (["day", "week", "month"] as Zoom[]).find(
      (level) => totalDays * PX_PER_DAY[level] <= el.clientWidth
    );
    // Nothing fits at month zoom either: stay there, it is the closest.
    const next = fits ?? "month";
    if (next !== zoom) {
      setZoom(next);
      scrolledFor.current = "";
    }
  }, [totalDays, zoom]);

  const jumpToToday = useCallback(() => {
    const el = chartRef.current;
    if (!el) return;
    el.scrollTo({ left: Math.max(0, todayX - el.clientWidth / 2), behavior: "smooth" });
  }, [todayX]);

  // ─── Persisting ──────────────────────────────────────────────
  const persist = useCallback(
    async (itemId: string, patch: Record<string, unknown>, previous: WBSItem) => {
      setSaving(itemId);
      setError("");
      try {
        const res = await fetch(`/api/pmt/projects/${projectId}/wbs/${itemId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          // Put it back exactly as it was.
          setItems((prev) => prev.map((i) => (i.id === itemId ? previous : i)));
          setError(describeSaveFailure(res.status, data));
          return false;
        }
        return true;
      } catch {
        setItems((prev) => prev.map((i) => (i.id === itemId ? previous : i)));
        setError("Could not reach the server. Your change was not saved.");
        return false;
      } finally {
        setSaving(null);
      }
    },
    [projectId]
  );

  useEffect(() => {
    if (onItemsChange) onItemsChange(items);
  }, [items, onItemsChange]);

  // ─── Dragging ────────────────────────────────────────────────
  const beginDrag = (
    event: React.MouseEvent,
    kind: DragState["kind"],
    item: WBSItem | null,
    rowIndex: number
  ) => {
    // Refusing silently is what makes a chart feel broken: the bar simply
    // does not move and there is nothing to read. Say which rule stopped it.
    if (kind === "create" && !canCreate) {
      setError(`Your role does not allow adding work packages. ${accessSummary ?? ""}`.trim());
      return;
    }
    if (kind === "progress" && !canUpdateProgress) {
      setError(`Your role does not allow changing progress. ${accessSummary ?? ""}`.trim());
      return;
    }
    if (kind !== "create" && kind !== "progress" && !canReschedule) {
      setError(
        canUpdateProgress
          ? "Your role does not allow rescheduling. You can still drag the round handle inside a bar to set progress."
          : `Your role does not allow editing this plan. ${accessSummary ?? ""}`.trim()
      );
      return;
    }
    setError("");

    event.preventDefault();
    event.stopPropagation();

    const start = parseDate(item?.startDate);
    const end = parseDate(item?.endDate);

    setDrag({
      kind,
      itemId: item?.id ?? null,
      originX: event.clientX,
      originStart: start,
      originEnd: end,
      originProgress: item?.progressPercent ?? 0,
      rowIndex,
      previewStart: drawsRange(kind) ? addDays(origin, dayAt(event.clientX)) : start,
      previewEnd: drawsRange(kind) ? addDays(origin, dayAt(event.clientX)) : end,
      previewProgress: item?.progressPercent ?? 0,
      moved: false,
    });
  };

  useEffect(() => {
    if (!drag) return;

    const onMove = (event: MouseEvent) => {
      const deltaDays = Math.round((event.clientX - drag.originX) / pxPerDay);

      setDrag((current) => {
        if (!current) return current;
        const moved = current.moved || Math.abs(event.clientX - current.originX) > 3;

        if (drawsRange(current.kind)) {
          const from = addDays(origin, dayAt(current.originX));
          const to = addDays(origin, dayAt(event.clientX));
          const [a, b] = from <= to ? [from, to] : [to, from];
          return { ...current, previewStart: a, previewEnd: b, moved };
        }

        if (current.kind === "progress") {
          const item = items.find((i) => i.id === current.itemId);
          const s = parseDate(item?.startDate);
          const e = parseDate(item?.endDate);
          if (!s || !e) return current;
          const span = Math.max(1, daysBetween(s, e));
          const offset = dayAt(event.clientX) - daysBetween(origin, s);
          const pct = Math.round(Math.min(100, Math.max(0, (offset / span) * 100)) / 5) * 5;
          return { ...current, previewProgress: pct, moved };
        }

        if (!current.originStart || !current.originEnd) return current;

        if (current.kind === "move") {
          return {
            ...current,
            previewStart: addDays(current.originStart, deltaDays),
            previewEnd: addDays(current.originEnd, deltaDays),
            moved,
          };
        }
        if (current.kind === "resize-start") {
          const next = addDays(current.originStart, deltaDays);
          return {
            ...current,
            previewStart: next > current.originEnd ? current.originEnd : next,
            moved,
          };
        }
        // resize-end
        const next = addDays(current.originEnd, deltaDays);
        return { ...current, previewEnd: next < current.originStart ? current.originStart : next, moved };
      });
    };

    const onUp = () => {
      // Read the latest drag state without doing any of the work inside a
      // state updater. React invokes updaters twice in development, which
      // previously fired every save request twice.
      const current = dragRef.current;
      setDrag(null);

      if (!current || !current.moved) return; // a click, not a drag

      if (current.kind === "create") {
        if (current.previewStart && current.previewEnd) {
          setNewName({ start: current.previewStart, end: current.previewEnd });
          setDraftName("");
        }
        return;
      }

      const item = items.find((i) => i.id === current.itemId);
      if (!item) return;

      if (current.kind === "progress") {
        const updated = { ...item, progressPercent: current.previewProgress };
        setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
        void persist(item.id, { progressPercent: current.previewProgress }, item);
        return;
      }

      if (!current.previewStart || !current.previewEnd) return;
      const startDate = toISODate(current.previewStart);
      const endDate = toISODate(current.previewEnd);
      const updated = { ...item, startDate, endDate };
      setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
      void persist(item.id, { startDate, endDate }, item);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [drag, items, origin, pxPerDay, dayAt, persist]);

  // ─── Creating from a drawn range ─────────────────────────────
  const createFromDraw = async () => {
    if (!newName || !draftName.trim()) return;
    setSaving("new");
    setError("");
    try {
      const res = await fetch(`/api/pmt/projects/${projectId}/wbs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draftName.trim(),
          startDate: toISODate(newName.start),
          endDate: toISODate(newName.end),
          status: "not_started",
          progressPercent: 0,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not create that work package.");
        return;
      }
      const saved = data.wbsItem as Record<string, unknown>;
      setItems((prev) => [
        ...prev,
        {
          id: String(saved.id),
          projectId,
          code: String(saved.code ?? ""),
          name: String(saved.name ?? ""),
          sequence: Number(saved.sequence ?? prev.length + 1),
          status: (saved.status as WBSStatus) ?? "not_started",
          startDate: (saved.start_date as string) ?? toISODate(newName.start),
          endDate: (saved.end_date as string) ?? toISODate(newName.end),
          progressPercent: Number(saved.progress_percent ?? 0),
          createdAt: String(saved.created_at ?? new Date().toISOString()),
          updatedAt: String(saved.updated_at ?? new Date().toISOString()),
        },
      ]);
      setNewName(null);
      setDraftName("");
      setHint("Work package added. Drag its edges to adjust the dates.");
      setTimeout(() => setHint(""), 5000);
    } finally {
      setSaving(null);
    }
  };

  const ordered = useMemo(
    () => [...items].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0)),
    [items]
  );

  // Each top-level branch of the tree is a phase; a child takes its
  // root's colour so the family is obvious at a glance.
  const phaseIndexOf = useMemo(() => {
    const parentOf = new Map(items.map((i) => [i.id, i.parentWbsId ?? null]));
    const roots: string[] = [];
    const rootOf = new Map<string, string>();

    for (const item of items) {
      let cursor: string | null = item.id;
      const seen = new Set<string>();
      while (cursor && parentOf.get(cursor) && !seen.has(cursor)) {
        seen.add(cursor);
        cursor = parentOf.get(cursor) ?? null;
      }
      const root = cursor ?? item.id;
      if (!roots.includes(root)) roots.push(root);
      rootOf.set(item.id, root);
    }

    const index = new Map<string, number>();
    for (const item of items) {
      const root = rootOf.get(item.id) ?? item.id;
      index.set(item.id, roots.indexOf(root) % PHASE_STYLES.length);
    }
    return index;
  }, [items]);

  const today = useMemo(() => startOfDay(new Date()), []);

  const swatchFor = useCallback(
    (item: WBSItem): Swatch => {
      if (colourBy === "health") return HEALTH_STYLE[healthOf(item, today)];
      if (colourBy === "phase") return PHASE_STYLES[phaseIndexOf.get(item.id) ?? 0];
      return STATUS_STYLE[item.status ?? "not_started"];
    },
    [colourBy, phaseIndexOf, today]
  );

  // A plan nobody has scheduled draws an empty chart. Saying so beats
  // leaving people to wonder whether the chart is broken.
  const unscheduledCount = useMemo(
    () => items.filter((i) => !i.startDate || !i.endDate).length,
    [items]
  );

  const previewFor = (item: WBSItem) => {
    if (drag?.itemId !== item.id) {
      return {
        start: parseDate(item.startDate),
        end: parseDate(item.endDate),
        progress: item.progressPercent ?? 0,
      };
    }
    return {
      start: drag.previewStart ?? parseDate(item.startDate),
      end: drag.previewEnd ?? parseDate(item.endDate),
      progress: drag.kind === "progress" ? drag.previewProgress : item.progressPercent ?? 0,
    };
  };

  // Only the colours actually on screen: a legend listing eight phases
  // for a three-phase plan is noise.
  const legend = useMemo((): { fill: string; label: string }[] => {
    if (colourBy === "status") {
      return (Object.keys(STATUS_STYLE) as WBSStatus[]).map((key) => ({
        fill: STATUS_STYLE[key].fill,
        label: STATUS_STYLE[key].label,
      }));
    }
    if (colourBy === "health") {
      const present = new Set(items.map((i) => healthOf(i, today)));
      return (Object.keys(HEALTH_STYLE) as Health[])
        .filter((key) => present.has(key))
        .map((key) => ({ fill: HEALTH_STYLE[key].fill, label: HEALTH_STYLE[key].label }));
    }
    const seen = new Map<number, string>();
    for (const item of ordered) {
      const index = phaseIndexOf.get(item.id) ?? 0;
      if (!seen.has(index)) seen.set(index, item.name);
    }
    return [...seen.entries()].map(([index, name]) => ({
      fill: PHASE_STYLES[index].fill,
      label: name.length > 22 ? `${name.slice(0, 21)}…` : name,
    }));
  }, [colourBy, items, ordered, phaseIndexOf, today]);

  const editable = canReschedule || canCreate || canUpdateProgress;

  return (
    <div className="space-y-4">
      {/* ── Toolbar ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-navy-500 uppercase tracking-wider">Zoom</span>
          <div className="inline-flex rounded-lg border border-neutral-200 overflow-hidden">
            {(["day", "week", "month"] as Zoom[]).map((level) => (
              <button
                key={level}
                onClick={() => setZoom(level)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                  zoom === level
                    ? "bg-navy-900 text-white"
                    : "bg-white text-navy-700 hover:bg-neutral-50"
                }`}
              >
                {level === "day" ? "Days" : level === "week" ? "Weeks" : "Months"}
              </button>
            ))}
          </div>

          <button
            onClick={jumpToToday}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-neutral-200 bg-white text-navy-700 hover:bg-neutral-50 transition-colors cursor-pointer"
            title="Scroll the timeline back to today"
          >
            Today
          </button>

          <span className="text-xs font-semibold text-navy-500 uppercase tracking-wider ml-2">
            Colour by
          </span>
          <div className="inline-flex rounded-lg border border-neutral-200 overflow-hidden">
            {(["status", "health", "phase"] as ColourBy[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setColourBy(mode)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                  colourBy === mode
                    ? "bg-navy-900 text-white"
                    : "bg-white text-navy-700 hover:bg-neutral-50"
                }`}
              >
                {COLOUR_BY_LABEL[mode]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          {legend.map((entry) => (
            <span key={entry.label} className="flex items-center gap-1.5">
              <span className={`w-3.5 h-2 rounded-sm ${entry.fill}`} />
              <span className="text-[11px] text-navy-500">{entry.label}</span>
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <span className="w-0 h-3 border-l-2 border-dashed border-red-600" />
            <span className="text-[11px] text-navy-500">Today</span>
          </span>
        </div>
      </div>

      {/* ── What you can do here ─────────────────────────────── */}
      <div
        className={`rounded-lg px-4 py-2.5 text-xs border ${
          editable
            ? "bg-navy-900/[0.03] border-neutral-200 text-navy-700"
            : "bg-amber-500/5 border-amber-500/30 text-amber-800"
        }`}
      >
        {editable ? (
          <>
            <span className="font-medium">Drag to edit.</span>{" "}
            {canReschedule &&
              "Move a bar to reschedule it, or drag either end to change its dates. "}
            {canUpdateProgress && "Drag the handle inside a bar to set progress. "}
            {canCreate && "Drag across an empty row to draw a new work package."}
            {canReschedule && unscheduledCount > 0 && (
              <>
                {" "}
                <span className="font-medium">
                  {unscheduledCount} {unscheduledCount === 1 ? "package has" : "packages have"} no
                  dates yet
                </span>{" "}
                — drag across the matching row to place{" "}
                {unscheduledCount === 1 ? "it" : "them"} on the timeline.
              </>
            )}
          </>
        ) : (
          <>
            <span className="font-medium">Read-only.</span>{" "}
            {accessSummary ?? "Your role does not allow editing this plan."}
          </>
        )}
      </div>

      {error && (
        <div role="alert" className="bg-red-600/5 border border-red-600/20 text-red-600 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}
      {hint && !error && (
        <div className="bg-emerald-500/5 border border-emerald-500/20 text-emerald-700 text-sm rounded-lg px-4 py-3">
          {hint}
        </div>
      )}

      {/* ── The chart ────────────────────────────────────────── */}
      <Card padding="none">
        <div className="flex">
          {/* Fixed label column */}
          <div className="flex-shrink-0 border-r border-neutral-100" style={{ width: LABEL_W }}>
            <div className="h-[52px] border-b border-neutral-100 bg-neutral-50/75 flex items-end px-4 pb-2">
              <span className="text-xs font-semibold text-navy-500 uppercase tracking-wider">
                Work package
              </span>
            </div>
            {ordered.map((item) => (
              <div
                key={item.id}
                className="px-4 flex flex-col justify-center border-b border-neutral-50"
                style={{ height: ROW_H }}
              >
                <p className="text-sm text-navy-900 truncate leading-tight flex items-center gap-1.5">
                  <span
                    className={`w-1.5 h-3.5 rounded-sm flex-shrink-0 ${swatchFor(item).fill}`}
                    aria-hidden
                  />
                  <span className="font-mono text-[10px] text-navy-500">{item.code}</span>
                  <span className="truncate">{item.name}</span>
                </p>
                <p className="text-[10px] text-navy-500">
                  {item.startDate && item.endDate
                    ? `${toDateInput(item.startDate)} → ${toDateInput(item.endDate)}`
                    : "Not scheduled"}
                  {saving === item.id && " · saving…"}
                </p>
              </div>
            ))}
            {ordered.length === 0 && (
              <div className="px-4 py-8 text-center text-xs text-navy-500">No work packages</div>
            )}
            {canCreate && (
              <div
                className="px-4 flex items-center border-t-2 border-dashed border-navy-500/25 bg-neutral-50/40"
                style={{ height: ROW_H }}
              >
                <p className="text-[11px] font-medium text-navy-500/70">New work package</p>
              </div>
            )}
          </div>

          {/* Scrolling timeline */}
          <div ref={chartRef} className="flex-1 overflow-x-auto">
            <div style={{ width: chartWidth, minWidth: "100%" }} className="relative">
              {/* Ruler */}
              <div className="h-[52px] border-b border-neutral-100 bg-neutral-50/75 relative">
                {ruler.months.map((m) => (
                  <div
                    key={`${m.label}-${m.x}`}
                    className="absolute top-1.5 text-[11px] font-medium text-navy-700 border-l border-neutral-200 pl-1.5"
                    style={{ left: m.x, width: m.width }}
                  >
                    {m.label}
                  </div>
                ))}
                {ruler.ticks.map((t, i) => (
                  <div
                    key={i}
                    className={`absolute bottom-1 text-[9px] ${
                      t.major ? "text-navy-700 font-medium" : "text-navy-500/60"
                    }`}
                    style={{ left: t.x + 2 }}
                  >
                    {t.label}
                  </div>
                ))}
              </div>

              {/* Today */}
              {todayX >= 0 && todayX <= chartWidth && (
                <div
                  className="absolute top-[52px] bottom-0 border-l-2 border-dashed border-red-600/70 pointer-events-none z-20"
                  style={{ left: todayX }}
                />
              )}

              {/* Rows */}
              {ordered.map((item, rowIndex) => {
                const { start, end, progress } = previewFor(item);
                const style = swatchFor(item);
                const isDragging = drag?.itemId === item.id;

                return (
                  <div
                    key={item.id}
                    className="relative border-b border-neutral-50 hover:bg-navy-900/[0.015]"
                    style={{ height: ROW_H }}
                    onMouseDown={(e) => {
                      // A row belongs to its work package. Dragging the empty
                      // space beside a bar used to draw a brand-new package on
                      // top of an existing one, which is never what anybody
                      // means — so an unscheduled row schedules its own item,
                      // a scheduled one does nothing, and new packages come
                      // from the spare row at the bottom.
                      if (e.target !== e.currentTarget) return;
                      if (!start || !end) beginDrag(e, "schedule", item, rowIndex);
                    }}
                  >
                    {start && end ? (
                      <div
                        className={`absolute rounded-md ${style.bar} ${
                          isDragging ? "ring-2 ring-navy-700 z-30" : ""
                        } ${canReschedule ? "cursor-grab active:cursor-grabbing" : ""}`}
                        style={{
                          left: xFor(start),
                          width: Math.max(pxPerDay, (daysBetween(start, end) + 1) * pxPerDay),
                          top: 8,
                          height: ROW_H - 16,
                        }}
                        onMouseDown={(e) => beginDrag(e, "move", item, rowIndex)}
                        title={`${item.name} · ${progress}% · ${HEALTH_STYLE[healthOf(item, today)].label}`}
                      >
                        {/* Progress fill */}
                        <div
                          className={`absolute inset-y-0 left-0 rounded-md ${style.fill}`}
                          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                        />

                        {/* Label */}
                        <span className="absolute inset-0 flex items-center px-2 text-[10px] font-medium text-white mix-blend-luminosity pointer-events-none">
                          {progress > 0 ? `${progress}%` : ""}
                        </span>

                        {canReschedule && (
                          <>
                            <div
                              className="absolute left-0 inset-y-0 w-2 cursor-ew-resize rounded-l-md hover:bg-navy-900/25"
                              onMouseDown={(e) => beginDrag(e, "resize-start", item, rowIndex)}
                              title="Drag to change the start date"
                            />
                            <div
                              className="absolute right-0 inset-y-0 w-2 cursor-ew-resize rounded-r-md hover:bg-navy-900/25"
                              onMouseDown={(e) => beginDrag(e, "resize-end", item, rowIndex)}
                              title="Drag to change the end date"
                            />
                          </>
                        )}

                        {canUpdateProgress && (
                          <div
                            className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white border-2 border-navy-900 cursor-col-resize shadow-sm hover:scale-125 transition-transform"
                            style={{ left: `calc(${Math.min(100, Math.max(0, progress))}% - 5px)` }}
                            onMouseDown={(e) => beginDrag(e, "progress", item, rowIndex)}
                            title="Drag to set progress"
                          />
                        )}
                      </div>
                    ) : (
                      <div
                        className={`absolute inset-0 ${canReschedule ? "cursor-crosshair" : ""}`}
                        onMouseDown={(e) => beginDrag(e, "schedule", item, rowIndex)}
                      >
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-navy-500/50 italic pointer-events-none">
                          {canReschedule
                            ? "drag across this row to give it dates"
                            : "not scheduled"}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* The rectangle being drawn */}
              {drawsRange(drag?.kind) && drag?.previewStart && drag.previewEnd && (
                <div
                  className="absolute rounded-md bg-navy-900/25 border-2 border-dashed border-navy-700 pointer-events-none z-40"
                  style={{
                    left: xFor(drag.previewStart),
                    width: Math.max(
                      pxPerDay,
                      (daysBetween(drag.previewStart, drag.previewEnd) + 1) * pxPerDay
                    ),
                    top: 52 + drag.rowIndex * ROW_H + 8,
                    height: ROW_H - 16,
                  }}
                />
              )}

              {/* A spare row so there is always somewhere to draw */}
              {canCreate && (
                <div
                  className="relative border-t-2 border-dashed border-navy-500/25 bg-neutral-50/40 hover:bg-navy-900/[0.04] transition-colors cursor-crosshair"
                  style={{ height: ROW_H }}
                  onMouseDown={(e) => beginDrag(e, "create", null, ordered.length)}
                >
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-medium text-navy-500/70 pointer-events-none">
                    + drag anywhere on this row to add a NEW work package
                  </span>
                </div>
              )}

              {/* Milestones */}
              {milestones.filter((m) => m.dueDate).length > 0 && (
                <div className="relative border-t border-neutral-100 bg-neutral-50/40" style={{ height: 34 }}>
                  {milestones
                    .filter((m) => m.dueDate)
                    .map((m) => {
                      const date = parseDate(m.dueDate)!;
                      const overdue = m.status !== "completed" && date < startOfDay(new Date());
                      const colour =
                        m.status === "completed"
                          ? "bg-emerald-500"
                          : overdue
                            ? "bg-red-600"
                            : "bg-amber-500";
                      return (
                        <div
                          key={m.id}
                          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 group"
                          style={{ left: xFor(date) }}
                        >
                          <div className={`w-3 h-3 rotate-45 ${colour} shadow-sm`} />
                          <div className="absolute left-1/2 -translate-x-1/2 bottom-5 hidden group-hover:block whitespace-nowrap bg-navy-900 text-white text-[10px] rounded px-2 py-1 z-50">
                            {m.name} · {toDateInput(m.dueDate)}
                            {overdue && " · overdue"}
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* ── Name the drawn work package ──────────────────────── */}
      {newName && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-xl shadow-2xl p-6">
            <h3 className="text-lg font-bold text-navy-900 font-[family-name:var(--font-league-spartan)]">
              New work package
            </h3>
            <p className="text-sm text-navy-500 mt-1">
              {toISODate(newName.start)} → {toISODate(newName.end)} (
              {daysBetween(newName.start, newName.end) + 1} days)
            </p>

            <div className="mt-4 space-y-1.5">
              <label htmlFor="wbs-draft-name" className="block text-sm font-medium text-navy-900">
                Name
              </label>
              <input
                id="wbs-draft-name"
                autoFocus
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") createFromDraw();
                  if (e.key === "Escape") setNewName(null);
                }}
                placeholder="e.g. Integration testing"
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-navy-500/30 focus:outline-none focus:ring-2 focus:ring-navy-700/30 focus:border-navy-700"
              />
            </div>

            {error && (
              <div className="mt-3 bg-red-600/5 border border-red-600/20 text-red-600 text-sm rounded-lg px-4 py-3">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-3 mt-5">
              <Button variant="secondary" onClick={() => setNewName(null)}>
                Cancel
              </Button>
              <Button onClick={createFromDraw} disabled={!draftName.trim() || saving === "new"}>
                {saving === "new" ? "Adding…" : "Add to plan"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
