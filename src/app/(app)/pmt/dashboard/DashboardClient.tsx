"use client";

import React from "react";
import Link from "next/link";
import { formatCurrency, formatDate } from "@/lib/utils";
import { PmtHeaderTabs } from "@/components/layout/PmtHeaderTabs";
import { StatCard } from "@/components/ui/Card";
import {
  AccPieChart,
  AccBarChart,
  AccComposedChart,
  AccLineChart,
  CHART_COLORS,
} from "@/components/ui/Charts";

interface CostData {
  projectId: string;
  code: string;
  name: string;
  budget: number;
  actualCost: number;
  consumedPercent: number;
}

interface PhaseCount {
  name: string;
  value: number;
}

interface MonthlyTicketTrend {
  month: string;
  created: number;
  resolved: number;
}

interface ProjectStatusCount {
  name: string;
  value: number;
}

export function DashboardClient({
  projects,
  milestones,
  costData,
  financeScope = "managed",
  phaseDistribution = [],
  monthlyTicketTrend = [],
  ticketPriorityBreakdown = [],
  projectStatusCounts = [],
  userRole,
}: {
  projects: any[];
  milestones: any[];
  costData: CostData[];
  /** "all" for an admin; otherwise only projects this person is the named PM of. */
  financeScope?: "all" | "managed";
  phaseDistribution?: PhaseCount[];
  monthlyTicketTrend?: MonthlyTicketTrend[];
  ticketPriorityBreakdown?: { name: string; value: number }[];
  projectStatusCounts?: ProjectStatusCount[];
  userRole: string;
}) {
  const scopeNote = financeScope === "all" ? "All active projects" : "Projects you manage";
  const activeCount = projects.filter(p => p.status === "active").length;
  const totalBudget = costData.reduce((acc, c) => acc + c.budget, 0);
  const totalBurned = costData.reduce((acc, c) => acc + c.actualCost, 0);
  const totalBurnedPercent = totalBudget > 0 ? (totalBurned / totalBudget) * 100 : 0;
  
  const pendingMilestones = milestones.filter(m => m.status !== "completed");
  const upcomingMilestones = pendingMilestones.slice(0, 5);
  const overdueMilestones = pendingMilestones.filter(m => new Date(m.due_date) < new Date());

  // Cost bar data for the composed chart
  const costBarData = costData.slice(0, 8).map(c => ({
    name: c.code,
    budget: c.budget,
    actual: c.actualCost,
    variance: c.budget - c.actualCost,
  }));

  return (
    <div className="space-y-6">
      {/* PMT High-Level Tabs */}
      <PmtHeaderTabs
        title="Portfolio Dashboard"
        subtitle="High-level view of active projects, delivery timeline, and portfolio burn rates"
        userRole={userRole}
      />

      {/* ── KPI Cards with color-coded top accents ───────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Active Projects"
          value={activeCount}
          accentTop="#3b82f6"
          hint="Projects with recent activity"
          icon={
            <svg className="h-4.5 w-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
            </svg>
          }
        />
        <StatCard
          label="Portfolio Budget"
          value={formatCurrency(totalBudget)}
          accentTop="#10b981"
          hint={scopeNote}
          icon={
            <svg className="h-4.5 w-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          }
          tone="positive"
        />
        <StatCard
          label="Burned Cost"
          value={formatCurrency(totalBurned)}
          accentTop={totalBurnedPercent > 85 ? "#ef4444" : "#f59e0b"}
          hint={`${totalBurnedPercent.toFixed(1)}% of total budget`}
          tone={totalBurnedPercent > 85 ? "critical" : totalBurnedPercent > 60 ? "warning" : "default"}
          icon={
            <svg className="h-4.5 w-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20V10M18 20V4M6 20v-4" />
            </svg>
          }
        />
        <StatCard
          label="Overdue Milestones"
          value={overdueMilestones.length}
          accentTop={overdueMilestones.length > 0 ? "#ef4444" : "#10b981"}
          hint={`of ${pendingMilestones.length} pending`}
          tone={overdueMilestones.length > 2 ? "critical" : overdueMilestones.length > 0 ? "warning" : "positive"}
          icon={
            <svg className="h-4.5 w-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
            </svg>
          }
        />
      </div>

      {/* ── Charts Row 1: Phase Distribution + Ticket Priority ──── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Projects by Phase */}
        <div className="bg-white rounded-xl border border-navy-500/10 shadow-sm overflow-hidden">
          <div className="bg-navy-50/50 px-5 py-4 border-b border-navy-500/10">
            <h3 className="font-bold text-navy-900">Projects by Phase</h3>
            <p className="text-xs text-navy-500">Active projects grouped by delivery phase</p>
          </div>
          <div className="p-5">
            {phaseDistribution.length > 0 ? (
              <AccPieChart
                data={phaseDistribution}
                height={260}
                innerRadius={50}
                outerRadius={95}
                colors={["#3b82f6", "#8b5cf6", "#6366f1", "#06b6d4", "#f59e0b", "#ec4899", "#10b981", "#64748b"]}
              />
            ) : (
              <div className="flex items-center justify-center h-[260px] text-sm text-navy-400">
                No active projects to display
              </div>
            )}
          </div>
        </div>

        {/* Ticket Priority Breakdown */}
        <div className="bg-white rounded-xl border border-navy-500/10 shadow-sm overflow-hidden">
          <div className="bg-navy-50/50 px-5 py-4 border-b border-navy-500/10">
            <h3 className="font-bold text-navy-900">Open Tickets by Priority</h3>
            <p className="text-xs text-navy-500">ITSM service desk load distribution</p>
          </div>
          <div className="p-5">
            {ticketPriorityBreakdown.length > 0 ? (
              <AccBarChart
                data={ticketPriorityBreakdown}
                bars={[{ dataKey: "value", name: "Tickets", color: "#3b82f6" }]}
                height={260}
                showLegend={false}
              />
            ) : (
              <div className="flex items-center justify-center h-[260px] text-sm text-navy-400">
                No open tickets
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Charts Row 2: Budget vs Actual + Monthly Trend ──────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Budget vs Actual Cost */}
        <div className="bg-white rounded-xl border border-navy-500/10 shadow-sm overflow-hidden">
          <div className="bg-navy-50/50 px-5 py-4 border-b border-navy-500/10">
            <h3 className="font-bold text-navy-900">Budget vs Actual Cost</h3>
            <p className="text-xs text-navy-500">
              Planned budget vs timesheet-derived cost · {scopeNote.toLowerCase()}
            </p>
          </div>
          <div className="p-5">
            {costBarData.length > 0 ? (
              <AccComposedChart
                data={costBarData}
                bars={[
                  { dataKey: "budget", name: "Budget", color: "#3b82f6", radius: 4 },
                  { dataKey: "actual", name: "Actual Cost", color: "#f59e0b", radius: 4 },
                ]}
                lines={[
                  { dataKey: "variance", name: "Variance", color: "#10b981" },
                ]}
                height={280}
                formatValue={(v) => {
                  if (v >= 10000000) return `₹${(v / 10000000).toFixed(1)}Cr`;
                  if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
                  if (v >= 1000) return `₹${(v / 1000).toFixed(0)}K`;
                  return `₹${v}`;
                }}
              />
            ) : (
              <div className="flex items-center justify-center h-[280px] text-sm text-navy-400">
                No cost data available
              </div>
            )}
          </div>
        </div>

        {/* Monthly Ticket Trend */}
        <div className="bg-white rounded-xl border border-navy-500/10 shadow-sm overflow-hidden">
          <div className="bg-navy-50/50 px-5 py-4 border-b border-navy-500/10">
            <h3 className="font-bold text-navy-900">Ticket Volume Trend</h3>
            <p className="text-xs text-navy-500">Created vs resolved tickets over recent months</p>
          </div>
          <div className="p-5">
            {monthlyTicketTrend.length > 0 ? (
              <AccLineChart
                data={monthlyTicketTrend}
                lines={[
                  { dataKey: "created", name: "Created", color: "#ef4444" },
                  { dataKey: "resolved", name: "Resolved", color: "#10b981" },
                ]}
                xKey="month"
                height={280}
              />
            ) : (
              <div className="flex items-center justify-center h-[280px] text-sm text-navy-400">
                No ticket data for trend
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Bottom Row: Cost Bars + Upcoming Milestones ──────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Col: Project Cost Bars */}
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
                {upcomingMilestones.map((m) => {
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
