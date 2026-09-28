"use client";

import React from "react";
import Link from "next/link";
import { formatCurrency, formatDate } from "@/lib/utils";
import { PmtHeaderTabs } from "@/components/layout/PmtHeaderTabs";

interface CostData {
  projectId: string;
  code: string;
  name: string;
  budget: number;
  actualCost: number;
  consumedPercent: number;
}

export function DashboardClient({
  projects,
  milestones,
  costData,
  financeScope = "managed",
}: {
  projects: any[];
  milestones: any[];
  costData: CostData[];
  /** "all" for an admin; otherwise only projects this person is the named PM of. */
  financeScope?: "all" | "managed";
}) {
  const scopeNote = financeScope === "all" ? "All active projects" : "Projects you manage";
  const activeCount = projects.filter(p => p.status === "active").length;
  const totalBudget = costData.reduce((acc, c) => acc + c.budget, 0);
  const totalBurned = costData.reduce((acc, c) => acc + c.actualCost, 0);
  const totalBurnedPercent = totalBudget > 0 ? (totalBurned / totalBudget) * 100 : 0;
  
  const pendingMilestones = milestones.filter(m => m.status !== "completed");
  const upcomingMilestones = pendingMilestones.slice(0, 5); // next 5

  return (
    <div className="space-y-6">
      {/* PMT High-Level Tabs */}
      <PmtHeaderTabs
        title="Portfolio Dashboard"
        subtitle="High-level view of active projects, delivery timeline, and portfolio burn rates"
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-5 border border-navy-500/10 shadow-sm">
          <h3 className="text-xs font-bold text-navy-500 uppercase tracking-wide mb-1">Active Projects</h3>
          <p className="text-3xl font-bold text-navy-900">{activeCount}</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-navy-500/10 shadow-sm">
          <h3 className="text-xs font-bold text-navy-500 uppercase tracking-wide mb-1">Total Portfolio Budget</h3>
          <p className="text-2xl font-bold text-navy-900">{formatCurrency(totalBudget)}</p>
          <p className="text-[11px] text-navy-400 mt-1">{scopeNote}</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-navy-500/10 shadow-sm">
          <h3 className="text-xs font-bold text-navy-500 uppercase tracking-wide mb-1">Total Burned Cost</h3>
          <p className="text-2xl font-bold text-orange-600">{formatCurrency(totalBurned)}</p>
          <p className="text-[11px] text-navy-400 mt-1">{scopeNote}</p>
        </div>
        <div className="bg-navy-900 rounded-xl p-5 border border-navy-500/10 shadow-sm text-white relative overflow-hidden">
          <div className="relative z-10">
            <h3 className="text-xs font-bold text-white/60 uppercase tracking-wide mb-1">Portfolio Burn Rate</h3>
            <p className="text-3xl font-bold text-white">{totalBurnedPercent.toFixed(1)}%</p>
            <div className="w-full bg-navy-950 rounded-full h-1.5 mt-3 overflow-hidden">
              <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${Math.min(totalBurnedPercent, 100)}%` }} />
            </div>
          </div>
          <div className="absolute -bottom-6 -right-6 text-8xl opacity-5">📈</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Col: Projects Cost Analysis */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl border border-navy-500/10 shadow-sm overflow-hidden">
            <div className="bg-navy-50/50 px-5 py-4 border-b border-navy-500/10">
              <h3 className="font-bold text-navy-900">Project Cost Analysis</h3>
              <p className="text-xs text-navy-500">
                Actual cost (Timesheets) vs Planned Budget · {scopeNote.toLowerCase()}
              </p>
            </div>
            <div className="p-5 space-y-6">
              {costData.map(c => (
                <div key={c.projectId} className="space-y-2">
                  <div className="flex justify-between items-end">
                    <div>
                      <Link href={`/pmt/${c.code || c.projectId}`} className="font-bold text-sm text-navy-900 hover:text-blue-600 transition-colors">
                        {c.code}: {c.name}
                      </Link>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-bold text-navy-900">{formatCurrency(c.actualCost)}</span>
                      <span className="text-xs text-navy-400 mx-1">/</span>
                      <span className="text-xs text-navy-500">{formatCurrency(c.budget)}</span>
                    </div>
                  </div>
                  <div className="w-full bg-navy-50 rounded-full h-2.5 overflow-hidden border border-navy-500/5">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${c.consumedPercent > 90 ? 'bg-red-500' : c.consumedPercent > 75 ? 'bg-amber-400' : 'bg-green-500'}`} 
                      style={{ width: `${Math.min(c.consumedPercent, 100)}%` }} 
                    />
                  </div>
                  {c.consumedPercent > 100 && (
                    <p className="text-[10px] text-red-600 font-bold uppercase tracking-wider text-right">Budget Exceeded by {formatCurrency(c.actualCost - c.budget)}</p>
                  )}
                </div>
              ))}
              {costData.length === 0 && (
                <p className="text-sm text-navy-500 text-center py-4">
                  {financeScope === "all"
                    ? "No active projects found."
                    : "You are not the named project manager on any active project. Budgets and costs are shown only to a project's own PM and to administrators."}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Right Col: Timeline */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-navy-500/10 shadow-sm overflow-hidden flex flex-col h-full">
            <div className="bg-navy-50/50 px-5 py-4 border-b border-navy-500/10">
              <h3 className="font-bold text-navy-900">Upcoming Deliverables</h3>
              <p className="text-xs text-navy-500">Next 5 pending milestones</p>
            </div>
            <div className="p-5 flex-1 relative">
              <div className="absolute top-5 bottom-5 left-7 w-px bg-navy-500/10"></div>
              <div className="space-y-6 relative z-10">
                {upcomingMilestones.map((m, idx) => {
                  const proj = projects.find(p => p.id === m.project_id);
                  const isOverdue = new Date(m.due_date) < new Date();
                  return (
                    <div key={m.id} className="flex gap-4">
                      <div className={`w-4 h-4 rounded-full mt-1 border-2 bg-white flex-shrink-0 ${isOverdue ? 'border-red-500' : 'border-blue-500'}`} />
                      <div>
                        <p className={`text-xs font-bold mb-1 ${isOverdue ? 'text-red-600' : 'text-blue-600'}`}>
                          {formatDate(m.due_date)} {isOverdue && "(Overdue)"}
                        </p>
                        <h4 className="font-bold text-sm text-navy-900 leading-tight">{m.name}</h4>
                        <Link href={`/pmt/${proj?.code || proj?.id}`} className="text-xs text-navy-500 hover:text-navy-900 transition-colors mt-0.5 block">
                          {proj?.code}
                        </Link>
                      </div>
                    </div>
                  );
                })}
                {upcomingMilestones.length === 0 && (
                  <div className="text-center py-10 text-navy-400 text-sm">No upcoming milestones</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
