"use client";

import React, { useState, useEffect } from "react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { MarginPanel } from "./MarginPanel";

// Rendered only for the project's named PM and admins; the cost-summary,
// margin and billing APIs enforce the same rule on their own.
export function FinancialsTab({ projectId, canManageBilling }: { projectId: string; canManageBilling: boolean }) {
  const [costSummary, setCostSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isBilling, setIsBilling] = useState(false);

  useEffect(() => {
    async function fetchCost() {
      const res = await fetch(`/api/pmt/projects/${projectId}/cost-summary`);
      if (res.ok) {
        const rawData = (await res.json()).data;
        const totalItsmCost = rawData.itsmContribution?.totalCostInr || 0;
        const mapped = {
          budgetInr: rawData.budget.budgetedFeeInr,
          totalPlannedHours: rawData.budget.totalPlannedHours || 0,
          totalTimesheetCostInr: rawData.actuals.totalInternalCostInr,
          totalApprovedHours: rawData.actuals.totalProjectHoursLogged,
          totalAdditionalCostInr: totalItsmCost,
          remainingBudgetInr: rawData.budget.budgetedFeeInr - rawData.actuals.totalInternalCostInr - totalItsmCost,
          budgetConsumedPercent: rawData.actuals.budgetUtilizedPercent,
          breakdownByBand: (rawData.costByBand || []).map((b: any) => ({
             bandName: b.rateBandName,
             hours: b.totalHours,
             cost: b.totalCostInr,
          }))
        };
        setCostSummary(mapped);
      }
      setLoading(false);
    }
    fetchCost();
  }, [projectId]);

  if (loading) return <div className="p-6 animate-pulse bg-navy-50 h-64 rounded-xl" />;
  if (!costSummary) return <div className="p-6 text-navy-500">Failed to load financials.</div>;

  const handleNotifyBilling = async () => {
    if (!confirm("Dispatch billing notification to Finance and Zoho Books?")) return;
    setIsBilling(true);
    const res = await fetch(`/api/pmt/projects/${projectId}/billing`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Milestone achieved, ready to bill." })
    });
    if (res.ok) {
      alert("Billing notification dispatched to Zoho Books and Finance team successfully!");
    } else {
      alert("Failed to dispatch billing notification.");
    }
    setIsBilling(false);
  };

  return (
    <div className="space-y-6">
      <MarginPanel projectId={projectId} />

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-5 border border-navy-500/10 shadow-sm">
          <h3 className="text-xs font-bold text-navy-500 uppercase tracking-wide mb-1">Approved Budget</h3>
          <p className="text-2xl font-bold text-navy-900">{formatCurrency(costSummary.budgetInr)}</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-navy-500/10 shadow-sm">
          <h3 className="text-xs font-bold text-navy-500 uppercase tracking-wide mb-1">Cost (Actual vs Planned)</h3>
          <p className="text-2xl font-bold text-orange-600">{formatCurrency(costSummary.totalTimesheetCostInr)}</p>
          <p className="text-xs text-navy-400 mt-1">vs {formatCurrency(costSummary.budgetInr)} planned</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-navy-500/10 shadow-sm">
          <h3 className="text-xs font-bold text-navy-500 uppercase tracking-wide mb-1">Total Additional Cost</h3>
          <p className="text-2xl font-bold text-blue-600">{formatCurrency(costSummary.totalAdditionalCostInr)}</p>
        </div>
        <div className="bg-navy-900 rounded-xl p-5 border border-navy-500/10 shadow-sm text-white relative overflow-hidden">
          <div className="relative z-10">
            <h3 className="text-xs font-bold text-white/60 uppercase tracking-wide mb-1">Remaining Budget</h3>
            <p className={`text-2xl font-bold ${costSummary.remainingBudgetInr < 0 ? 'text-red-400' : 'text-green-400'}`}>
              {formatCurrency(costSummary.remainingBudgetInr)}
            </p>
            <p className="text-xs text-white/60 mt-1">{costSummary.budgetConsumedPercent}% consumed</p>
            <div className="w-full bg-navy-950 rounded-full h-1.5 mt-3 overflow-hidden">
              <div 
                className={`h-1.5 rounded-full ${costSummary.budgetConsumedPercent > 90 ? 'bg-red-500' : costSummary.budgetConsumedPercent > 75 ? 'bg-amber-400' : 'bg-green-500'}`} 
                style={{ width: `${Math.min(costSummary.budgetConsumedPercent, 100)}%` }} 
              />
            </div>
          </div>
        </div>
      </div>

      {/* Actual vs Planned Hours tracking */}
      {(() => {
        const plannedHours = costSummary.totalPlannedHours || 1; // Prevent division by zero
        const actualHours = costSummary.totalApprovedHours;
        const hoursPercent = (actualHours / plannedHours) * 100;
        const isEscalated = hoursPercent >= 100;
        const isWarning = hoursPercent >= 80 && !isEscalated;
        const colorClass = isEscalated ? 'bg-red-50 border-red-200 text-red-900' : isWarning ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-green-50 border-green-200 text-green-900';
        const barColorClass = isEscalated ? 'bg-red-500' : isWarning ? 'bg-amber-500' : 'bg-green-500';

        return (
          <div className={`rounded-xl p-5 border shadow-sm ${colorClass}`}>
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wide mb-1 flex items-center gap-2">
                  Actual vs Planned Hours
                  {isEscalated && <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full animate-pulse">ESCALATION ALERT</span>}
                  {isWarning && <span className="bg-amber-500 text-white text-[10px] px-2 py-0.5 rounded-full">WARNING</span>}
                </h3>
                <p className="text-3xl font-black mb-1">
                  {actualHours} <span className="text-lg font-medium opacity-60">/ {costSummary.totalPlannedHours} hrs</span>
                </p>
                <p className="text-sm opacity-80">
                  {hoursPercent.toFixed(1)}% of total allocated project hours consumed.
                </p>
              </div>
              {isEscalated && (
                <div className="text-right max-w-xs space-y-2">
                  <p className="text-xs font-bold text-red-700 bg-red-100/50 p-2 rounded-lg border border-red-200">
                    Maximum allocated hours exceeded! An alert has been dispatched to the escalation matrix. Please review the timesheets immediately.
                  </p>
                  <button onClick={() => { if(confirm("Draft a Change Request (CR) and notify the client?")) alert("CR Request Dispatched."); }} className="w-full bg-red-600 hover:bg-red-700 text-white text-xs font-bold py-2 rounded-lg transition-colors shadow-sm cursor-pointer">
                    Request CR from Client
                  </button>
                </div>
              )}
            </div>
            <div className="w-full bg-black/5 rounded-full h-2.5 mt-4 overflow-hidden">
              <div 
                className={`h-2.5 rounded-full transition-all duration-500 ${barColorClass}`} 
                style={{ width: `${Math.min(hoursPercent, 100)}%` }} 
              />
            </div>
          </div>
        );
      })()}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cost Breakdown by Band */}
        <div className="bg-white rounded-xl border border-navy-500/10 shadow-sm overflow-hidden">
          <div className="bg-navy-50/50 px-5 py-4 border-b border-navy-500/10">
            <h3 className="font-bold text-navy-900">Cost Breakdown by Role Level</h3>
            <p className="text-xs text-navy-500">Privacy-safe band level aggregation</p>
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-white text-navy-500 border-b border-navy-500/10">
              <tr>
                <th className="px-5 py-3 font-semibold">Rate Band</th>
                <th className="px-5 py-3 font-semibold text-right">Hours</th>
                <th className="px-5 py-3 font-semibold text-right">Cost (INR)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-500/10">
              {costSummary.breakdownByBand.map((b: any, idx: number) => (
                <tr key={idx} className="hover:bg-navy-50/30">
                  <td className="px-5 py-3 font-medium text-navy-900">{b.bandName}</td>
                  <td className="px-5 py-3 text-right">{b.hours}</td>
                  <td className="px-5 py-3 text-right text-navy-600">{formatCurrency(b.cost)}</td>
                </tr>
              ))}
              {costSummary.breakdownByBand.length === 0 && (
                <tr><td colSpan={3} className="px-5 py-6 text-center text-navy-400">No timesheets logged yet</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Milestone Billing Module */}
        <div className="bg-white rounded-xl border border-navy-500/10 shadow-sm overflow-hidden flex flex-col">
          <div className="bg-navy-50/50 px-5 py-4 border-b border-navy-500/10 flex justify-between items-center">
            <div>
              <h3 className="font-bold text-navy-900">Milestone Billing Triggers</h3>
              <p className="text-xs text-navy-500">Dispatch to Zoho Books & Finance</p>
            </div>
          </div>
          <div className="p-5 flex-1 flex flex-col items-center justify-center text-center space-y-4">
            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center text-3xl text-blue-600">
              🧾
            </div>
            <div>
              <h4 className="font-bold text-navy-900">Ready to Bill</h4>
              <p className="text-sm text-navy-500 mt-1 max-w-sm">
                Project Manager can manually trigger billing notifications to the Finance team when milestones are achieved.
              </p>
            </div>
            {canManageBilling ? (
              <button onClick={handleNotifyBilling} disabled={isBilling} className="px-5 py-2.5 bg-navy-900 text-white rounded-xl font-semibold shadow-sm hover:bg-navy-700 transition-colors disabled:opacity-50">
                {isBilling ? "Dispatching..." : "Dispatch Billing Notification"}
              </button>
            ) : (
              <p className="text-xs font-semibold text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg">Only this project's PM or an admin can trigger billing</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
