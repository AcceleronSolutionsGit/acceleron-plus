"use client";

import React, {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AppRole, Project, ProjectManagerRef } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { CodeChip, ColorBadge } from "@/components/ui/Badge";
import { Avatar, AvatarStack } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/Card";
import { Combobox } from "@/components/ui/Combobox";
import { SegmentedControl } from "@/components/ui/Tabs";
import { DropdownPanel } from "@/components/ui/DropdownPanel";
import { Toaster, toast } from "@/components/ui/Toast";
import { PmtHeaderTabs } from "@/components/layout/PmtHeaderTabs";
import {
  ManagerPickerPanel,
  prefetchPeople,
  type PickedManager,
} from "@/components/project/ManagerPicker";
import { cn, formatCurrency, formatStatus, projectStatusColor } from "@/lib/utils";
import { formatISODate, parseISODate, todayISO } from "@/lib/dates";
import { NewProjectModal } from "./NewProjectModal";

export const PHASES = [
  "Discovery",
  "Design",
  "Build",
  "Execution",
  "Testing",
  "UAT",
  "Go-Live",
  "Closure",
];

/** Kept for the service desk and project detail, which colour phases the same way. */
export function phaseColorClass(phase?: string) {
  switch (phase?.toLowerCase()) {
    case "discovery":
      return "bg-sky-50 text-sky-700 border-sky-200";
    case "design":
      return "bg-purple-50 text-purple-700 border-purple-200";
    case "build":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "execution":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "testing":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "uat":
      return "bg-orange-50 text-orange-700 border-orange-200";
    case "go-live":
      return "bg-teal-50 text-teal-700 border-teal-200";
    case "closure":
      return "bg-neutral-100 text-neutral-700 border-neutral-200";
    default:
      return "bg-neutral-50 text-neutral-600 border-neutral-200";
  }
}

// ─── Filters ────────────────────────────────────────────────────

type StatusGroup = "all" | "active" | "pipeline" | "on_hold" | "closed";
type SortKey = "recent" | "name" | "end" | "budget";

const STATUS_GROUPS: Record<Exclude<StatusGroup, "all">, string[]> = {
  active: ["active"],
  pipeline: ["initiated", "planning"],
  on_hold: ["on_hold"],
  closed: ["closed", "cancelled"],
};

function groupOf(status: string): Exclude<StatusGroup, "all"> {
  if (status === "active") return "active";
  if (status === "on_hold") return "on_hold";
  if (status === "closed" || status === "cancelled") return "closed";
  return "pipeline";
}

interface Filters {
  q: string;
  status: StatusGroup;
  phase: string;
  manager: string; // "all" | "none" | a manager key
  sort: SortKey;
}

const DEFAULT_FILTERS: Filters = { q: "", status: "all", phase: "all", manager: "all", sort: "recent" };
const FILTER_STORAGE_KEY = "pmt.projects.filters.v1";
const PAGE = 30;

function readStoredFilters(): Filters {
  try {
    const raw = sessionStorage.getItem(FILTER_STORAGE_KEY);
    if (!raw) return DEFAULT_FILTERS;
    return { ...DEFAULT_FILTERS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_FILTERS;
  }
}

// ─── Small formatters ───────────────────────────────────────────

/** ₹50,00,000 → ₹50 L; the full figure stays in the tooltip. */
function compactINR(value: number | string | undefined | null): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (n === undefined || n === null || Number.isNaN(n)) return "—";
  if (Math.abs(n) >= 1e7) return `₹${trim(n / 1e7)} Cr`;
  if (Math.abs(n) >= 1e5) return `₹${trim(n / 1e5)} L`;
  if (Math.abs(n) >= 1e3) return `₹${trim(n / 1e3)} K`;
  return `₹${Math.round(n)}`;
}
const trim = (n: number) => (Math.round(n * 10) / 10).toString();

interface TimelineInfo {
  percent: number | null;
  label: string;
  tone: "muted" | "normal" | "soon" | "late" | "done";
}

