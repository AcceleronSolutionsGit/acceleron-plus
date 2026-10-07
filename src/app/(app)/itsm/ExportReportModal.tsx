"use client";

import React, { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Combobox } from "@/components/ui/Combobox";
import { Button } from "@/components/ui/Button";

// ─── Types ────────────────────────────────────────────────────────────────────

type ExportFormat = "csv" | "xlsx" | "pdf";

interface Filters {
  status?: string;
  priority?: string;
  projectCode?: string;
  ticketType?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentFilters?: Filters;
  totalCount?: number;
}

// ─── Format Card ──────────────────────────────────────────────────────────────

const FORMAT_OPTIONS: {
  id: ExportFormat;
  label: string;
  icon: React.ReactNode;
  description: string;
  badge?: string;
  color: string;
  activeColor: string;
}[] = [
  {
    id: "csv",
    label: "CSV",
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    description: "Plain spreadsheet, opens in any tool",
    badge: "Lightweight",
    color: "border-emerald-200 text-emerald-700 bg-emerald-50",
    activeColor: "border-emerald-500 ring-2 ring-emerald-500/30 bg-emerald-50 text-emerald-800 shadow-md",
  },
  {
    id: "xlsx",
    label: "Excel (.xlsx)",
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18M10 3v18M14 3v18M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z" />
      </svg>
    ),
    description: "4 sheets with color-coded cells & filters",
    badge: "Recommended",
    color: "border-blue-200 text-blue-700 bg-blue-50",
    activeColor: "border-blue-500 ring-2 ring-blue-500/30 bg-blue-50 text-blue-800 shadow-md",
  },
  {
    id: "pdf",
    label: "PDF Report",
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    ),
    description: "Styled summary report with stats tables",
    badge: "Printable",
    color: "border-rose-200 text-rose-700 bg-rose-50",
    activeColor: "border-rose-500 ring-2 ring-rose-500/30 bg-rose-50 text-rose-800 shadow-md",
  },
];

// ─── Date quick-pick presets ──────────────────────────────────────────────────

