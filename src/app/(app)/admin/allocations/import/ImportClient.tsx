"use client";

import React, { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Card, SectionHeading, StatCard, EmptyState } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";
import { Badge, CodeChip } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import type {
  ResolvedAllocationRow,
  AllocationImportSummary,
} from "@/lib/imports/allocation-import";

type Outcome = ResolvedAllocationRow["outcome"];

const OUTCOME: Record<
  Outcome,
  { label: string; badge: "success" | "neutral" | "critical"; tint: string }
> = {
  ready: { label: "Will import", badge: "success", tint: "" },
  skipped: { label: "Already there", badge: "neutral", tint: "bg-navy-900/[0.035]" },
  error: { label: "Refused", badge: "critical", tint: "bg-danger-bg/45" },
};

interface Result {
  committed: boolean;
  filename: string;
  sheetName: string;
  rows: ResolvedAllocationRow[];
  summary: AllocationImportSummary;
}

export function ImportClient() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dateOrder, setDateOrder] = useState<"dmy" | "mdy">("dmy");
  const [busy, setBusy] = useState<"" | "preview" | "commit">("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [only, setOnly] = useState<"all" | Outcome>("all");

  async function send(commit: boolean) {
    if (!file) return;
    setBusy(commit ? "commit" : "preview");
    setError("");
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("dateOrder", dateOrder);
      if (commit) body.set("commit", "true");

      const res = await fetch("/api/reports/allocations/import", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setError(data.error || "Could not read that file.");
        if (!commit) setResult(null);
        return;
      }
      setResult(data as Result);
      if (commit) setOnly("all");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy("");
    }
  }

  function choose(next: File | null) {
    setFile(next);
    setResult(null);
    setError("");
  }

  const rows = useMemo(() => {
    if (!result) return [];
    return only === "all" ? result.rows : result.rows.filter((r) => r.outcome === only);
  }, [result, only]);

  const summary = result?.summary;
  const committed = result?.committed ?? false;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="min-w-0">
          <h1 className="text-display text-[26px] font-bold leading-tight tracking-[-0.025em] text-navy-900">
            Import allocations
          </h1>
          <p className="mt-1.5 text-[13.5px] leading-snug text-navy-500">
            The response sheet from the resourcing form, straight into the project
            teams. One response is one person on one project.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link href="/admin/allocations">
            <Button variant="secondary" size="sm">
              Back to the report
            </Button>
          </Link>
        </div>
      </div>

      {/* ── Pick the file ─────────────────────────────────────── */}
      <Card padding="md">
        <SectionHeading description="Forms → Responses → Open in Excel, then upload the workbook here. Reading it changes nothing; you will see every row before anything is written.">
          The response sheet
        </SectionHeading>

        <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-navy-600">
              Responses file (.xlsx or .csv)
            </span>
            <div
              className={cn(
                "flex h-9 items-center gap-3 rounded-lg border bg-surface px-3",
                file ? "border-navy-900/20" : "border-dashed border-navy-900/20"
              )}
            >
              <input
                ref={fileInput}
                type="file"
                accept=".xlsx,.csv"
                onChange={(e) => choose(e.target.files?.[0] ?? null)}
                className={cn(
                  "min-w-0 flex-1 text-[13px] text-navy-700",
                  "file:mr-3 file:cursor-pointer file:rounded-md file:border-0",
                  "file:bg-navy-900/7 file:px-2.5 file:py-1 file:text-[12.5px] file:font-semibold file:text-navy-800",
                  "hover:file:bg-navy-900/12"
                )}
              />
            </div>
          </label>

          <Select
            label="Dates are written"
            value={dateOrder}
            onChange={(e) => setDateOrder(e.target.value as "dmy" | "mdy")}
            fieldClassName="md:w-[190px]"
            hint="Only matters for 03/04"
          >
            <option value="dmy">Day first — 03/04 is 3 April</option>
            <option value="mdy">Month first — 03/04 is 4 March</option>
          </Select>

          <Button
            onClick={() => send(false)}
            loading={busy === "preview"}
            disabled={!file || busy !== ""}
          >
            Check the file
          </Button>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-danger/20 bg-danger-bg px-4 py-3 text-[13px] text-danger"
          >
            {error}
          </div>
        )}
      </Card>

      {/* ── What it found ─────────────────────────────────────── */}
      {result && summary && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Responses" value={summary.total} hint={result.sheetName} />
            <StatCard
              label={committed ? "Imported" : "Will import"}
              value={committed ? (summary.inserted ?? 0) : summary.ready}
              tone={(committed ? (summary.inserted ?? 0) : summary.ready) > 0 ? "positive" : "default"}
              hint={committed ? "written to the project teams" : "new rows"}
            />
            <StatCard
              label="Already there"
              value={summary.skipped}
              hint="left exactly as they were"
            />
            <StatCard
              label="Refused"
              value={summary.errors}
              tone={summary.errors > 0 ? "critical" : "default"}
              hint={summary.errors > 0 ? "fix the sheet and upload again" : "nothing wrong"}
            />
          </div>

          {committed ? (
            <div className="rounded-xl border border-success/20 bg-success-bg px-4 py-3.5 text-[13.5px] text-success">
              <strong className="font-semibold">Done.</strong>{" "}
              {summary.inserted ?? 0} allocation{(summary.inserted ?? 0) === 1 ? "" : "s"} written.{" "}
              <Link href="/admin/allocations" className="font-semibold underline underline-offset-2">
                See them on the report
              </Link>
              .
              {summary.failed ? (
                <span className="block pt-1">
                  {summary.failed} row{summary.failed === 1 ? "" : "s"} failed at the last moment —
                  they are marked Refused below.
                </span>
              ) : null}
            </div>
          ) : (
            <Card padding="md">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[13.5px] leading-snug text-navy-600">
                  {summary.ready > 0 ? (
                    <>
                      <strong className="font-semibold text-navy-900">
                        {summary.ready} row{summary.ready === 1 ? "" : "s"}
                      </strong>{" "}
                      will be added to the project teams.
                      {summary.skipped > 0 && ` ${summary.skipped} already in the database will be left alone.`}
                      {summary.errors > 0 && ` ${summary.errors} will not be imported at all.`}
                    </>
                  ) : (
                    <>Nothing in this file can be imported as it stands.</>
                  )}
                </p>
                <Button
                  onClick={() => send(true)}
                  loading={busy === "commit"}
                  disabled={summary.ready === 0 || busy !== ""}
                  className="shrink-0"
                >
                  Import {summary.ready} row{summary.ready === 1 ? "" : "s"}
                </Button>
              </div>
              {summary.overAllocated > 0 && (
                <p className="mt-3 border-t border-navy-900/8 pt-3 text-[12.5px] text-warning">
                  {summary.overAllocated} of them take somebody past 100% across every live
                  project. They will still import — a promise that cannot be kept is worth
                  seeing on the report rather than hiding at the door.
                </p>
              )}
            </Card>
          )}

          <div>
            <SectionHeading
              actions={
                <div className="flex items-center gap-1 rounded-lg bg-navy-900/6 p-0.5">
                  {(["all", "ready", "skipped", "error"] as const).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setOnly(key)}
                      className={cn(
                        "cursor-pointer rounded-md px-2.5 py-1 text-[12.5px] font-semibold transition-colors",
                        only === key
                          ? "bg-surface text-navy-900 shadow-xs"
                          : "text-navy-500 hover:text-navy-800"
                      )}
                    >
                      {key === "all" ? "Every row" : OUTCOME[key].label}
                    </button>
                  ))}
                </div>
              }
            >
              Row by row
            </SectionHeading>

            {rows.length === 0 ? (
              <EmptyState
                title="Nothing in this view"
                description="Choose another filter above."
              />
            ) : (
              <div className="overflow-x-auto rounded-xl border border-navy-900/8 bg-surface shadow-xs">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-navy-900/10 bg-surface-2 text-left text-[11.5px] font-semibold uppercase tracking-[0.04em] text-navy-500">
                      <th className="px-4 py-2.5">Row</th>
                      <th className="px-4 py-2.5 min-w-[230px]">Person</th>
                      <th className="px-4 py-2.5 min-w-[220px]">Project</th>
                      <th className="px-4 py-2.5">Role</th>
                      <th className="px-4 py-2.5 text-right">Alloc</th>
                      <th className="px-4 py-2.5 min-w-[180px]">Window</th>
                      <th className="px-4 py-2.5 min-w-[260px]">What happens</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const state = OUTCOME[row.outcome];
                      return (
                        <tr
                          key={row.rowNumber}
                          className={cn(
                            "border-b border-navy-900/6 align-top last:border-0",
                            state.tint
                          )}
                        >
                          <td className="px-4 py-2.5 text-[12.5px] tabular-nums text-navy-400">
                            {row.rowNumber}
                          </td>
                          <td className="px-4 py-2.5">
                            {row.employeeId ? (
                              <div className="flex items-start gap-2">
                                <CodeChip className="shrink-0">{row.employeeId}</CodeChip>
                                <span className="font-semibold text-navy-900">
                                  {row.employeeName}
                                </span>
                              </div>
                            ) : (
                              <span className="text-[13px] text-navy-500">
                                {row.employeeRaw || "—"}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            {row.projectCode ? (
                              <div className="min-w-0">
                                <div className="font-semibold text-navy-900">
                                  {row.projectCode}
                                </div>
                                <div className="truncate text-[12px] text-navy-400">
                                  {row.projectName}
                                </div>
                              </div>
                            ) : (
                              <span className="text-[13px] text-navy-500">
                                {row.projectRaw || "—"}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-[13px] text-navy-700">
                            {row.role ?? "—"}
                          </td>
                          <td className="px-4 py-2.5 text-right text-[13px] font-semibold tabular-nums text-navy-900">
                            {row.allocationPercent !== null ? `${row.allocationPercent}%` : "—"}
                          </td>
                          <td className="px-4 py-2.5 text-[12.5px] tabular-nums text-navy-600">
                            {row.startDate || row.endDate
                              ? `${row.startDate ?? "open"} → ${row.endDate ?? "open"}`
                              : "no dates"}
                          </td>
                          <td className="px-4 py-2.5">
                            <Badge variant={state.badge} size="sm">
                              {row.outcome === "ready" && committed ? "Imported" : state.label}
                            </Badge>
                            {row.messages.map((m, i) => (
                              <p key={i} className="mt-1 text-[12.5px] leading-snug text-navy-600">
                                {m}
                              </p>
                            ))}
                            {row.warnings.map((w, i) => (
                              <p key={i} className="mt-1 text-[12.5px] leading-snug text-warning">
                                {w}
                              </p>
                            ))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {!result && (
        <Card padding="md">
          <SectionHeading description="Run this before each collection round, so the dropdowns in the form match who is actually here.">
            Building the form
          </SectionHeading>
          <pre className="overflow-x-auto rounded-lg bg-navy-900/[0.045] px-4 py-3 text-[12.5px] leading-relaxed text-navy-800">
{`node src/lib/imports/export-form-choices.js`}
          </pre>
          <p className="mt-3 text-[13px] leading-snug text-navy-500">
            It writes the employee and project dropdown lists, a build sheet with the
            questions to create, and a blank template — into{" "}
            <code className="rounded bg-navy-900/6 px-1 py-0.5 text-[12px]">./form-choices</code>.
          </p>
        </Card>
      )}
    </div>
  );
}