function timelineFor(project: Project, today: Date): TimelineInfo {
  const start = parseISODate(project.startDate);
  const end = parseISODate(project.plannedEndDate);
  const closed = project.status === "closed" || project.status === "cancelled";
  const day = 86_400_000;

  if (closed) return { percent: 100, label: formatStatus(project.status), tone: "done" };
  if (!start && !end) return { percent: null, label: "Dates not set", tone: "muted" };
  if (start && today < start) {
    const days = Math.ceil((start.getTime() - today.getTime()) / day);
    return { percent: 0, label: `Starts in ${days}d`, tone: "muted" };
  }
  if (!end) return { percent: null, label: "No end date", tone: "muted" };

  const left = Math.round((end.getTime() - today.getTime()) / day);
  if (left < 0) return { percent: 100, label: `${-left}d overdue`, tone: "late" };

  const percent = start
    ? Math.min(100, Math.max(0, ((today.getTime() - start.getTime()) / Math.max(day, end.getTime() - start.getTime())) * 100))
    : null;
  if (left === 0) return { percent, label: "Due today", tone: "soon" };
  return { percent, label: `${left}d left`, tone: left <= 14 ? "soon" : "normal" };
}

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

// ═══════════════════════════════════════════════════════════════

export function ProjectListClient({
  projects: initialProjects,
  userRole = "member",
}: {
  projects: Project[];
  userRole?: AppRole;
}) {
  const router = useRouter();
  const canManagePMs = userRole === "admin";

  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [restored, setRestored] = useState(false);
  const [visible, setVisible] = useState(PAGE);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [today] = useState(() => parseISODate(todayISO())!);

  const searchRef = useRef<HTMLInputElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const deferredQuery = useDeferredValue(filters.q);

  // Filters survive opening a project and coming back.
  useEffect(() => {
    setFilters(readStoredFilters());
    setRestored(true);
    prefetchPeople();
  }, []);
  useEffect(() => {
    if (!restored) return;
    try {
      sessionStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filters));
    } catch {
      /* storage unavailable — filters just won't persist */
    }
  }, [filters, restored]);

  const update = useCallback(<K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setVisible(PAGE);
  }, []);

  // "/" to search, "n" for a new project.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        setIsCreateOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // ── Counts, in one pass ───────────────────────────────────────
  const stats = useMemo(() => {
    const byGroup = { active: 0, pipeline: 0, on_hold: 0, closed: 0 };
    const byPhase = new Map<string, number>();
    const byManager = new Map<string, { name: string; count: number }>();
    const clients = new Set<string>();
    let noManager = 0;
    let overdue = 0;

    for (const p of projects) {
      byGroup[groupOf(p.status)] += 1;
      const phase = p.currentPhase || "Discovery";
      byPhase.set(phase, (byPhase.get(phase) ?? 0) + 1);
      if (p.clientCompanyName) clients.add(p.clientCompanyName.trim().toLowerCase());
      const managers = p.managers ?? [];
      if (managers.length === 0) noManager += 1;
      for (const m of managers) {
        const entry = byManager.get(m.key) ?? { name: m.fullName, count: 0 };
        entry.count += 1;
        byManager.set(m.key, entry);
      }
      if (timelineFor(p, today).tone === "late") overdue += 1;
    }
    return { byGroup, byPhase, byManager, clients: clients.size, noManager, overdue };
  }, [projects, today]);

  // ── Filter + sort ─────────────────────────────────────────────
  const filtered = useMemo(() => {
    const terms = deferredQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const list = projects.filter((p) => {
      if (filters.status !== "all" && !STATUS_GROUPS[filters.status].includes(p.status)) return false;
      if (filters.phase !== "all" && (p.currentPhase || "Discovery") !== filters.phase) return false;
      const managers = p.managers ?? [];
      if (filters.manager === "none" && managers.length > 0) return false;
      if (filters.manager !== "all" && filters.manager !== "none" && !managers.some((m) => m.key === filters.manager)) {
        return false;
      }
      if (terms.length === 0) return true;
      const haystack = [p.code, p.name, p.clientCompanyName, p.description, ...managers.map((m) => m.fullName)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return terms.every((t) => haystack.includes(t));
    });

    const endTime = (p: Project) => parseISODate(p.plannedEndDate)?.getTime() ?? Number.POSITIVE_INFINITY;
    switch (filters.sort) {
      case "name":
        list.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "end":
        list.sort((a, b) => endTime(a) - endTime(b));
        break;
      case "budget":
        list.sort((a, b) => Number(b.budgetInr ?? -1) - Number(a.budgetInr ?? -1));
        break;
      default:
        break; // already newest first from the server
    }
    return list;
  }, [projects, deferredQuery, filters.status, filters.phase, filters.manager, filters.sort]);

  const shown = filtered.slice(0, visible);
  const hasFilters =
    filters.q.trim() !== "" || filters.status !== "all" || filters.phase !== "all" || filters.manager !== "all";

  // Draw more rows as the end of the list comes into view.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || visible >= filtered.length) return;
    const observer = new IntersectionObserver(
      (entries) => entries[0]?.isIntersecting && setVisible((v) => v + PAGE),
      { rootMargin: "600px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible, filtered.length]);

  // ── Editing managers ──────────────────────────────────────────
  const anchorRef = useRef<HTMLElement | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingProject = editingId ? projects.find((p) => p.id === editingId) ?? null : null;

  const openManagers = useCallback((projectId: string, anchor: HTMLElement) => {
    anchorRef.current = anchor;
    setEditingId(projectId);
  }, []);
  const closeManagers = useCallback(() => {
    setEditingId(null);
    anchorRef.current?.focus();
  }, []);

  const flash = useCallback((id: string) => {
    setFlashId(id);
    window.setTimeout(() => setFlashId((current) => (current === id ? null : current)), 1800);
  }, []);

  const saveManagers = useCallback(
    async (project: Project, next: PickedManager[]) => {
      const previous = project.managers ?? [];
      const optimistic: ProjectManagerRef[] = next.map((m, i) => ({ ...m, isLead: i === 0 }));
      setProjects((list) => list.map((p) => (p.id === project.id ? { ...p, managers: optimistic } : p)));
      setEditingId(null);

      try {
        const res = await fetch(`/api/pmt/projects/${project.id}/managers`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ managers: next.map((m) => m.key) }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.success) throw new Error(data?.error ?? "The change was not saved.");
        setProjects((list) =>
          list.map((p) => (p.id === project.id ? { ...p, managers: data.managers as ProjectManagerRef[] } : p))
        );
        flash(project.id);
        toast.success(
          next.length === 0 ? `PMs cleared on ${project.code}` : `PMs updated on ${project.code}`,
          {
            description:
              next.length === 0
                ? undefined
                : `${next[0].fullName} leads${next.length > 1 ? ` with ${next.length - 1} more` : ""}.`,
          }
        );
      } catch (err) {
        setProjects((list) => list.map((p) => (p.id === project.id ? { ...p, managers: previous } : p)));
        toast.error("Couldn't update the PMs", { description: (err as Error).message });
      }
    },
    [flash]
  );

  // ── After creating ────────────────────────────────────────────
  const onCreated = useCallback(
    async (created: { id: string; code: string; name: string }, managersError: string | null) => {
      setIsCreateOpen(false);
      setFilters((f) => ({ ...f, q: "", status: "all", phase: "all", manager: "all" }));
      try {
        const res = await fetch("/api/pmt/projects");
        const data = await res.json();
        if (res.ok && Array.isArray(data.projects)) setProjects(data.projects);
        else router.refresh();
      } catch {
        router.refresh();
      }
      flash(created.id);
      // Newest sits at the top — bring it into view so the highlight is seen.
      document.querySelector("main")?.scrollTo({ top: 0, behavior: "smooth" });
      toast.success(`${created.code} created`, {
        description: created.name,
        action: { label: "Open", onClick: () => router.push(`/pmt/${created.code}`) },
      });
      if (managersError) toast.error("The project was created, but its PMs were not set", { description: managersError });
    },
    [flash, router]
  );

  const openProject = useCallback((p: Project) => router.push(`/pmt/${p.code || p.id}`), [router]);
  const prefetchProject = useCallback((p: Project) => router.prefetch(`/pmt/${p.code || p.id}`), [router]);

  // ── Options ───────────────────────────────────────────────────
  const statusOptions: { value: StatusGroup; label: React.ReactNode }[] = [
    { value: "all", label: <SegLabel text="All" count={projects.length} /> },
    { value: "active", label: <SegLabel text="Active" count={stats.byGroup.active} /> },
    { value: "pipeline", label: <SegLabel text="Pipeline" count={stats.byGroup.pipeline} /> },
    { value: "on_hold", label: <SegLabel text="On hold" count={stats.byGroup.on_hold} /> },
    { value: "closed", label: <SegLabel text="Closed" count={stats.byGroup.closed} /> },
  ];

  const managerOptions = useMemo(
    () => [
      { value: "all", label: "All managers" },
      { value: "none", label: "No PM assigned", hint: String(stats.noManager) },
      ...[...stats.byManager.entries()]
        .sort((a, b) => a[1].name.localeCompare(b[1].name))
        .map(([key, v]) => ({ value: key, label: v.name, hint: String(v.count) })),
    ],
    [stats]
  );

  const clientNames = useMemo(
    () =>
      [...new Set(projects.map((p) => p.clientCompanyName?.trim()).filter((n): n is string => Boolean(n)))].sort(),
    [projects]
  );

  return (
    <div className="space-y-5">
      <PmtHeaderTabs
        title="Projects"
        subtitle={`${projects.length} live project${projects.length === 1 ? "" : "s"} across ${stats.clients} client${stats.clients === 1 ? "" : "s"} — delivery, owners and timelines in one place.`}
        action={
          <div className="flex items-center gap-2">
            {userRole === "admin" && (
              <Link
                href="/pmt/scrapped"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium text-navy-500 transition-colors hover:bg-navy-900/6 hover:text-navy-900"
              >
                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M2.5 4.5h11M6 4.5V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M4 4.5l.7 8.6a1 1 0 0 0 1 .9h4.6a1 1 0 0 0 1-.9l.7-8.6" />
                </svg>
                Scrapped
              </Link>
            )}
            <Button data-guide="project:new" onClick={() => setIsCreateOpen(true)}>
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
              New project
              <kbd className="ml-1 hidden rounded border border-white/25 px-1 font-mono text-[10px] leading-4 text-white/70 sm:inline">N</kbd>
            </Button>
          </div>
        }
      />

      {/* ── Snapshot — each tile is also a filter ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiTile
          label="All projects"
          value={projects.length}
          hint={`${stats.clients} clients`}
          active={filters.status === "all" && filters.manager === "all"}
          onClick={() => setFilters((f) => ({ ...f, status: "all", manager: "all" }))}
          icon={<path d="M2.5 5.5a1.5 1.5 0 0 1 1.5-1.5h3l1.5 1.5H14a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 13z" />}
        />
        <KpiTile
          label="In delivery"
          value={stats.byGroup.active}
          hint={projects.length ? `${Math.round((stats.byGroup.active / projects.length) * 100)}% of portfolio` : "—"}
          tone="positive"
          active={filters.status === "active"}
          onClick={() => update("status", filters.status === "active" ? "all" : "active")}
          icon={<path d="M3 9.5 7 13l7-9" />}
        />
        <KpiTile
          label="Pipeline"
          value={stats.byGroup.pipeline}
          hint="Initiated & planning"
          tone="info"
          active={filters.status === "pipeline"}
          onClick={() => update("status", filters.status === "pipeline" ? "all" : "pipeline")}
          icon={<path d="M3 4.5h12M5 9h8M7 13.5h4" />}
        />
        <KpiTile
          label="Overdue"
          value={stats.overdue}
          hint={`${stats.byGroup.on_hold} on hold`}
          tone={stats.overdue > 0 ? "critical" : "default"}
          active={filters.sort === "end"}
          onClick={() => update("sort", filters.sort === "end" ? "recent" : "end")}
          icon={<><circle cx="9" cy="9" r="6" /><path d="M9 5.5V9l2.2 1.6" /></>}
        />
        <KpiTile
          label="No PM assigned"
          value={stats.noManager}
          hint={stats.noManager ? "Needs an owner" : "Every project has one"}
          tone={stats.noManager > 0 ? "warning" : "positive"}
          active={filters.manager === "none"}
          onClick={() => update("manager", filters.manager === "none" ? "all" : "none")}
          icon={<><circle cx="9" cy="6.5" r="2.6" /><path d="M4 15c.6-2.6 2.6-4 5-4s4.4 1.4 5 4" /></>}
        />
      </div>

      {/* ── Toolbar ── */}
      <div className="flex flex-col gap-3 rounded-xl border border-navy-900/8 bg-surface p-3 shadow-xs xl:flex-row xl:items-center">
        <div className="relative w-full xl:w-72 xl:shrink-0">
          <svg aria-hidden viewBox="0 0 16 16" className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-navy-300" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <circle cx="7" cy="7" r="4.5" />
            <path d="m10.5 10.5 3 3" />
          </svg>
          <input
            ref={searchRef}
            type="search"
            value={filters.q}
            onChange={(e) => update("q", e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && update("q", "")}
            placeholder="Search projects, clients, PMs…"
            aria-label="Search projects"
            className={cn(
              "h-9 w-full rounded-lg border border-navy-900/12 bg-surface-2 pl-9 pr-9 text-[13px] text-navy-900",
              "placeholder:text-navy-300 transition-[border-color,background,box-shadow] duration-200",
              "focus:border-navy-700 focus:bg-surface focus:shadow-[0_0_0_3px_rgb(33_47_96_/_0.12)] focus:outline-none",
              "[&::-webkit-search-cancel-button]:hidden"
            )}
          />
          {filters.q ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => update("q", "")}
              className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer rounded-md p-1 text-navy-300 transition-colors hover:bg-navy-900/6 hover:text-navy-700"
            >
              <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          ) : (
            <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-navy-900/12 bg-surface px-1.5 font-mono text-[10px] leading-4 text-navy-300">
              /
            </kbd>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <div className="-mx-1 max-w-full overflow-x-auto px-1">
          <SegmentedControl size="sm" options={statusOptions} value={filters.status} onChange={(v) => update("status", v)} />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Combobox
            className="w-[132px] xl:w-[150px]"
            value={filters.phase}
            onChange={(v) => update("phase", v)}
            placeholder="All phases"
            searchThreshold={99}
            options={[
              { value: "all", label: "All phases" },
              ...PHASES.map((ph) => ({ value: ph, label: ph, hint: String(stats.byPhase.get(ph) ?? 0) })),
            ]}
          />
          <Combobox
            className="w-[172px] xl:w-[190px]"
            value={filters.manager}
            onChange={(v) => update("manager", v)}
            placeholder="All managers"
            searchPlaceholder="Find a PM…"
            options={managerOptions}
          />
        </div>
        </div>
      </div>

      {/* ── Result line ── */}
      <div className="-mb-1 flex min-h-8 items-center justify-between px-1 text-[12.5px] text-navy-400">
        <span>
          {hasFilters ? (
            <>
              <span className="font-semibold text-navy-700">{filtered.length}</span> of {projects.length} projects
            </>
          ) : (
            <>
              <span className="font-semibold text-navy-700">{projects.length}</span> projects
            </>
          )}
        </span>
        <span className="flex items-center gap-2">
          {hasFilters && (
            <button
              type="button"
              onClick={() => {
                setFilters((f) => ({ ...DEFAULT_FILTERS, sort: f.sort }));
                setVisible(PAGE);
              }}
              className="cursor-pointer rounded-md px-2 py-1 font-semibold text-navy-600 transition-colors hover:bg-navy-900/6 hover:text-navy-900"
            >
              Clear filters
            </button>
          )}
          <span className="text-navy-300">Sort</span>
          <Combobox
            className="h-8 w-[150px] text-[12.5px]"
            value={filters.sort}
            onChange={(v) => update("sort", v as SortKey)}
            searchThreshold={99}
            aria-label="Sort projects"
            options={[
              { value: "recent", label: "Newest first" },
              { value: "name", label: "Name A–Z" },
              { value: "end", label: "Ending soonest" },
              { value: "budget", label: "Largest budget" },
            ]}
          />
        </span>
      </div>

      {/* ── The list ── */}
      {projects.length === 0 ? (
        <EmptyState
          title="No projects yet"
          description="Create the first one, or import sales orders and they will appear here."
          action={<Button onClick={() => setIsCreateOpen(true)}>New project</Button>}
          icon={<svg viewBox="0 0 18 18" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2.5 5.5a1.5 1.5 0 0 1 1.5-1.5h3l1.5 1.5H14a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 13z" /></svg>}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Nothing matches"
          description={filters.q ? <>No project matches &ldquo;{filters.q}&rdquo; with these filters.</> : "No project matches these filters."}
          action={
            <Button variant="secondary" onClick={() => setFilters((f) => ({ ...DEFAULT_FILTERS, sort: f.sort }))}>
              Clear filters
            </Button>
          }
          icon={<svg viewBox="0 0 16 16" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="7" cy="7" r="4.5" /><path d="m10.5 10.5 3 3" /></svg>}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-navy-900/8 bg-surface shadow-xs xl:overflow-x-visible">
          <table className="w-full min-w-[1080px] border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                {[
                  ["Project", "w-[30%]"],
                  ["Client", ""],
                  ["Phase", ""],
                  ["Status", ""],
                  ["Project managers", "w-[210px]"],
                  ["Timeline", "w-[200px]"],
                  ["Budget", "text-right"],
                ].map(([label, cls], i, all) => (
                  <th
                    key={label}
                    scope="col"
                    className={cn(
                      "sticky -top-6 z-10 border-b border-navy-900/10 bg-surface-2 px-4 py-2.5 text-left",
                      "whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.07em] text-navy-500",
                      i === 0 && "rounded-tl-xl",
                      i === all.length - 1 && "rounded-tr-xl",
                      cls
                    )}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <ProjectRow
                  key={p.id}
                  project={p}
                  today={today}
                  flash={flashId === p.id}
                  editing={editingId === p.id}
                  canManagePMs={canManagePMs}
                  onOpen={openProject}
                  onPrefetch={prefetchProject}
                  onEditManagers={openManagers}
                />
              ))}
            </tbody>
          </table>
          {visible < filtered.length && (
            <div ref={sentinelRef} className="flex items-center justify-center gap-2 border-t border-navy-900/6 py-4 text-[12.5px] text-navy-400">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-navy-900/15 border-t-navy-500" />
              Loading more…
            </div>
          )}
        </div>
      )}

      {/* ── One manager editor for the whole table ── */}
      <DropdownPanel
        anchorRef={anchorRef}
        open={Boolean(editingProject)}
        onClose={closeManagers}
        align="left"
        width={380}
        estimatedHeight={460}
        role="dialog"
        label="Project managers"
      >
        {editingProject && (
          <ManagersEditor project={editingProject} onCancel={closeManagers} onSave={saveManagers} />
        )}
      </DropdownPanel>

      <NewProjectModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreated={onCreated}
        phases={PHASES}
        clientNames={clientNames}
      />

      <Toaster />
    </div>
  );
}

// ─── Pieces ─────────────────────────────────────────────────────

function SegLabel({ text, count }: { text: string; count: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      {text}
      <span className="rounded-[5px] bg-navy-900/6 px-1 text-[10.5px] tabular-nums text-navy-400">{count}</span>
    </span>
  );
}

function KpiTile({
  label,
  value,
  hint,
  icon,
  tone = "default",
  active,
  onClick,
}: {
  label: string;
  value: number;
  hint: string;
  icon: React.ReactNode;
  tone?: "default" | "positive" | "info" | "warning" | "critical";
  active: boolean;
  onClick: () => void;
}) {
  const toneClass = {
    default: "bg-navy-900/6 text-navy-600",
    positive: "bg-success-bg text-success",
    info: "bg-info-bg text-info",
    warning: "bg-warning-bg text-warning",
    critical: "bg-danger-bg text-danger",
  }[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "group relative flex cursor-pointer items-start justify-between gap-3 overflow-hidden rounded-xl border bg-surface p-4 text-left",
        "shadow-xs transition-[border-color,box-shadow,transform] duration-200 ease-[var(--ease-out-soft)]",
        "hover:-translate-y-px hover:shadow-md active:translate-y-0",
        active ? "border-navy-700/60 shadow-[0_0_0_3px_rgb(33_47_96_/_0.08)]" : "border-navy-900/8 hover:border-navy-900/16"
      )}
    >
      <span className="min-w-0">
        <span className="block whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.08em] text-navy-400">{label}</span>
        <span data-numeric className="text-display mt-1.5 block text-[26px] font-bold leading-none tracking-[-0.02em] text-navy-900">
          {value}
        </span>
        <span className="mt-1.5 block truncate text-[11.5px] text-navy-400">{hint}</span>
      </span>
      <span className={cn("hidden h-8 w-8 shrink-0 place-items-center rounded-lg transition-transform duration-200 group-hover:scale-105 sm:grid lg:hidden xl:grid", toneClass)}>
        <svg viewBox="0 0 18 18" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          {icon}
        </svg>
      </span>
      {active && <span aria-hidden className="absolute inset-x-0 bottom-0 h-[2px] bg-red-600" />}
    </button>
  );
}

