"use client";

import React, { useEffect, useState, useMemo } from "react";
import { DataTable, type Column } from "@/components/ui/Table";
import { ColorBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { SectionHeading } from "@/components/ui/Card";

interface AuditLog {
  id: string;
  userId: string | null;
  userName: string | null;
  email: string;
  success: boolean;
  reason: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const sourceOptions = [
  { value: "all", label: "All Sources" },
  { value: "login", label: "Login" },
  { value: "otp", label: "OTP" },
  { value: "password_reset", label: "Password Reset" },
  { value: "admin_reset", label: "Admin Reset" },
];

const successOptions = [
  { value: "all", label: "All Outcomes" },
  { value: "true", label: "Success" },
  { value: "false", label: "Failed" },
];

const DROPDOWN_CLASS =
  "text-sm rounded-lg border border-neutral-200 px-3 py-2 text-navy-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white";

function formatTimestamp(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function classifySource(reason: string | null): {
  label: string;
  color: string;
} {
  if (!reason) return { label: "Unknown", color: "bg-neutral-100 text-neutral-700" };
  const r = reason.toLowerCase();
  if (r.includes("otp")) return { label: "OTP", color: "bg-purple-100 text-purple-800" };
  if (r.includes("password") || r.includes("reset"))
    return { label: "Password Reset", color: "bg-amber-100 text-amber-800" };
  if (r.includes("admin"))
    return { label: "Admin Action", color: "bg-red-100 text-red-800" };
  if (r.includes("login") || r.includes("credential") || r.includes("email"))
    return { label: "Login", color: "bg-blue-100 text-blue-800" };
  return { label: reason.slice(0, 20), color: "bg-neutral-100 text-neutral-700" };
}

function truncateUA(ua: string | null): string {
  if (!ua) return "—";
  // Show just the browser and OS
  const match = ua.match(/(Chrome|Firefox|Safari|Edge|Opera)\/[\d.]+/);
  const os = ua.match(/(Windows|Mac OS|Linux|Android|iOS)/);
  return `${match?.[0] || "Unknown"} · ${os?.[1] || ""}`.trim();
}

export function AuditLogsClient() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);

  // Filters
  const [sourceFilter, setSourceFilter] = useState("all");
  const [successFilter, setSuccessFilter] = useState("all");
  const [emailSearch, setEmailSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const fetchLogs = async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: "50",
      });
      if (sourceFilter !== "all") params.set("source", sourceFilter);
      if (successFilter !== "all") params.set("success", successFilter);
      if (emailSearch.trim()) params.set("email", emailSearch.trim());
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);

      const res = await fetch(`/api/admin/audit-logs?${params}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
        setPagination(data.pagination || { page: 1, limit: 50, total: 0, totalPages: 0 });
      }
    } catch (err) {
      console.error("Failed to fetch audit logs:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceFilter, successFilter, dateFrom, dateTo]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchLogs(1);
  };

  const columns: Column<AuditLog>[] = [
    {
      key: "createdAt",
      header: "Timestamp",
      render: (row) => (
        <span className="text-navy-600 tabular-nums text-xs whitespace-nowrap font-mono">
          {formatTimestamp(row.createdAt)}
        </span>
      ),
      className: "w-44",
    },
    {
      key: "email",
      header: "User",
      render: (row) => (
        <div>
          <p className="text-sm font-semibold text-navy-900 leading-tight">
            {row.userName || row.email}
          </p>
          {row.userName && (
            <p className="text-[11px] text-navy-400">{row.email}</p>
          )}
        </div>
      ),
    },
    {
      key: "success",
      header: "Outcome",
      render: (row) => (
        <ColorBadge
          colorClass={
            row.success
              ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
              : "bg-red-100 text-red-800 border border-red-200"
          }
        >
          {row.success ? "✓ Success" : "✕ Failed"}
        </ColorBadge>
      ),
      className: "w-28",
    },
    {
      key: "reason",
      header: "Source",
      render: (row) => {
        const src = classifySource(row.reason);
        return <ColorBadge colorClass={src.color}>{src.label}</ColorBadge>;
      },
      className: "w-32",
    },
    {
      key: "ipAddress",
      header: "IP Address",
      render: (row) => (
        <span className="text-xs text-navy-500 font-mono">{row.ipAddress || "—"}</span>
      ),
      className: "w-32",
    },
    {
      key: "userAgent",
      header: "Browser / OS",
      render: (row) => (
        <span className="text-xs text-navy-400" title={row.userAgent || undefined}>
          {truncateUA(row.userAgent)}
        </span>
      ),
      className: "w-44",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy-900 font-[family-name:var(--font-league-spartan)]">
            Audit Logs
          </h1>
          <p className="text-sm text-navy-500 mt-1">
            Login attempts, password resets, and admin actions across all users
          </p>
        </div>
        <div className="text-sm text-navy-500 bg-navy-50 px-4 py-2 rounded-lg border border-navy-100">
          <span className="font-bold text-navy-900">{pagination.total.toLocaleString()}</span> total records
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-sm">
        <form onSubmit={handleSearch} className="flex flex-wrap gap-3 items-end">
          {/* Email search */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-[11px] font-semibold text-navy-500 uppercase tracking-wider mb-1">
              Search by Email
            </label>
            <div className="relative">
              <svg className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={emailSearch}
                onChange={(e) => setEmailSearch(e.target.value)}
                placeholder="user@example.com"
                className="w-full text-sm pl-9 pr-3 py-2 rounded-lg border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Source filter */}
          <div>
            <label className="block text-[11px] font-semibold text-navy-500 uppercase tracking-wider mb-1">
              Source
            </label>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className={DROPDOWN_CLASS}
            >
              {sourceOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Outcome filter */}
          <div>
            <label className="block text-[11px] font-semibold text-navy-500 uppercase tracking-wider mb-1">
              Outcome
            </label>
            <select
              value={successFilter}
              onChange={(e) => setSuccessFilter(e.target.value)}
              className={DROPDOWN_CLASS}
            >
              {successOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Date range */}
          <div>
            <label className="block text-[11px] font-semibold text-navy-500 uppercase tracking-wider mb-1">
              From
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className={DROPDOWN_CLASS}
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-navy-500 uppercase tracking-wider mb-1">
              To
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className={DROPDOWN_CLASS}
            />
          </div>

          <Button type="submit" className="shrink-0">
            <svg className="w-4 h-4 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            Search
          </Button>
        </form>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-navy-400 text-sm">
          <svg className="animate-spin h-5 w-5 mr-3 text-blue-500" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Loading audit logs…
        </div>
      ) : (
        <DataTable columns={columns} data={logs} emptyMessage="No audit logs match your filters" />
      )}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between bg-white rounded-xl border border-neutral-200 shadow-sm px-5 py-3">
          <p className="text-xs text-navy-500">
            Showing <span className="font-bold text-navy-900">{(pagination.page - 1) * pagination.limit + 1}</span>–
            <span className="font-bold text-navy-900">{Math.min(pagination.page * pagination.limit, pagination.total)}</span>{" "}
            of <span className="font-bold text-navy-900">{pagination.total}</span>
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchLogs(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-neutral-200 text-navy-700 hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              ← Prev
            </button>
            <span className="text-xs font-bold text-navy-900 px-2">
              {pagination.page} / {pagination.totalPages}
            </span>
            <button
              onClick={() => fetchLogs(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-neutral-200 text-navy-700 hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
