"use client";

import React, { useState, useEffect, useCallback } from "react";
import { formatCurrency } from "@/lib/utils";
import { MarginPanel } from "./MarginPanel";
import { Modal } from "@/components/ui/Modal";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

interface AdditionalCostItem {
  id: string;
  category: "software" | "cloud_infra" | "travel" | "hardware" | "contractor" | "other" | "itsm_support";
  description: string;
  plannedAmountInr: number;
  actualAmountInr: number;
  varianceInr: number;
  status: "planned" | "incurred" | "approved" | "settled";
  notes?: string;
}

interface CostSummaryData {
  budget: {
    budgetedFeeInr: number;
    poValueInr: number;
    totalPlannedHours: number;
    currency: string;
  };
  actuals: {
    totalProjectHoursLogged: number;
    totalItsmHoursLogged: number;
    totalHoursLogged: number;
    totalInternalCostInr: number;
    totalBillableValueInr: number;
    marginInr: number;
    marginPercent: number;
    budgetUtilizedPercent: number;
  };
  labor: {
    plannedHours: number;
    actualHours: number;
    varianceHours: number;
    plannedCostInr: number;
    actualCostInr: number;
    varianceCostInr: number;
  };
  overhead: {
    percent: number;
    plannedInr: number;
    actualInr: number;
    varianceInr: number;
  };
  additionalCosts: {
    totalPlannedInr: number;
    totalActualInr: number;
    directActualInr: number;
    itsmCostInr: number;
    varianceInr: number;
    items: AdditionalCostItem[];
    byCategory: {
      category: string;
      plannedInr: number;
      actualInr: number;
      varianceInr: number;
      count: number;
    }[];
  };
  totals: {
    plannedTotalCostInr: number;
    actualTotalCostInr: number;
    varianceCostInr: number;
    plannedMarginInr: number;
    plannedMarginPercent: number;
    actualMarginInr: number;
    actualMarginPercent: number;
  };
  costByBand: any[];
  costByPhase: any[];
  itsmContribution: any;
}