const ProjectRow = memo(function ProjectRow({
  project: p,
  today,
  flash,
  editing,
  canManagePMs,
  onOpen,
  onPrefetch,
  onEditManagers,
}: {
  project: Project;
  today: Date;
  flash: boolean;
  editing: boolean;
  canManagePMs: boolean;
  onOpen: (p: Project) => void;
  onPrefetch: (p: Project) => void;
  onEditManagers: (projectId: string, anchor: HTMLElement) => void;
}) {
  const prefetched = useRef(false);
  const phase = p.currentPhase || "Discovery";
  const phaseIndex = Math.max(0, PHASES.indexOf(phase));
  const timeline = timelineFor(p, today);
  const href = `/pmt/${p.code || p.id}`;

  const cell = "border-b border-navy-900/6 px-4 py-3 align-middle";

  return (
    <tr
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a,button")) return;
        if (window.getSelection()?.toString()) return; // selecting text, not opening
        onOpen(p);
      }}
      onMouseEnter={() => {
        if (prefetched.current) return;
        prefetched.current = true;
        onPrefetch(p);
      }}
      className={cn(
        "group cursor-pointer transition-colors duration-150 hover:bg-navy-50/60 [&:last-child>td]:border-b-0",
        flash && "animate-[row-flash_1.8s_var(--ease-out-soft)_both]"
      )}
    >
      {/* Project */}
      <td className={cn(cell, "relative")}>
        <span aria-hidden className="absolute inset-y-2 left-0 w-[3px] origin-center scale-y-0 rounded-r bg-red-600 transition-transform duration-200 ease-[var(--ease-out-soft)] group-hover:scale-y-100" />
        <div className="flex min-w-0 items-start gap-2.5">
          <CodeChip className="mt-0.5 shrink-0">{p.code}</CodeChip>
          <div className="min-w-0">
            <Link
              href={href}
              prefetch={false}
              className="block truncate font-semibold text-navy-900 underline-offset-2 transition-colors hover:text-navy-700 hover:underline"
            >
              {p.name}
            </Link>
            <p className="mt-0.5 line-clamp-1 text-[12px] text-navy-400">{p.description || "No description"}</p>
          </div>
        </div>
      </td>

      {/* Client */}
      <td className={cell}>
        <span className={cn("block max-w-[180px] truncate text-[13px]", p.clientCompanyName ? "font-medium text-navy-700" : "text-navy-300")}>
          {p.clientCompanyName || "Internal"}
        </span>
      </td>

      {/* Phase */}
      <td className={cell}>
        <div className="w-[104px]">
          <span className="text-[12.5px] font-semibold text-navy-800">{phase}</span>
          <div className="mt-1.5 flex gap-[3px]" aria-label={`Phase ${phaseIndex + 1} of ${PHASES.length}`}>
            {PHASES.map((ph, i) => (
              <span
                key={ph}
                className={cn("h-1 flex-1 rounded-full", i <= phaseIndex ? "bg-navy-700" : "bg-navy-900/10")}
              />
            ))}
          </div>
        </div>
      </td>

      {/* Status */}
      <td className={cell}>
        <ColorBadge colorClass={projectStatusColor(p.status)}>{formatStatus(p.status)}</ColorBadge>
      </td>

      {/* Managers */}
      <td className={cell}>
        <ManagersCell
          managers={p.managers ?? []}
          editable={canManagePMs}
          active={editing}
          onEdit={(el) => onEditManagers(p.id, el)}
        />
      </td>

      {/* Timeline */}
      <td className={cell}>
        <div className="whitespace-nowrap text-[12px] tabular-nums text-navy-500">
          {p.startDate || p.plannedEndDate ? (
            <>
              {formatISODate(p.startDate, { day: "2-digit", month: "short" })}
              <span className="mx-1 text-navy-300">→</span>
              {formatISODate(p.plannedEndDate, { day: "2-digit", month: "short", year: "2-digit" })}
            </>
          ) : (
            <span className="text-navy-300">—</span>
          )}
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-navy-900/8">
            {timeline.percent !== null && (
              <div
                className={cn(
                  "h-full rounded-full",
                  timeline.tone === "late" ? "bg-danger" : timeline.tone === "soon" ? "bg-warning" : timeline.tone === "done" ? "bg-navy-300" : "bg-success"
                )}
                style={{ width: `${timeline.percent > 0 ? Math.max(3, timeline.percent) : 0}%` }}
              />
            )}
          </div>
          <span
            className={cn(
              "shrink-0 text-[11px] font-semibold",
              timeline.tone === "late" && "text-danger",
              timeline.tone === "soon" && "text-warning",
              (timeline.tone === "muted" || timeline.tone === "done") && "text-navy-300",
              timeline.tone === "normal" && "text-navy-500"
            )}
          >
            {timeline.label}
          </span>
        </div>
      </td>

      {/* Budget */}
      <td className={cn(cell, "text-right")}>
        <span
          title={p.budgetInr ? formatCurrency(Number(p.budgetInr)) : undefined}
          className={cn("text-[13px] font-semibold tabular-nums", p.budgetInr ? "text-navy-800" : "text-navy-300")}
        >
          {p.budgetInr ? compactINR(p.budgetInr) : "—"}
        </span>
      </td>
    </tr>
  );
});

