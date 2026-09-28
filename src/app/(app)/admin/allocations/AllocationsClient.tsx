"use client";

import { withBase } from "@/lib/base-path";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { StatCard, SectionHeading, EmptyState } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Checkbox } from "@/components/ui/Input";
import { Badge, CodeChip } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import type { AllocationReport, AllocationRow, AllocationState } from "@/lib/allocations";
import { Combobox } from "@/components/ui/Combobox";

const STATE: Record<
  AllocationState,
  { label: string; badge: "neutral" | "info" | "success" | "warning" | "critical" }
> = {
  bench: { label: "On bench", badge: "warning" },
  under: { label: "Partly allocated", badge: "info" },
  full: { label: "Fully allocated", badge: "success" },
  over: { label: "Over-allocated", badge: "critical" },
};

type SortKey = "employeeId" | "fullName" | "department" | "location" | "totalPercent";

export function AllocationsClient() {
  const [report, setReport] = useState<AllocationReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [department, setDepartment] = useState("");
  const [location, setLocation] = useState("");
  const [search, setSearch] = useState("");
  const [asOf, setAsOf] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [onlyProblems, setOnlyProblems] = useState(false);

  const [sortKey, setSortKey] = useState<SortKey>("employeeId");
  const [sortDesc, setSortDesc] = useState(false);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (department) p.set("department", department);
    if (location) p.set("location", location);
    if (search.trim()) p.set("search", search.trim());
    if (asOf) p.set("asOf", asOf);
    if (includeInactive) p.set("includeInactive", "1");
    return p;
  }, [department, location, search, asOf, includeInactive]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/reports/allocations?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not load the allocation report.");
        return;
      }
      setReport(data.report);
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [params]);

  // Debounced so typing in the search box does not fire a query per
  // keystroke against every employee and every assignment.
  useEffect(() => {
    const timer = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  const rows = useMemo(() => {
    if (!report) return [];
    const list = onlyProblems
      ? report.rows.filter((r) => r.state === "over" || r.state === "bench")
      : report.rows;

    const direction = sortDesc ? -1 : 1;
    return [...list].sort((a, b) => {
      if (sortKey === "totalPercent") {
        return (a.totalPercent - b.totalPercent) * direction;
      }
      const av = String(a[sortKey] ?? "");
      const bv = String(b[sortKey] ?? "");
      return av.localeCompare(bv) * direction;
    });
  }, [report, onlyProblems, sortKey, sortDesc]);

  const slots = Math.max(1, report?.maxProjects ?? 1);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDesc((d) => !d);
    } else {
      setSortKey(key);
      // Percentages are most useful largest-first; names alphabetically.
      setSortDesc(key === "totalPercent");
    }
  };

  const exportHref = (format: "xlsx" | "csv") => {
    const p = new URLSearchParams(params);
    p.set("format", format);
    return withBase(`/api/reports/allocations/export?${p.toString()}`);
  };

  const s = report?.summary;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="min-w-0">
          <h1 className="text-display text-[26px] font-bold leading-tight tracking-[-0.025em] text-navy-900">
            Resource Allocation
          </h1>
          <p className="mt-1.5 text-[13.5px] leading-snug text-navy-500">
            Every person in the employee master, what they are allocated to, and
            how much of them is left.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link href="/admin/allocations/import">
            <Button variant="ghost" size="sm">
              <UploadIcon />
              Import from Forms
            </Button>
          </Link>
          <Button data-guide="alloc:csv" variant="secondary" size="sm" onClick={() => { window.location.href = exportHref("csv"); }}>
            <DownloadIcon />
            CSV
          </Button>
          <Button data-guide="alloc:xlsx" size="sm" onClick={() => { window.location.href = exportHref("xlsx"); }}>
            <DownloadIcon />
            Export to Excel
          </Button>
        </div>
      </div>

      {/* ── Summary ──────────────────────────────────────────── */}
      <div data-guide="alloc:tiles" className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Headcount" value={s?.headcount ?? "—"} icon={<PeopleIcon />} />
        <StatCard
          label="Allocated"
          value={s?.allocated ?? "—"}
          tone="positive"
          icon={<CheckIcon />}
          hint={s ? `${s.committedFte} FTE committed` : undefined}
        />
        <StatCard
          label="On bench"
          value={s?.onBench ?? "—"}
          tone={s && s.onBench > 0 ? "warning" : "default"}
          icon={<BenchIcon />}
          hint="No live project"
        />
        <StatCard
          label="Over-allocated"
          value={s?.overAllocated ?? "—"}
          tone={s && s.overAllocated > 0 ? "critical" : "default"}
          icon={<AlertIcon />}
          hint="Above 100%"
        />
        <StatCard
          label="Avg utilisation"
          value={s ? `${s.averageUtilisation}%` : "—"}
          icon={<GaugeIcon />}
          hint="Across everyone"
        />
      </div>

      {/* ── Filters ──────────────────────────────────────────── */}
      <div data-guide="alloc:filters" className="rounded-xl border border-navy-900/8 bg-surface p-4 shadow-xs">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <Input
            label="Search"
            placeholder="Code, name, email or designation"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leading={<SearchIcon />}
          />
          <Combobox
            label="Department"
            value={department}
            onChange={setDepartment}
            placeholder="All departments"
            searchPlaceholder="Search departments…"
            options={[
              { value: "", label: "All departments", hint: String(report?.rows.length ?? 0) },
              ...(report?.filters.departments ?? []).map((d) => ({
                value: d,
                label: d,
                hint: String(report?.rows.filter((r) => r.department === d).length ?? 0),
              })),
            ]}
          />
          <Combobox
            label="Location"
            value={location}
            onChange={setLocation}
            placeholder="All locations"
            searchPlaceholder="Search locations…"
            options={[
              { value: "", label: "All locations", hint: String(report?.rows.length ?? 0) },
              ...(report?.filters.locations ?? []).map((l) => ({
                value: l,
                label: l,
                hint: String(report?.rows.filter((r) => r.location === l).length ?? 0),
              })),
            ]}
          />
          <Input
            label="As at"
            type="date"
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
            hint={asOf ? "Only allocations live on this date" : "All current allocations"}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-5 border-t border-navy-900/8 pt-3.5">
          <Checkbox
            label="Only the bench and the over-allocated"
            checked={onlyProblems}
            onChange={(e) => setOnlyProblems(e.target.checked)}
          />
          <Checkbox
            label="Include people marked inactive"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
          />
          {(department || location || search || asOf || onlyProblems || includeInactive) && (
            <button
              type="button"
              onClick={() => {
                setDepartment("");
                setLocation("");
                setSearch("");
                setAsOf("");
                setOnlyProblems(false);
                setIncludeInactive(false);
              }}
              className="cursor-pointer text-[12.5px] font-semibold text-navy-500 underline-offset-2 transition-colors hover:text-navy-900 hover:underline"
            >
              Clear filters
            </button>
          )}
          <span className="ml-auto text-[12.5px] tabular-nums text-navy-400">
            {loading ? "Loading…" : `${rows.length} of ${report?.rows.length ?? 0} people`}
          </span>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-danger/20 bg-danger-bg px-4 py-3 text-[13px] text-danger"
        >
          {error}
        </div>
      )}

      {/* ── The matrix ───────────────────────────────────────── */}
      <div>
        <SectionHeading
          description={
            report?.asOf
              ? `Allocations live on ${report.asOf}. Closed and cancelled projects are excluded.`
              : "All current allocations. Closed and cancelled projects are excluded."
          }
        >
          Allocation by person
        </SectionHeading>

        {loading && !report ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="shimmer h-12 rounded-lg" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            title="Nobody matches these filters"
            description="Widen the search, or clear the filters to see the whole employee master."
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-navy-900/8 bg-surface shadow-xs">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  {/* Code and name share one sticky cell. Two sticky
                      columns means matching a hard-coded `left` offset to
                      a width the browser computes itself — and when they
                      disagree by a pixel, the scrolling content shows
                      through the gap. One column cannot drift. */}
                  <Th sticky="left-0 z-20" className="min-w-[250px]">
                    <span className="inline-flex items-center gap-2">
                      <SortLink onClick={() => toggleSort("employeeId")} active={sortKey === "employeeId"} desc={sortDesc}>
                        Emp Code
                      </SortLink>
                      <span className="text-navy-200">/</span>
                      <SortLink onClick={() => toggleSort("fullName")} active={sortKey === "fullName"} desc={sortDesc}>
                        Name
                      </SortLink>
                    </span>
                  </Th>
                  <Th onClick={() => toggleSort("department")} active={sortKey === "department"} desc={sortDesc}>
                    Department
                  </Th>
                  <Th onClick={() => toggleSort("location")} active={sortKey === "location"} desc={sortDesc}>
                    Location
                  </Th>
                  {Array.from({ length: slots }).map((_, i) => (
                    <Th key={i} className="min-w-[196px]">
                      Project {i + 1}
                    </Th>
                  ))}
                  <Th
                    onClick={() => toggleSort("totalPercent")}
                    active={sortKey === "totalPercent"}
                    desc={sortDesc}
                    sticky="right-0 z-20"
                    className="min-w-[178px] border-l border-navy-900/10"
                  >
                    Total Allocation
                  </Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <Row key={row.employeeId} row={row} slots={slots} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Table pieces ──────────────────────────────────────────────────