const CATEGORY_META: Record<string, { label: string; icon: string; color: string }> = {
  software: { label: "Software & Licenses", icon: "💻", color: "bg-blue-50 text-blue-700 border-blue-200" },
  cloud_infra: { label: "Cloud & Infrastructure", icon: "☁️", color: "bg-sky-50 text-sky-700 border-sky-200" },
  travel: { label: "Travel & Logistics", icon: "✈️", color: "bg-purple-50 text-purple-700 border-purple-200" },
  hardware: { label: "Hardware & Devices", icon: "🖥️", color: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  contractor: { label: "Vendor & Contractors", icon: "🤝", color: "bg-amber-50 text-amber-700 border-amber-200" },
  itsm_support: { label: "ITSM Ops Support", icon: "🎫", color: "bg-teal-50 text-teal-700 border-teal-200" },
  other: { label: "Other Expenses", icon: "📦", color: "bg-neutral-50 text-neutral-700 border-neutral-200" },
};

export function FinancialsTab({
  projectId,
  canManageBilling,
}: {
  projectId: string;
  canManageBilling: boolean;
}) {
  const [data, setData] = useState<CostSummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isBilling, setIsBilling] = useState(false);

  // Modal states for additional costs
  const [isCostModalOpen, setIsCostModalOpen] = useState(false);
  const [editingCost, setEditingCost] = useState<AdditionalCostItem | null>(null);
  const [costForm, setCostForm] = useState({
    category: "software",
    description: "",
    plannedAmountInr: "",
    actualAmountInr: "",
    status: "planned",
    notes: "",
  });
  const [savingCost, setSavingCost] = useState(false);
  const [costError, setCostError] = useState("");

  // Modal state for overhead percent
  const [isOverheadModalOpen, setIsOverheadModalOpen] = useState(false);
  const [overheadPercentInput, setOverheadPercentInput] = useState("0");
  const [savingOverhead, setSavingOverhead] = useState(false);

  const fetchCost = useCallback(async () => {
    try {
      const res = await fetch(`/api/pmt/projects/${projectId}/cost-summary`);
      if (res.ok) {
        const json = await res.json();
        setData(json.data);
        if (json.data?.overhead?.percent !== undefined) {
          setOverheadPercentInput(String(json.data.overhead.percent));
        }
      }
    } catch (err) {
      console.error("fetchCost error:", err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void fetchCost();
  }, [fetchCost]);

  const handleNotifyBilling = async () => {
    if (!confirm("Dispatch billing notification to Finance and Zoho Books?")) return;
    setIsBilling(true);
    try {
      const res = await fetch(`/api/pmt/projects/${projectId}/billing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Milestone achieved, ready to bill." }),
      });
      if (res.ok) {
        alert("Billing notification dispatched to Zoho Books and Finance team successfully!");
      } else {
        alert("Failed to dispatch billing notification.");
      }
    } finally {
      setIsBilling(false);
    }
  };

  const openAddCostModal = () => {
    setEditingCost(null);
    setCostForm({
      category: "software",
      description: "",
      plannedAmountInr: "",
      actualAmountInr: "0",
      status: "planned",
      notes: "",
    });
    setCostError("");
    setIsCostModalOpen(true);
  };

  const openEditCostModal = (item: AdditionalCostItem) => {
    setEditingCost(item);
    setCostForm({
      category: item.category,
      description: item.description,
      plannedAmountInr: String(item.plannedAmountInr || 0),
      actualAmountInr: String(item.actualAmountInr || 0),
      status: item.status,
      notes: item.notes || "",
    });
    setCostError("");
    setIsCostModalOpen(true);
  };

  const handleSaveCost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!costForm.description.trim()) {
      setCostError("Description is required");
      return;
    }
    setSavingCost(true);
    setCostError("");

    try {
      const payload = {
        category: costForm.category,
        description: costForm.description.trim(),
        plannedAmountInr: Number(costForm.plannedAmountInr) || 0,
        actualAmountInr: Number(costForm.actualAmountInr) || 0,
        status: costForm.status,
        notes: costForm.notes.trim() || null,
      };

      const url = editingCost
        ? `/api/pmt/projects/${projectId}/additional-costs/${editingCost.id}`
        : `/api/pmt/projects/${projectId}/additional-costs`;
      const method = editingCost ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const resData = await res.json().catch(() => null);
      if (!res.ok || resData?.error) {
        throw new Error(resData?.error || "Failed to save additional cost item.");
      }

      setIsCostModalOpen(false);
      await fetchCost();
    } catch (err: any) {
      setCostError(err.message || "An error occurred.");
    } finally {
      setSavingCost(false);
    }
  };

  const handleDeleteCost = async (costId: string) => {
    if (!confirm("Are you sure you want to delete this cost item?")) return;
    try {
      const res = await fetch(`/api/pmt/projects/${projectId}/additional-costs/${costId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        await fetchCost();
      } else {
        alert("Failed to delete cost item.");
      }
    } catch (err) {
      alert("Error deleting cost item.");
    }
  };

  const handleSaveOverhead = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingOverhead(true);
    try {
      const res = await fetch(`/api/pmt/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overheadPercent: Number(overheadPercentInput) || 0 }),
      });
      if (res.ok) {
        setIsOverheadModalOpen(false);
        await fetchCost();
      } else {
        alert("Failed to update overhead percentage.");
      }
    } catch (err) {
      alert("Network error updating overhead.");
    } finally {
      setSavingOverhead(false);
    }
  };

  if (loading) return <div className="p-6 animate-pulse bg-navy-50 h-96 rounded-xl" />;
  if (!data) return <div className="p-6 text-navy-500">Failed to load financials.</div>;

  const budgetInr = data.budget.budgetedFeeInr || 0;
  const plannedLabor = data.labor?.plannedCostInr || 0;
  const actualLabor = data.labor?.actualCostInr || data.actuals.totalInternalCostInr || 0;
  const plannedOverhead = data.overhead?.plannedInr || 0;
  const actualOverhead = data.overhead?.actualInr || 0;
  const overheadPercent = data.overhead?.percent || 0;
  const plannedAdditional = data.additionalCosts?.totalPlannedInr || 0;
  const actualAdditional = data.additionalCosts?.totalActualInr || 0;
  const plannedTotalCost = data.totals?.plannedTotalCostInr || (plannedLabor + plannedOverhead + plannedAdditional);
  const actualTotalCost = data.totals?.actualTotalCostInr || (actualLabor + actualOverhead + actualAdditional);
  const totalCostVariance = plannedTotalCost - actualTotalCost;
  const remainingBudget = budgetInr - actualTotalCost;
  const budgetConsumedPercent = budgetInr > 0 ? (actualTotalCost / budgetInr) * 100 : 0;
  const plannedMarginPercent = data.totals?.plannedMarginPercent ?? (budgetInr > 0 ? ((budgetInr - plannedTotalCost) / budgetInr) * 100 : 0);
  const actualMarginPercent = data.totals?.actualMarginPercent ?? (budgetInr > 0 ? ((budgetInr - actualTotalCost) / budgetInr) * 100 : 0);

  return (
    <div className="space-y-6">
      <MarginPanel projectId={projectId} />

      {/* ── 1. Comprehensive Executive Overview Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
        {/* Approved Budget */}
        <div className="bg-white rounded-xl p-4 border border-navy-500/10 shadow-sm">
          <span className="text-[11px] font-bold text-navy-400 uppercase tracking-wider block mb-1">
            Approved Budget
          </span>
          <p className="text-xl font-bold text-navy-900">{formatCurrency(budgetInr)}</p>
          <p className="text-[11px] text-navy-500 mt-1 truncate">
            {data.budget.poValueInr > 0 ? `PO: ${formatCurrency(data.budget.poValueInr)}` : "Fixed / T&M Baseline"}
          </p>
        </div>

        {/* Labor Cost */}
        <div className="bg-white rounded-xl p-4 border border-navy-500/10 shadow-sm">
          <span className="text-[11px] font-bold text-navy-400 uppercase tracking-wider block mb-1">
            Labor Cost (Act / Plan)
          </span>
          <p className="text-xl font-bold text-navy-900">{formatCurrency(actualLabor)}</p>
          <p className="text-[11px] text-navy-500 mt-1">
            Planned: <span className="font-semibold text-navy-700">{formatCurrency(plannedLabor)}</span>
          </p>
        </div>

        {/* Overhead Loading */}
        <div className="bg-white rounded-xl p-4 border border-navy-500/10 shadow-sm relative group">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold text-navy-400 uppercase tracking-wider">
              Overhead ({overheadPercent}%)
            </span>
            <button
              onClick={() => setIsOverheadModalOpen(true)}
              className="text-[10px] text-blue-600 hover:text-blue-800 font-semibold underline cursor-pointer"
            >
              Edit %
            </button>
          </div>
          <p className="text-xl font-bold text-purple-700">{formatCurrency(actualOverhead)}</p>
          <p className="text-[11px] text-navy-500 mt-1">
            Planned: <span className="font-semibold text-navy-700">{formatCurrency(plannedOverhead)}</span>
          </p>
        </div>

        {/* Additional Costs */}
        <div className="bg-white rounded-xl p-4 border border-navy-500/10 shadow-sm">
          <span className="text-[11px] font-bold text-navy-400 uppercase tracking-wider block mb-1">
            Additional Costs
          </span>
          <p className="text-xl font-bold text-blue-700">{formatCurrency(actualAdditional)}</p>
          <p className="text-[11px] text-navy-500 mt-1">
            Planned: <span className="font-semibold text-navy-700">{formatCurrency(plannedAdditional)}</span>
          </p>
        </div>

        {/* Total Cost vs Budget */}
        <div className="bg-white rounded-xl p-4 border border-navy-500/10 shadow-sm">
          <span className="text-[11px] font-bold text-navy-400 uppercase tracking-wider block mb-1">
            Total Incurred Cost
          </span>
          <p className={`text-xl font-bold ${actualTotalCost > plannedTotalCost && plannedTotalCost > 0 ? "text-danger" : "text-navy-900"}`}>
            {formatCurrency(actualTotalCost)}
          </p>
          <p className="text-[11px] text-navy-500 mt-1">
            Planned: <span className="font-semibold text-navy-700">{formatCurrency(plannedTotalCost)}</span>
          </p>
        </div>

        {/* Net Margin */}
        <div className="bg-navy-900 rounded-xl p-4 border border-navy-500/10 shadow-sm text-white">
          <span className="text-[11px] font-bold text-white/60 uppercase tracking-wider block mb-1">
            Net Margin (Act / Plan)
          </span>
          <p className={`text-xl font-bold ${actualMarginPercent < 0 ? "text-danger-light" : "text-emerald-400"}`}>
            {actualMarginPercent.toFixed(1)}%
          </p>
          <p className="text-[11px] text-white/70 mt-1 truncate">
            Plan: {plannedMarginPercent.toFixed(1)}% · Rem: {formatCurrency(remainingBudget)}
          </p>
        </div>
      </div>

      {/* ── 2. Planned vs Actual Cost Matrix Table ── */}
      <div className="bg-white rounded-xl border border-navy-500/10 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-navy-500/10 bg-navy-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="font-bold text-navy-900 text-sm">Planned vs Actual Cost Comparison</h3>
            <p className="text-xs text-navy-500">
              Complete cost build-up including labor timesheets, overhead loading, and additional expenses.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                totalCostVariance >= 0
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-red-50 text-red-700 border border-red-200"
              }`}
            >
              {totalCostVariance >= 0
                ? `Cost Savings: +${formatCurrency(totalCostVariance)}`
                : `Cost Overrun: -${formatCurrency(Math.abs(totalCostVariance))}`}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-navy-50/30 text-navy-500 border-b border-navy-500/10 text-xs uppercase font-semibold">
              <tr>
                <th className="px-5 py-3">Cost Component</th>
                <th className="px-5 py-3 text-right">Planned (INR)</th>
                <th className="px-5 py-3 text-right">Actual (INR)</th>
                <th className="px-5 py-3 text-right">Variance</th>
                <th className="px-5 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-500/10 text-xs">
              {/* Direct Labor */}
              <tr className="hover:bg-navy-50/30">
                <td className="px-5 py-3.5 font-medium text-navy-900">
                  <div className="flex items-center gap-2">
                    <span>👥</span>
                    <div>
                      <span className="font-semibold block text-navy-900">1. Direct Labor (Timesheets & Staffing)</span>
                      <span className="text-[11px] text-navy-400">
                        {data.labor.actualHours} hrs logged vs {data.labor.plannedHours} hrs planned
                      </span>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3.5 text-right font-medium text-navy-700">{formatCurrency(plannedLabor)}</td>
                <td className="px-5 py-3.5 text-right font-bold text-navy-900">{formatCurrency(actualLabor)}</td>
                <td className="px-5 py-3.5 text-right font-medium">
                  {plannedLabor - actualLabor >= 0 ? (
                    <span className="text-emerald-600">+{formatCurrency(plannedLabor - actualLabor)}</span>
                  ) : (
                    <span className="text-danger">-{formatCurrency(Math.abs(plannedLabor - actualLabor))}</span>
                  )}
                </td>
                <td className="px-5 py-3.5 text-center">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                      actualLabor <= plannedLabor
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-red-100 text-red-800"
                    }`}
                  >
                    {actualLabor <= plannedLabor ? "Within Plan" : "Exceeded"}
                  </span>
                </td>
              </tr>

              {/* Overhead */}
              <tr className="hover:bg-navy-50/30">
                <td className="px-5 py-3.5 font-medium text-navy-900">
                  <div className="flex items-center gap-2">
                    <span>⚙️</span>
                    <div>
                      <span className="font-semibold block text-navy-900">2. Operational Overhead</span>
                      <span className="text-[11px] text-navy-400">
                        {overheadPercent}% operational loading rate applied to internal labor
                      </span>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3.5 text-right font-medium text-navy-700">{formatCurrency(plannedOverhead)}</td>
                <td className="px-5 py-3.5 text-right font-bold text-purple-700">{formatCurrency(actualOverhead)}</td>
                <td className="px-5 py-3.5 text-right font-medium">
                  {plannedOverhead - actualOverhead >= 0 ? (
                    <span className="text-emerald-600">+{formatCurrency(plannedOverhead - actualOverhead)}</span>
                  ) : (
                    <span className="text-danger">-{formatCurrency(Math.abs(plannedOverhead - actualOverhead))}</span>
                  )}
                </td>
                <td className="px-5 py-3.5 text-center">
                  <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800">
                    {overheadPercent}% Rate
                  </span>
                </td>
              </tr>

              {/* Additional Costs */}
              <tr className="hover:bg-navy-50/30">
                <td className="px-5 py-3.5 font-medium text-navy-900">
                  <div className="flex items-center gap-2">
                    <span>📦</span>
                    <div>
                      <span className="font-semibold block text-navy-900">3. Project Additional Costs & Expenses</span>
                      <span className="text-[11px] text-navy-400">
                        Software, cloud, travel, hardware, third-party vendor, and ITSM ops
                      </span>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3.5 text-right font-medium text-navy-700">{formatCurrency(plannedAdditional)}</td>
                <td className="px-5 py-3.5 text-right font-bold text-blue-700">{formatCurrency(actualAdditional)}</td>
                <td className="px-5 py-3.5 text-right font-medium">
                  {plannedAdditional - actualAdditional >= 0 ? (
                    <span className="text-emerald-600">+{formatCurrency(plannedAdditional - actualAdditional)}</span>
                  ) : (
                    <span className="text-danger">-{formatCurrency(Math.abs(plannedAdditional - actualAdditional))}</span>
                  )}
                </td>
                <td className="px-5 py-3.5 text-center">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                      actualAdditional <= plannedAdditional
                        ? "bg-blue-100 text-blue-800"
                        : "bg-red-100 text-red-800"
                    }`}
                  >
                    {actualAdditional <= plannedAdditional ? "Controlled" : "Exceeded"}
                  </span>
                </td>
              </tr>

              {/* Total Cost Summary Row */}
              <tr className="bg-navy-50/70 font-bold border-t-2 border-navy-500/20">
                <td className="px-5 py-3.5 text-navy-900">Total Project Expenditure</td>
                <td className="px-5 py-3.5 text-right text-navy-900">{formatCurrency(plannedTotalCost)}</td>
                <td className="px-5 py-3.5 text-right text-navy-900 text-sm">{formatCurrency(actualTotalCost)}</td>
                <td className="px-5 py-3.5 text-right">
                  {totalCostVariance >= 0 ? (
                    <span className="text-emerald-700">+{formatCurrency(totalCostVariance)}</span>
                  ) : (
                    <span className="text-danger">-{formatCurrency(Math.abs(totalCostVariance))}</span>
                  )}
                </td>
                <td className="px-5 py-3.5 text-center">
                  <span className="inline-block px-2.5 py-0.5 rounded text-[11px] font-bold bg-navy-900 text-white">
                    {budgetConsumedPercent.toFixed(1)}% of Budget
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 3. Additional Costs Line Items & Overhead Management ── */}
      <div className="bg-white rounded-xl border border-navy-500/10 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-navy-500/10 bg-navy-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-navy-900 text-sm">Overhead & Additional Costs Details</h3>
              <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full font-semibold">
                {data.additionalCosts.items.length} items
              </span>
            </div>
            <p className="text-xs text-navy-500 mt-0.5">
              Itemized non-labor project expenditures with live planned vs actual tracking.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => setIsOverheadModalOpen(true)}>
              ⚙️ Overhead: {overheadPercent}%
            </Button>
            <Button size="sm" onClick={openAddCostModal}>
              + Add Cost Item
            </Button>
          </div>
        </div>

        {/* Category Breakdown Chips */}
        {data.additionalCosts.byCategory.length > 0 && (
          <div className="p-4 bg-navy-50/20 border-b border-navy-500/10 flex flex-wrap gap-2.5">
            {data.additionalCosts.byCategory.map((cat) => {
              const meta = CATEGORY_META[cat.category] || CATEGORY_META.other;
              return (
                <div
                  key={cat.category}
                  className={`px-3 py-1.5 rounded-lg border text-xs flex items-center gap-2 ${meta.color}`}
                >
                  <span>{meta.icon}</span>
                  <span className="font-semibold">{meta.label}:</span>
                  <span>{formatCurrency(cat.actualInr)}</span>
                  <span className="text-[10px] opacity-70">/ {formatCurrency(cat.plannedInr)}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Itemized Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-white text-navy-500 border-b border-navy-500/10 uppercase font-semibold">
              <tr>
                <th className="px-5 py-3">Category</th>
                <th className="px-5 py-3">Description</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Planned (INR)</th>
                <th className="px-5 py-3 text-right">Actual (INR)</th>
                <th className="px-5 py-3 text-right">Variance</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-500/10">
              {data.additionalCosts.items.map((item) => {
                const meta = CATEGORY_META[item.category] || CATEGORY_META.other;
                const variance = item.plannedAmountInr - item.actualAmountInr;
                return (
                  <tr key={item.id} className="hover:bg-navy-50/30">
                    <td className="px-5 py-3 font-medium">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[11px] font-semibold ${meta.color}`}>
                        <span>{meta.icon}</span>
                        <span>{meta.label}</span>
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className="font-medium text-navy-900 block">{item.description}</span>
                      {item.notes && <span className="text-[10px] text-navy-400 block mt-0.5">{item.notes}</span>}
                    </td>
                    <td className="px-5 py-3">
                      <span className="inline-block px-2 py-0.5 rounded capitalize text-[10px] font-bold bg-neutral-100 text-neutral-700">
                        {item.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right font-medium text-navy-700">
                      {formatCurrency(item.plannedAmountInr)}
                    </td>
                    <td className="px-5 py-3 text-right font-bold text-navy-900">
                      {formatCurrency(item.actualAmountInr)}
                    </td>
                    <td className="px-5 py-3 text-right font-medium">
                      {variance >= 0 ? (
                        <span className="text-emerald-600">+{formatCurrency(variance)}</span>
                      ) : (
                        <span className="text-danger">-{formatCurrency(Math.abs(variance))}</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => openEditCostModal(item)}
                          className="px-2 py-1 text-[11px] font-medium text-navy-600 hover:text-navy-900 hover:bg-neutral-100 rounded transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteCost(item.id)}
                          className="px-2 py-1 text-[11px] font-medium text-danger hover:bg-danger-bg rounded transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {/* ITSM Support Operations (if any) */}
              {data.itsmContribution && data.itsmContribution.totalCostInr > 0 && (
                <tr className="bg-teal-50/20">
                  <td className="px-5 py-3 font-medium">
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[11px] font-semibold bg-teal-50 text-teal-700 border-teal-200">
                      <span>🎫</span>
                      <span>ITSM Ops Support</span>
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span className="font-medium text-navy-900 block">ITSM Ticket & Change Request Time Logs</span>
                    <span className="text-[10px] text-navy-400 block mt-0.5">
                      {data.itsmContribution.totalHours} hours auto-aggregated from linked ITSM incidents
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-teal-100 text-teal-800">
                      Auto-Logged
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right font-medium text-navy-700">—</td>
                  <td className="px-5 py-3 text-right font-bold text-teal-800">
                    {formatCurrency(data.itsmContribution.totalCostInr)}
                  </td>
                  <td className="px-5 py-3 text-right font-medium text-danger">
                    -{formatCurrency(data.itsmContribution.totalCostInr)}
                  </td>
                  <td className="px-5 py-3 text-right text-navy-400 text-[10px]">Auto-calculated</td>
                </tr>
              )}

              {data.additionalCosts.items.length === 0 && (!data.itsmContribution || data.itsmContribution.totalCostInr === 0) && (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-navy-400">
                    No additional cost items recorded yet. Click &quot;+ Add Cost Item&quot; to log software licenses, cloud infrastructure, or travel expenses.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 4. Actual vs Planned Hours Progress & Alert ── */}
      {(() => {
        const plannedHours = data.labor.plannedHours || 1;
        const actualHours = data.labor.actualHours;
        const hoursPercent = (actualHours / plannedHours) * 100;
        const isEscalated = hoursPercent >= 100;
        const isWarning = hoursPercent >= 80 && !isEscalated;
        const colorClass = isEscalated
          ? "bg-red-50 border-red-200 text-red-900"
          : isWarning
            ? "bg-amber-50 border-amber-200 text-amber-900"
            : "bg-green-50 border-green-200 text-green-900";
        const barColorClass = isEscalated ? "bg-red-500" : isWarning ? "bg-amber-500" : "bg-green-500";

        return (
          <div className={`rounded-xl p-5 border shadow-sm ${colorClass}`}>
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wide mb-1 flex items-center gap-2">
                  Actual vs Planned Hours
                  {isEscalated && (
                    <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full animate-pulse">
                      ESCALATION ALERT
                    </span>
                  )}
                  {isWarning && (
                    <span className="bg-amber-500 text-white text-[10px] px-2 py-0.5 rounded-full">WARNING</span>
                  )}
                </h3>
                <p className="text-3xl font-black mb-1">
                  {actualHours} <span className="text-lg font-medium opacity-60">/ {data.labor.plannedHours} hrs</span>
                </p>
                <p className="text-sm opacity-80">
                  {hoursPercent.toFixed(1)}% of total allocated project hours consumed.
                </p>
              </div>
              {isEscalated && (
                <div className="text-right max-w-xs space-y-2">
                  <p className="text-xs font-bold text-red-700 bg-red-100/50 p-2 rounded-lg border border-red-200">
                    Allocated hours exceeded! An alert has been dispatched to the escalation matrix.
                  </p>
                  <button
                    onClick={() => {
                      if (confirm("Draft a Change Request (CR) and notify the client?")) alert("CR Request Dispatched.");
                    }}
                    className="w-full bg-red-600 hover:bg-red-700 text-white text-xs font-bold py-2 rounded-lg transition-colors shadow-sm cursor-pointer"
                  >
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

      {/* ── 5. Breakdown by Role & Billing Trigger ── */}
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
              {data.costByBand.map((b: any, idx: number) => (
                <tr key={idx} className="hover:bg-navy-50/30">
                  <td className="px-5 py-3 font-medium text-navy-900">{b.rateBandName}</td>
                  <td className="px-5 py-3 text-right">{b.totalHours}</td>
                  <td className="px-5 py-3 text-right text-navy-600">{formatCurrency(b.totalCostInr)}</td>
                </tr>
              ))}
              {data.costByBand.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-5 py-6 text-center text-navy-400">
                    No timesheets logged yet
                  </td>
                </tr>
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
              <button
                onClick={handleNotifyBilling}
                disabled={isBilling}
                className="px-5 py-2.5 bg-navy-900 text-white rounded-xl font-semibold shadow-sm hover:bg-navy-700 transition-colors disabled:opacity-50"
              >
                {isBilling ? "Dispatching..." : "Dispatch Billing Notification"}
              </button>
            ) : (
              <p className="text-xs font-semibold text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg">
                Only this project&apos;s PM or an admin can trigger billing
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Modal: Add / Edit Additional Cost Item ── */}
      <Modal
        isOpen={isCostModalOpen}
        onClose={() => setIsCostModalOpen(false)}
        title={editingCost ? "Edit Additional Cost" : "Add Project Additional Cost"}
        description="Record non-labor expenditures such as software licenses, cloud infrastructure, hardware, or travel."
        size="md"
      >
        <form onSubmit={handleSaveCost} className="space-y-4">
          {costError && (
            <div className="p-3 bg-red-50 text-red-700 text-xs rounded-lg border border-red-200">
              {costError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Expense Category"
              value={costForm.category}
              onChange={(e) => setCostForm((f) => ({ ...f, category: e.target.value }))}
            >
              <option value="software">💻 Software & Tooling</option>
              <option value="cloud_infra">☁️ Cloud & Infrastructure</option>
              <option value="travel">✈️ Travel & Logistics</option>
              <option value="hardware">🖥️ Hardware & Devices</option>
              <option value="contractor">🤝 Vendor & Contractors</option>
              <option value="other">📦 Other Project Expense</option>
            </Select>

            <Select
              label="Payment / Approval Status"
              value={costForm.status}
              onChange={(e) => setCostForm((f) => ({ ...f, status: e.target.value }))}
            >
              <option value="planned">Planned (Budgeted)</option>
              <option value="incurred">Incurred (Billed)</option>
              <option value="approved">Approved</option>
              <option value="settled">Settled / Paid</option>
            </Select>
          </div>

          <Input
            label="Description"
            placeholder="e.g. AWS Production Cluster Hosting (6 months)"
            required
            value={costForm.description}
            onChange={(e) => setCostForm((f) => ({ ...f, description: e.target.value }))}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Planned Amount (INR)"
              type="number"
              min={0}
              step={100}
              placeholder="0"
              value={costForm.plannedAmountInr}
              onChange={(e) => setCostForm((f) => ({ ...f, plannedAmountInr: e.target.value }))}
            />
            <Input
              label="Actual Incurred Amount (INR)"
              type="number"
              min={0}
              step={100}
              placeholder="0"
              value={costForm.actualAmountInr}
              onChange={(e) => setCostForm((f) => ({ ...f, actualAmountInr: e.target.value }))}
            />
          </div>

          <Textarea
            label="Notes / PO Reference (Optional)"
            placeholder="PO reference, vendor invoice number, or justification"
            rows={2}
            value={costForm.notes}
            onChange={(e) => setCostForm((f) => ({ ...f, notes: e.target.value }))}
          />

          <div className="flex justify-end gap-2 pt-3 border-t border-navy-500/10">
            <Button type="button" variant="secondary" onClick={() => setIsCostModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={savingCost}>
              {editingCost ? "Update Cost Item" : "Add Cost Item"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ── Modal: Edit Project Overhead Loading Rate ── */}
      <Modal
        isOpen={isOverheadModalOpen}
        onClose={() => setIsOverheadModalOpen(false)}
        title="Configure Operational Overhead Loading Rate"
        description="Set the project overhead percentage applied on top of internal labor costs (e.g. 10% or 15%)."
        size="sm"
      >
        <form onSubmit={handleSaveOverhead} className="space-y-4">
          <Input
            label="Overhead Percentage (%)"
            type="number"
            min={0}
            max={100}
            step={0.5}
            required
            value={overheadPercentInput}
            onChange={(e) => setOverheadPercentInput(e.target.value)}
            hint="Calculates planned and actual overhead in addition to timesheet labor costs."
          />

          <div className="flex justify-end gap-2 pt-3 border-t border-navy-500/10">
            <Button type="button" variant="secondary" onClick={() => setIsOverheadModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={savingOverhead}>
              Save Overhead %
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
