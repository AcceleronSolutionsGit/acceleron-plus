"use client";

import React, { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Card, SectionHeading, StatCard } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import type { ZohoSalesOrderRow, SalesOrderImportSummary } from "@/lib/imports/sales-order-import";

interface ImportResponse {
  success: boolean;
  committed: boolean;
  rows: ZohoSalesOrderRow[];
  summary: SalesOrderImportSummary;
  error?: string;
}

const OUTCOME_STYLES: Record<string, { label: string; badge: string; bg: string }> = {
  created: {
    label: "New Project",
    badge: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    bg: "",
  },
  updated: {
    label: "Will Update",
    badge: "bg-blue-50 text-blue-700 border border-blue-200",
    bg: "bg-blue-50/20",
  },
  skipped: {
    label: "Skipped",
    badge: "bg-neutral-100 text-neutral-600 border border-neutral-200",
    bg: "bg-neutral-50/40",
  },
  error: {
    label: "Error",
    badge: "bg-red-50 text-red-700 border border-red-200",
    bg: "bg-red-50/20",
  },
};

export function SalesOrdersClient() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<"" | "preview" | "commit">("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [filter, setFilter] = useState<"all" | "created" | "updated" | "error">("all");

  async function send(commit: boolean) {
    if (!file) return;
    setBusy(commit ? "commit" : "preview");
    setError("");

    try {
      const body = new FormData();
      body.set("file", file);
      if (commit) body.set("commit", "true");

      const res = await fetch("/api/admin/sales-orders", {
        method: "POST",
        body,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setError(data.error || "Could not process that file.");
        if (!commit) setResult(null);
        return;
      }

      setResult(data as ImportResponse);
      if (commit) setFilter("all");
    } catch {
      setError("Could not connect to the server.");
    } finally {
      setBusy("");
    }
  }

  function chooseFile(next: File | null) {
    setFile(next);
    setResult(null);
    setError("");
  }

  const rows = useMemo(() => {
    if (!result?.rows) return [];
    if (filter === "all") return result.rows;
    return result.rows.filter((r) => r.outcome === filter);
  }, [result, filter]);

  const summary = result?.summary;
  const committed = result?.committed ?? false;

  return (
    <div className="space-y-6">
      {/* ── Page Header ──────────────────────────────────────────── */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold text-navy-900 font-[family-name:var(--font-league-spartan)]">
            Zoho Books Sales Orders & Projects Import
          </h1>
          <p className="mt-1 text-sm text-navy-500 max-w-2xl">
            Import Zoho Books sales order export spreadsheets (.xlsx) to automatically generate and synchronize
            client projects. Once imported, employees can find these projects on My Projects and add themselves.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link href="/pmt">
            <Button variant="secondary" size="sm">
              View All Projects
            </Button>
          </Link>
        </div>
      </div>

      {/* ── File Upload Card ─────────────────────────────────────── */}
      <Card padding="md">
        <SectionHeading description="Upload the Excel export (.xlsx) containing SALESORDER_ID, Sales Order#, Customer Name, Description, Amount, and Order Status. Preview first without modifying any database records.">
          Upload Sales Orders Workbook
        </SectionHeading>

        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-navy-600">
              Sales Order Excel file (.xlsx)
            </span>
            <div
              className={cn(
                "flex h-11 items-center gap-3 rounded-xl border bg-surface px-3.5 transition-colors",
                file ? "border-navy-900/30 bg-navy-50/20" : "border-dashed border-navy-900/25 hover:border-navy-900/40"
              )}
            >
              <input
                ref={fileInput}
                type="file"
                accept=".xlsx"
                onChange={(e) => chooseFile(e.target.files?.[0] ?? null)}
                className={cn(
                  "min-w-0 flex-1 text-[13px] text-navy-700 cursor-pointer",
                  "file:mr-3 file:cursor-pointer file:rounded-lg file:border-0",
                  "file:bg-navy-900/10 file:px-3 file:py-1.5 file:text-[12.5px] file:font-semibold file:text-navy-900",
                  "hover:file:bg-navy-900/20"
                )}
              />
            </div>
          </label>

          <Button
            onClick={() => send(false)}
            loading={busy === "preview"}
            disabled={!file || busy !== ""}
            className="h-11 px-5"
          >
            <svg className="w-4 h-4 mr-2" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10 3.5v9M7 9.5l3 3.5 3-3.5M3.5 13.5v2A1.5 1.5 0 0 0 5 17h10a1.5 1.5 0 0 0 1.5-1.5v-2" />
            </svg>
            Preview Import
          </Button>
        </div>

        {error && (
          <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
      </Card>

      {/* ── Summary & Commit Action ───────────────────────────────── */}
      {result && summary && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Total Rows" value={summary.total} hint="in spreadsheet" />
            <StatCard
              label={committed ? "Projects Created" : "Will Create"}
              value={summary.created}
              tone={summary.created > 0 ? "positive" : "default"}
              hint="new project codes"
            />
            <StatCard
              label={committed ? "Projects Updated" : "Will Update"}
              value={summary.updated}
              tone="default"
              hint="existing sales orders"
            />
            <StatCard
              label="Errors / Skipped"
              value={summary.errors}
              tone={summary.errors > 0 ? "critical" : "default"}
              hint={summary.errors > 0 ? "missing required fields" : "clean sheet"}
            />
          </div>

          {committed ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-emerald-800 flex items-center justify-between flex-wrap gap-3">
              <div>
                <strong className="font-semibold text-[15px]">✓ Import Completed Successfully!</strong>
                <p className="text-xs text-emerald-700 mt-0.5">
                  Created {summary.created} new project{summary.created === 1 ? "" : "s"} and updated {summary.updated}.
                  Employees can now find these projects on My Projects and add themselves.
                </p>
              </div>
              <div className="flex gap-2">
                <Link href="/pmt">
                  <Button variant="secondary" size="sm">
                    Open Projects List
                  </Button>
                </Link>
                <Link href="/admin/allocation-requests">
                  <Button size="sm">
                    Review Team Allocations
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-navy-900/10 bg-surface p-4 flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="text-sm font-semibold text-navy-900">
                  Ready to apply changes?
                </p>
                <p className="text-xs text-navy-500 mt-0.5">
                  Review the rows below. When confirmed, click Import to write these projects into the system.
                </p>
              </div>
              <Button
                onClick={() => send(true)}
                loading={busy === "commit"}
                disabled={summary.created === 0 && summary.updated === 0}
                className="h-10 px-5"
              >
                Confirm & Create {summary.created} Project{summary.created === 1 ? "" : "s"}
              </Button>
            </div>
          )}

          {/* ── Table Filters ─────────────────────────────────────── */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex rounded-lg border border-navy-900/12 bg-surface shadow-xs overflow-hidden">
              {(["all", "created", "updated", "error"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setFilter(v)}
                  className={cn(
                    "px-3.5 py-1.5 text-xs font-medium cursor-pointer capitalize transition-colors",
                    filter === v ? "bg-navy-900 text-white" : "text-navy-600 hover:bg-navy-900/5"
                  )}
                >
                  {v === "all" ? `All (${result.rows.length})` : `${v} (${result.rows.filter(r => r.outcome === v).length})`}
                </button>
              ))}
            </div>
            <span className="text-xs text-navy-500">
              Showing {rows.length} of {result.rows.length} entries
            </span>
          </div>

          {/* ── Preview Table ─────────────────────────────────────── */}
          <Card padding="none">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-navy-900/10 bg-navy-50/50 text-[11px] font-semibold text-navy-600 uppercase tracking-wider">
                    <th className="px-4 py-3">Row</th>
                    <th className="px-4 py-3">Outcome</th>
                    <th className="px-4 py-3">Sales Order #</th>
                    <th className="px-4 py-3">Customer Name</th>
                    <th className="px-4 py-3">Description / Project</th>
                    <th className="px-4 py-3">Order Status</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3 text-right">Amount (INR)</th>
                    <th className="px-4 py-3">Details / Message</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-900/5 text-navy-800">
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-navy-400">
                        No rows matching this filter.
                      </td>
                    </tr>
                  ) : (
                    rows.map((r, i) => {
                      const style = OUTCOME_STYLES[r.outcome] ?? OUTCOME_STYLES.skipped;
                      return (
                        <tr key={i} className={cn("hover:bg-navy-50/30 transition-colors", style.bg)}>
                          <td className="px-4 py-2.5 font-mono text-navy-400">{r.rowNumber}</td>
                          <td className="px-4 py-2.5">
                            <span className={cn("inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold", style.badge)}>
                              {style.label}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 font-medium text-navy-900 font-mono">
                            {r.salesOrderNumber || r.salesorderId || "—"}
                          </td>
                          <td className="px-4 py-2.5 font-medium">{r.customerName || "—"}</td>
                          <td className="px-4 py-2.5 max-w-xs truncate" title={r.description}>
                            {r.description || "—"}
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="capitalize px-2 py-0.5 rounded bg-navy-900/5 text-navy-700 text-[11px]">
                              {r.orderStatus || "—"}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap text-navy-500">
                            {r.date || "—"}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono font-medium">
                            {r.amount !== null ? `₹${r.amount.toLocaleString("en-IN")}` : "—"}
                          </td>
                          <td className="px-4 py-2.5 text-navy-500 max-w-xs truncate" title={r.message}>
                            {r.message}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