function SortLink({
  children,
  onClick,
  active,
  desc,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  desc?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex cursor-pointer items-center gap-1 transition-colors hover:text-navy-900"
    >
      {children}
      <span className={cn("text-[9px]", active ? "text-red-600" : "text-navy-300")}>
        {active ? (desc ? "▼" : "▲") : "⇅"}
      </span>
    </button>
  );
}

function Th({
  children,
  onClick,
  active,
  desc,
  className,
  sticky,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  desc?: boolean;
  className?: string;
  sticky?: string;
}) {
  return (
    <th
      scope="col"
      className={cn(
        "whitespace-nowrap border-b border-navy-900/10 bg-surface-2 px-4 py-3",
        "text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-navy-500",
        sticky && `sticky ${sticky}`,
        className
      )}
    >
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          className="inline-flex cursor-pointer items-center gap-1 transition-colors hover:text-navy-900"
        >
          {children}
          <span className={cn("text-[9px]", active ? "text-red-600" : "text-navy-300")}>
            {active ? (desc ? "▼" : "▲") : "⇅"}
          </span>
        </button>
      ) : (
        children
      )}
    </th>
  );
}

function Row({ row, slots }: { row: AllocationRow; slots: number }) {
  const state = STATE[row.state];

  // The whole row is tinted, not just the total, so a problem is
  // visible while scanning rather than only when you reach the last
  // column — which on a wide sheet may be off-screen.
  // Solid, not an alpha: anything see-through here lets the middle of
  // the table scroll visibly underneath the pinned columns.
  const tint =
    row.state === "over"
      ? "bg-[#fdf1ee]"
      : row.state === "bench"
        ? "bg-[#fdf7ec]"
        : "bg-surface";

  return (
    <tr className={cn("group border-b border-navy-900/6 last:border-0", tint)}>
      <td className={cn("sticky left-0 z-10 px-4 py-2.5", tint)}>
        <div className="flex items-center gap-3">
          <CodeChip className="shrink-0 whitespace-nowrap">{row.employeeId}</CodeChip>
          <div className="min-w-0">
            <div className="truncate font-semibold text-navy-900">{row.fullName}</div>
            {row.designation && (
              <div className="truncate text-[11.5px] text-navy-400">
                {row.designation}
                {row.grade && <span className="text-navy-300"> · {row.grade}</span>}
              </div>
            )}
          </div>
        </div>
      </td>
      <td className="px-4 py-2.5 text-[13px] text-navy-700">{row.department ?? "—"}</td>
      <td className="px-4 py-2.5 text-[13px] text-navy-700">{row.location ?? "—"}</td>

      {Array.from({ length: slots }).map((_, i) => {
        const p = row.projects[i];
        if (!p) {
          return (
            <td key={i} className="px-4 py-2.5 text-center text-navy-200">
              —
            </td>
          );
        }
        return (
          <td key={i} className="px-4 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-[13px] font-medium text-navy-800" title={p.projectName}>
                  {p.projectName}
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-navy-400">
                  <span className="font-mono">{p.projectCode}</span>
                  {p.roleInProject && <span className="truncate">· {p.roleInProject}</span>}
                </div>
              </div>
              <span className="shrink-0 text-[13px] font-bold tabular-nums text-navy-900">
                {p.allocationPercent}%
              </span>
            </div>
          </td>
        );
      })}

      <td className={cn("sticky right-0 z-10 border-l border-navy-900/10 px-4 py-2.5", tint)}>
        <div className="flex items-center justify-end gap-2.5">
          <span
            className={cn(
              "text-[15px] font-bold tabular-nums",
              row.state === "over" ? "text-danger" : "text-navy-900"
            )}
          >
            {row.totalPercent}%
          </span>
          <Badge variant={state.badge} size="sm" className="w-[96px] justify-center">
            {state.label}
          </Badge>
        </div>
      </td>
    </tr>
  );
}

