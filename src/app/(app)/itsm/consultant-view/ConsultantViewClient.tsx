"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import type { User, ConsultantWorkloadItem } from "@/lib/types";
import { getConsultantWorkload } from "@/lib/api";
import { DataTable, type Column } from "@/components/ui/Table";
import { ColorBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { formatDateTime, formatStatus, ticketStatusColor, priorityColor, cn } from "@/lib/utils";

// Helper for type badges
const getTypeBadgeColor = (type: string) => {
  if (type === "Change Request") return "bg-purple-100 text-purple-700 border border-purple-200";
  if (type === "incident") return "bg-red-50 text-red-700 border border-red-200";
  return "bg-blue-50 text-blue-700 border border-blue-200";
};

export function ConsultantViewClient({ consultants }: { consultants: User[] }) {
  const [selectedAgent, setSelectedAgent] = useState<string>(consultants[0]?.id || "");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  
  const [data, setData] = useState<ConsultantWorkloadItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchWorkload = async () => {
    if (!selectedAgent) return;
    setLoading(true);
    try {
      const items = await getConsultantWorkload(selectedAgent, startDate, endDate);
      setData(items);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Initial load when agent changes
  useEffect(() => {
    fetchWorkload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAgent]);

  const columns: Column<ConsultantWorkloadItem>[] = [
    {
      key: "createdAt",
      header: "Date Created",
      render: (item) => <span className="text-navy-500 tabular-nums text-xs">{formatDateTime(item.createdAt)}</span>,
    },
    {
      key: "number",
      header: "Number",
      render: (item) => (
        <Link 
          href={`/itsm/consultant-view/${item.number}`}
          className="font-mono text-xs font-semibold text-navy-700 hover:text-navy-900 hover:underline"
        >
          {item.number}
        </Link>
      ),
      className: "whitespace-nowrap",
    },
    {
      key: "type",
      header: "Type",
      render: (item) => (
        <ColorBadge colorClass={getTypeBadgeColor(item.type)}>
          {formatStatus(item.type)}
        </ColorBadge>
      ),
    },
    {
      key: "subject",
      header: "Subject",
      render: (item) => <span className="font-medium text-navy-900">{item.subject}</span>,
    },
    {
      key: "companyName",
      header: "Company",
      render: (item) => <span className="text-navy-700">{item.companyName || "—"}</span>,
    },
    {
      key: "module",
      header: "Module",
      render: (item) => <span className="text-navy-700">{item.module || "—"}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (item) => (
        <ColorBadge colorClass={ticketStatusColor(item.status as any)}>
          {formatStatus(item.status)}
        </ColorBadge>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-navy-900 font-[family-name:var(--font-league-spartan)]">
          Consultant Workload View
        </h1>
        <p className="text-sm text-navy-500 mt-1">
          Filter and view assigned incidents and change requests by consultant and date range.
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl border border-neutral-50 shadow-sm flex flex-col sm:flex-row items-end gap-4">
        <div className="flex-1 w-full space-y-1.5">
          <label className="text-xs font-medium text-navy-700">Consultant</label>
          <select
            value={selectedAgent}
            onChange={(e) => setSelectedAgent(e.target.value)}
            className="w-full text-sm border border-navy-500/20 rounded-lg px-3 py-2 bg-white text-navy-900 focus:outline-none focus:ring-2 focus:ring-navy-700/20"
          >
            {consultants.map(c => (
              <option key={c.id} value={c.id}>{c.fullName}</option>
            ))}
          </select>
        </div>

        <div className="flex-1 w-full space-y-1.5">
          <Input 
            type="date" 
            label="Start Date" 
            value={startDate} 
            onChange={(e) => setStartDate(e.target.value)} 
          />
        </div>

        <div className="flex-1 w-full space-y-1.5">
          <Input 
            type="date" 
            label="End Date" 
            value={endDate} 
            onChange={(e) => setEndDate(e.target.value)} 
          />
        </div>

        <div className="w-full sm:w-auto">
          <Button onClick={fetchWorkload} disabled={loading} className="w-full">
            {loading ? "Loading..." : "Apply Filters"}
          </Button>
        </div>
      </div>

      {/* Table */}
      <DataTable 
        columns={columns} 
        data={data} 
        emptyMessage="No tickets or change requests found for this consultant in the selected date range."
      />
    </div>
  );
}
