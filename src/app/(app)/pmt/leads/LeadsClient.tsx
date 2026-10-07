"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { ColorBadge } from "@/components/ui/Badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { PmtHeaderTabs } from "@/components/layout/PmtHeaderTabs";

interface Lead {
  id: string;
  leadNumber: string;
  companyName: string;
  contactName: string | null;
  opportunityValueInr: number | null;
  zohoCrmRef: string | null;
  zohoCrmStage: string | null;
  status: "new" | "qualified" | "solutioning" | "proposal" | "won" | "lost";
  createdAt: string;
}

const COLUMNS = [
  { id: "new", label: "New Leads", color: "bg-blue-50 text-blue-700" },
  { id: "qualified", label: "Qualified", color: "bg-indigo-50 text-indigo-700" },
  { id: "solutioning", label: "Solutioning", color: "bg-purple-50 text-purple-700" },
  { id: "proposal", label: "Proposal Sent", color: "bg-amber-50 text-amber-700" },
  { id: "won", label: "Closed Won", color: "bg-green-50 text-green-700" },
  { id: "lost", label: "Closed Lost", color: "bg-red-50 text-red-700" },
];

export function LeadsClient() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/pmt/leads");
    if (res.ok) {
      const json = await res.json();
      setLeads(json.data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Moving a card is optimistic: the board is a glorified status field
   * and waiting on a round-trip to see the card land feels broken.
   */
  const moveLead = async (leadId: string, status: string) => {
    const before = leads;
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, status: status as Lead["status"] } : l)));
    setError("");

    const res = await fetch(`/api/pmt/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setLeads(before);
      setError((data.errors ?? [data.error]).filter(Boolean).join(" ") || "That move was not saved.");
    }
  };

  const leadsByStatus = COLUMNS.reduce((acc, col) => {
    acc[col.id] = leads.filter((l) => l.status === col.id);
    return acc;
  }, {} as Record<string, Lead[]>);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-navy-100 rounded animate-pulse"></div>
        <div className="flex gap-4 overflow-x-auto">
          {COLUMNS.map((c) => (
            <div key={c.id} className="w-80 h-96 bg-navy-50 rounded-xl flex-shrink-0 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* PMT High-Level Tabs */}
      <PmtHeaderTabs
        title="Lead & Opportunity Pipeline"
        subtitle="Track pre-sales solutioning, Darwinbox rate-mapped effort estimation, and proposals"
        action={
          <Link
            href="/pmt/leads/new"
            data-guide="lead:new"
            className="px-4 py-2 bg-navy-900 text-white text-sm font-semibold rounded-xl hover:bg-navy-700 transition-colors shadow-sm shadow-navy-900/20 cursor-pointer block"
          >
            + New Lead
          </Link>
        }
      />

      <div className="rounded-lg px-4 py-2.5 text-xs border bg-navy-900/[0.03] border-neutral-200 text-navy-700">
        <span className="font-medium">Drag a card</span> between columns to move the deal along.
        Open one to build an effort estimate, and convert it to a project once it is won.
      </div>

      {error && (
        <div role="alert" className="bg-red-600/5 border border-red-600/20 text-red-600 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      <div className="flex-1 flex gap-6 overflow-x-auto pb-6 snap-x">
        {COLUMNS.map((col) => {
          const colLeads = leadsByStatus[col.id] || [];
          return (
            <div key={col.id} className="w-80 flex-shrink-0 flex flex-col snap-start">
              {/* Column Header */}
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${col.color.split(" ")[0]} border border-current`} />
                  <h3 className="font-semibold text-sm text-navy-900">{col.label}</h3>
                </div>
                <span className="text-xs font-bold text-navy-500 bg-navy-50 px-2 py-0.5 rounded-full">
                  {colLeads.length}
                </span>
              </div>

              {/* Cards */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDropTarget(col.id);
                }}
                onDragLeave={() => setDropTarget((t) => (t === col.id ? null : t))}
                onDrop={(e) => {
                  e.preventDefault();
                  setDropTarget(null);
                  const leadId = e.dataTransfer.getData("text/plain") || dragging;
                  setDragging(null);
                  if (leadId && leadsByStatus[col.id]?.every((l) => l.id !== leadId)) {
                    void moveLead(leadId, col.id);
                  }
                }}
                className={`flex-1 rounded-2xl p-2.5 flex flex-col gap-2.5 border shadow-inner min-h-[200px] transition-colors ${
                  dropTarget === col.id
                    ? "bg-navy-900/[0.06] border-navy-700/40 border-dashed"
                    : "bg-navy-50/50 border-navy-500/10"
                }`}
              >
                {colLeads.map((lead) => (
                  <Link
                    href={`/pmt/leads/${lead.leadNumber || lead.id}`}
                    key={lead.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", lead.id);
                      e.dataTransfer.effectAllowed = "move";
                      setDragging(lead.id);
                    }}
                    onDragEnd={() => {
                      setDragging(null);
                      setDropTarget(null);
                    }}
                    className="block group"
                  >
                    <div
                      className={`bg-white p-4 rounded-xl border border-navy-500/15 shadow-sm hover:shadow-md hover:border-navy-500/30 transition-all cursor-grab active:cursor-grabbing ${
                        dragging === lead.id ? "opacity-40" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <span className="text-[10px] font-bold text-navy-400 bg-navy-50 px-1.5 py-0.5 rounded uppercase tracking-wider">
                          {lead.leadNumber}
                        </span>
                        {lead.zohoCrmRef && (
                          <span className="text-[10px] text-blue-600 font-semibold flex items-center gap-1" title="Synced from Zoho CRM">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            CRM
                          </span>
                        )}
                      </div>
                      
                      <h4 className="font-bold text-sm text-navy-900 group-hover:text-blue-600 transition-colors line-clamp-2">
                        {lead.companyName}
                      </h4>
                      {lead.contactName && <p className="text-xs text-navy-500 mt-1 truncate">{lead.contactName}</p>}

                      <div className="mt-3 flex items-center justify-between border-t border-navy-500/10 pt-2.5">
                        <span className="text-xs font-medium text-navy-700">
                          {lead.opportunityValueInr ? formatCurrency(lead.opportunityValueInr) : "TBD"}
                        </span>
                        <span className="text-[10px] text-navy-400">
                          {formatDate(lead.createdAt).split(",")[0]}
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
                
                {colLeads.length === 0 && (
                  <div className="flex-1 flex items-center justify-center border-2 border-dashed border-navy-500/15 rounded-xl m-1">
                    <p className="text-xs font-medium text-navy-400">No leads</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
}