// ─── Icons ─────────────────────────────────────────────────────────

const stroke = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const PeopleIcon = () => (
  <svg {...stroke} className="h-4.5 w-4.5">
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3 19v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1" />
    <path d="M16.5 5.2a3.2 3.2 0 0 1 0 5.6M18 13.3A4.5 4.5 0 0 1 21 17.5V19" />
  </svg>
);

const CheckIcon = () => (
  <svg {...stroke} className="h-4.5 w-4.5">
    <circle cx="12" cy="12" r="9" />
    <path d="m8.5 12 2.5 2.5 4.5-5" />
  </svg>
);

const BenchIcon = () => (
  <svg {...stroke} className="h-4.5 w-4.5">
    <path d="M3 10h18M5 10v8M19 10v8M3 14h18" />
    <path d="M6 10V7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v3" />
  </svg>
);

const AlertIcon = () => (
  <svg {...stroke} className="h-4.5 w-4.5">
    <path d="M10.3 4.3 2.8 17a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9.5v4M12 17h.01" />
  </svg>
);

const GaugeIcon = () => (
  <svg {...stroke} className="h-4.5 w-4.5">
    <path d="M4 18a8 8 0 1 1 16 0" />
    <path d="m12 14 4-4" />
  </svg>
);

const SearchIcon = () => (
  <svg {...stroke} className="h-4 w-4">
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4 4" />
  </svg>
);

const UploadIcon = () => (
  <svg {...stroke} className="h-4 w-4">
    <path d="M12 21V10M8 13.5l4-4 4 4" />
    <path d="M4 7V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2" />
  </svg>
);

const DownloadIcon = () => (
  <svg {...stroke} className="h-4 w-4">
    <path d="M12 3v11M8 10.5l4 4 4-4" />
    <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
  </svg>
);