function getPresetDates(preset: string): { from: string; to: string } {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  const daysAgo = (n: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  };

  const monthStart = () => {
    const d = new Date(now.getFullYear(), now.getMonth(), 1);
    return d.toISOString().slice(0, 10);
  };

  const lastMonthRange = () => {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
  };

  const quarterStart = () => {
    const q = Math.floor(now.getMonth() / 3);
    const d = new Date(now.getFullYear(), q * 3, 1);
    return d.toISOString().slice(0, 10);
  };

  switch (preset) {
    case "today": return { from: today, to: today };
    case "7d": return { from: daysAgo(7), to: today };
    case "30d": return { from: daysAgo(30), to: today };
    case "this_month": return { from: monthStart(), to: today };
    case "last_month": return lastMonthRange();
    case "this_quarter": return { from: quarterStart(), to: today };
    case "all": return { from: "", to: "" };
    default: return { from: "", to: "" };
  }
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ExportReportModal({ isOpen, onClose, currentFilters = {}, totalCount = 0 }: Props) {
  const [format, setFormat] = useState<ExportFormat>("xlsx");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [status, setStatus] = useState(currentFilters.status || "all");
  const [priority, setPriority] = useState(currentFilters.priority || "all");
  const [ticketType, setTicketType] = useState(currentFilters.ticketType || "all");
  const [projectCode, setProjectCode] = useState(currentFilters.projectCode || "all");
  const [isExporting, setIsExporting] = useState(false);
  const [activePreset, setActivePreset] = useState("all");

  const handlePreset = (preset: string) => {
    setActivePreset(preset);
    const { from, to } = getPresetDates(preset);
    setDateFrom(from);
    setDateTo(to);
  };

  const buildUrl = () => {
    const p = new URLSearchParams();
    p.set("format", format);
    if (dateFrom) p.set("dateFrom", dateFrom);
    if (dateTo) p.set("dateTo", dateTo);
    if (status !== "all") p.set("status", status);
    if (priority !== "all") p.set("priority", priority);
    if (ticketType !== "all") p.set("ticketType", ticketType);
    if (projectCode !== "all") p.set("projectCode", projectCode);
    return `/api/itsm/reports/export?${p.toString()}`;
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const url = buildUrl();

      if (format === "pdf") {
        // Open PDF report in new tab (user can then use browser's "Print > Save as PDF")
        window.open(url, "_blank");
        onClose();
        return;
      }

      // For CSV and XLSX, trigger a direct file download
      const res = await fetch(url);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`Export failed: ${err.error || res.statusText}`);
        return;
      }

      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `ITSM-Report-${new Date().toISOString().slice(0, 10)}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
      onClose();
    } finally {
      setIsExporting(false);
    }
  };

  const PRESETS = [
    { id: "today", label: "Today" },
    { id: "7d", label: "Last 7 days" },
    { id: "30d", label: "Last 30 days" },
    { id: "this_month", label: "This month" },
    { id: "last_month", label: "Last month" },
    { id: "this_quarter", label: "This quarter" },
    { id: "all", label: "All time" },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Export ITSM Report"
      footer={
        <div className="flex justify-between items-center w-full">
          <div className="text-xs text-navy-500">
            {totalCount > 0 && <span>~{totalCount} total tickets (filters may reduce this)</span>}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={isExporting}>
              Cancel
            </Button>
            <Button
              onClick={handleExport}
              disabled={isExporting}
              className={
                format === "csv"
                  ? "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700"
                  : format === "pdf"
                  ? "bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-700 hover:to-pink-700"
                  : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
              }
            >
              {isExporting ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Generating...
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Export {format.toUpperCase()}
                </div>
              )}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Format selector */}
        <div>
          <label className="block text-xs font-bold text-navy-700 uppercase tracking-wider mb-3">
            Export Format
          </label>
          <div className="grid grid-cols-3 gap-3">
            {FORMAT_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setFormat(opt.id)}
                className={`relative p-4 rounded-xl border-2 text-left transition-all duration-200 ${
                  format === opt.id ? opt.activeColor : "border-neutral-200 hover:border-neutral-300 bg-white hover:bg-neutral-50"
                }`}
              >
                {opt.badge && (
                  <span className={`absolute top-2 right-2 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                    format === opt.id ? "bg-current/10" : "bg-neutral-100 text-neutral-600"
                  }`}>
                    {opt.badge}
                  </span>
                )}
                <div className={`mb-2 transition-colors ${format === opt.id ? "text-current" : "text-navy-400"}`}>
                  {opt.icon}
                </div>
                <p className="text-sm font-bold leading-tight">{opt.label}</p>
                <p className="text-[11px] mt-1 opacity-70 leading-tight">{opt.description}</p>
              </button>
            ))}
          </div>

          {/* Format-specific info */}
          {format === "xlsx" && (
            <div className="mt-3 p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-800">
              <span className="font-bold">📊 Excel export includes 4 sheets:</span> All Tickets · Summary Stats · Overdue · Resolved &amp; Closed
            </div>
          )}
          {format === "pdf" && (
            <div className="mt-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
              <span className="font-bold">🖨 PDF Report:</span> Opens in a new tab → use browser&apos;s <strong>Print → Save as PDF</strong> to download
            </div>
          )}
          {format === "csv" && (
            <div className="mt-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
              <span className="font-bold">📋 CSV Export:</span> All 16 columns, UTF-8 encoded, opens directly in Excel or Google Sheets
            </div>
          )}
        </div>

        {/* Date Range */}
        <div>
          <label className="block text-xs font-bold text-navy-700 uppercase tracking-wider mb-3">
            Date Range
          </label>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handlePreset(p.id)}
                className={`px-3 py-1 text-xs font-semibold rounded-lg border transition-all ${
                  activePreset === p.id
                    ? "bg-navy-900 text-white border-navy-900"
                    : "border-neutral-200 text-navy-600 hover:border-navy-400 hover:bg-neutral-50"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-navy-500 mb-1">From</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setActivePreset(""); }}
                className="w-full text-sm border border-navy-500/15 rounded-xl px-3 py-2 bg-neutral-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-navy-900"
              />
            </div>
            <div>
              <label className="block text-xs text-navy-500 mb-1">To</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setActivePreset(""); }}
                className="w-full text-sm border border-navy-500/15 rounded-xl px-3 py-2 bg-neutral-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-navy-900"
              />
            </div>
          </div>
        </div>

        {/* Additional Filters */}
        <div>
          <label className="block text-xs font-bold text-navy-700 uppercase tracking-wider mb-3">
            Additional Filters
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Combobox
                label="Status"
                value={status}
                onChange={setStatus}
                options={[
                  { value: "all", label: "All Statuses" },
                  ...["new", "open", "pending", "on_hold", "resolved", "closed", "cancelled"].map((s) => ({
                    value: s,
                    label: s.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())
                  }))
                ]}
              />
            </div>
            <div>
              <Combobox
                label="Priority"
                value={priority}
                onChange={setPriority}
                options={[
                  { value: "all", label: "All Priorities" },
                  ...["urgent", "high", "medium", "low"].map((p) => ({
                    value: p,
                    label: p.charAt(0).toUpperCase() + p.slice(1)
                  }))
                ]}
              />
            </div>
            <div>
              <Combobox
                label="Ticket Type"
                value={ticketType}
                onChange={setTicketType}
                options={[
                  { value: "all", label: "All Types" },
                  { value: "incident", label: "Incident" },
                  { value: "service_request", label: "Service Request" },
                  { value: "problem", label: "Problem" },
                  { value: "query", label: "Query" }
                ]}
              />
            </div>
            <div>
              <Combobox
                label="Source"
                value={projectCode}
                onChange={setProjectCode}
                options={[
                  { value: "all", label: "All Projects" }
                ]}
              />
            </div>
          </div>
        </div>

        {/* Preview of what will be exported */}
        <div className="p-3.5 rounded-xl bg-neutral-50 border border-neutral-200">
          <p className="text-xs font-bold text-navy-700 mb-1.5">What will be exported</p>
          <div className="flex flex-wrap gap-2 text-xs text-navy-600">
            <span className="flex items-center gap-1">
              <svg className="w-3 h-3 text-emerald-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              Ticket #, Subject, Status, Priority
            </span>
            <span className="flex items-center gap-1">
              <svg className="w-3 h-3 text-emerald-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              Requester &amp; Agent details
            </span>
            <span className="flex items-center gap-1">
              <svg className="w-3 h-3 text-emerald-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              Project code &amp; phase
            </span>
            <span className="flex items-center gap-1">
              <svg className="w-3 h-3 text-emerald-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              Created / Resolved / Closed dates
            </span>
            {format === "xlsx" && (
              <span className="flex items-center gap-1">
                <svg className="w-3 h-3 text-blue-500" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                Color-coded priority &amp; status cells
              </span>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}