function ManagersCell({
  managers,
  editable,
  active,
  onEdit,
}: {
  managers: ProjectManagerRef[];
  editable: boolean;
  active: boolean;
  onEdit: (anchor: HTMLElement) => void;
}) {
  const lead = managers[0];

  const content =
    managers.length === 0 ? (
      <span className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border border-dashed px-2.5 py-1.5 text-[12.5px] font-medium transition-colors",
        editable ? "border-warning/40 bg-warning-bg/40 text-warning group-hover/pm:border-warning/70 group-hover/pm:bg-warning-bg" : "border-navy-900/15 text-navy-300"
      )}>
        {editable && (
          <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M8 3v10M3 8h10" />
          </svg>
        )}
        {editable ? "Assign PM" : "Unassigned"}
      </span>
    ) : (
      <span className="flex min-w-0 items-center gap-2.5">
        {managers.length === 1 ? (
          <Avatar name={lead.fullName} size="sm" />
        ) : (
          <AvatarStack names={managers.map((m) => m.fullName)} max={3} size="sm" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-semibold text-navy-900">
            {lead.fullName}
            {managers.length > 1 && <span className="font-medium text-navy-400"> +{managers.length - 1}</span>}
          </span>
          <span className="block truncate text-[11px] text-navy-400">
            {managers.length > 1 ? `Lead · ${managers.length} PMs` : lead.jobLevel ? `Lead PM · ${lead.jobLevel}` : "Lead PM"}
          </span>
        </span>
        {editable && (
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 text-navy-300 opacity-0 transition-opacity duration-150 group-hover/pm:opacity-100" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M10.5 2.8 13.2 5.5 6 12.7l-3.2.5.5-3.2z" />
          </svg>
        )}
      </span>
    );

  if (!editable) return <div title={managers.map((m) => m.fullName).join(", ")}>{content}</div>;

  return (
    <button
      type="button"
      onClick={(e) => onEdit(e.currentTarget)}
      aria-haspopup="dialog"
      aria-expanded={active}
      title={managers.length ? `PMs: ${managers.map((m) => m.fullName).join(", ")} — click to change` : "Assign a project manager"}
      className={cn(
        "group/pm -mx-2 -my-1 flex w-[calc(100%+1rem)] cursor-pointer items-center rounded-lg px-2 py-1 text-left transition-colors duration-150",
        active ? "bg-navy-900/7" : "hover:bg-navy-900/5"
      )}
    >
      {content}
    </button>
  );
}

function ManagersEditor({
  project,
  onCancel,
  onSave,
}: {
  project: Project;
  onCancel: () => void;
  onSave: (project: Project, next: PickedManager[]) => void;
}) {
  const initial = useMemo<PickedManager[]>(
    () =>
      (project.managers ?? []).map((m) => ({
        key: m.key,
        fullName: m.fullName,
        jobLevel: m.jobLevel,
        employeeId: m.employeeId,
        userId: m.userId,
      })),
    [project.managers]
  );
  const [draft, setDraft] = useState<PickedManager[]>(initial);
  const changed = draft.map((d) => d.key).join("|") !== initial.map((d) => d.key).join("|");

  return (
    <div>
      <div className="border-b border-navy-900/8 px-3.5 pb-2.5 pt-3">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-navy-400">Project managers</p>
        <p className="mt-0.5 truncate text-[13.5px] font-semibold text-navy-900">
          <span className="font-mono text-[12px] font-medium text-navy-400">{project.code}</span> · {project.name}
        </p>
      </div>
      <ManagerPickerPanel
        value={draft}
        onChange={setDraft}
        onClose={onCancel}
        footer={
          <>
            <span className="text-[11.5px] leading-snug text-navy-400">
              First is the lead. New PMs join the team at 0%.
            </span>
            <span className="flex shrink-0 gap-1.5">
              <Button size="sm" variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
              <Button size="sm" disabled={!changed} onClick={() => onSave(project, draft)}>
                Save
              </Button>
            </span>
          </>
        }
      />
    </div>
  );
}
