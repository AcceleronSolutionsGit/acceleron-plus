"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency, formatDate } from "@/lib/utils";

interface RateBand {
  id: string;
  band_name: string;
  level_code: string;
  daily_cost_inr: string | number;
  daily_billable_rate_inr?: string | number;
}

interface DarwinboxEmployee {
  employee_id: string;
  full_name: string;
  company_email_id?: string;
  job_level?: string;
  office_location?: string;
  employee_type?: string;
}

const DARWINBOX_GRADE_RANK: Record<string, number> = {
  M2: 1,
  G1: 2,
  SRG1: 3,
  G2: 4,
  SRG2: 5,
  G3: 6,
  SRG3: 7,
  G4: 8,
  SRG4: 9,
  G5: 10,
};

export function SolutioningClient({
  lead,
  rateBands,
  darwinboxEmployees = [],
}: {
  lead: any;
  rateBands: RateBand[];
  darwinboxEmployees?: DarwinboxEmployee[];
}) {
  const router = useRouter();
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [busyOn, setBusyOn] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [viewing, setViewing] = useState<any | null>(null);
  const [converting, setConverting] = useState(false);
  const [leadStatus, setLeadStatus] = useState<string>(lead.status);

  // New Session State
  const [sessionName, setSessionName] = useState(`v${sessions.length + 1}.0 - Initial Draft`);
  const [riskBuffer, setRiskBuffer] = useState(15);
  const [lineItems, setLineItems] = useState([
    {
      id: "1",
      phaseName: "Discovery",
      taskDescription: "Requirement Gathering & Architecture",
      rateBandId: rateBands[0]?.id || "",
      quantityResources: 1,
      estimatedDays: 5,
      employeeId: "",
    },
  ]);
  const [additionalCosts, setAdditionalCosts] = useState<
    { id: string; description: string; category: string; amountInr: number }[]
  >([]);

  /**
   * Finalizing is what turns somebody's working estimate into the
   * number the proposal goes out with. The server stamps who and when,
   * supersedes any earlier finalized estimate, and carries the fee onto
   * the lead — so the board and the forecast agree with this page.
   */
  const setSessionStatus = async (sessionId: string, action: "finalize" | "reopen") => {
    setBusyOn(sessionId);
    setActionError("");
    try {
      const res = await fetch(`/api/pmt/leads/${lead.id}/solutioning`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError(data.error || "That did not save.");
        return;
      }
      if (data.leadStatus) setLeadStatus(data.leadStatus);
      await loadSessions();
      router.refresh();
    } finally {
      setBusyOn(null);
    }
  };

  const loadSessions = async () => {
    const res = await fetch(`/api/pmt/leads/${lead.id}/solutioning`);
    if (res.ok) {
      const json = await res.json();
      setSessions(json.data || []);
      setSessionName(`v${(json.data?.length || 0) + 1}.0 Draft`);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadSessions();
  }, []);

  const handleAddLineItem = () => {
    setLineItems([
      ...lineItems,
      {
        id: crypto.randomUUID(),
        phaseName: "",
        taskDescription: "",
        rateBandId: rateBands[0]?.id || "",
        quantityResources: 1,
        estimatedDays: 1,
        employeeId: "",
      },
    ]);
  };

  const handleRemoveLineItem = (id: string) => setLineItems(lineItems.filter((l) => l.id !== id));

  // Quick-fill from Darwinbox employee selection
  const handleAssignEmployee = (lineIdx: number, empId: string) => {
    const emp = darwinboxEmployees.find((e) => e.employee_id === empId);
    const updated = [...lineItems];

    if (!emp) {
      updated[lineIdx].employeeId = "";
      setLineItems(updated);
      return;
    }

    updated[lineIdx].employeeId = empId;
    if (!updated[lineIdx].taskDescription || updated[lineIdx].taskDescription === "Requirement Gathering & Architecture") {
      updated[lineIdx].taskDescription = `${emp.full_name} (${emp.job_level || "Resource"})`;
    }

    // Match rate band by Darwinbox job_level
    if (emp.job_level) {
      const matchedBand = rateBands.find(
        (b) => b.level_code.toUpperCase() === emp.job_level?.toUpperCase()
      );
      if (matchedBand) {
        updated[lineIdx].rateBandId = matchedBand.id;
      }
    }

    setLineItems(updated);
  };

  const handleAddCost = () => {
    setAdditionalCosts([
      ...additionalCosts,
      { id: crypto.randomUUID(), description: "", category: "software", amountInr: 0 },
    ]);
  };
  const handleRemoveCost = (id: string) => setAdditionalCosts(additionalCosts.filter((c) => c.id !== id));

  const handleSave = async () => {
    if (!confirm("Save this solutioning draft?")) return;
    const payload = {
      sessionName,
      riskBufferPercent: riskBuffer,
      lineItems: lineItems.map((l) => ({ ...l, rateBandId: l.rateBandId || null })),
      additionalCosts: additionalCosts.map((c) => ({ ...c, amountInr: Number(c.amountInr) })),
    };

    const res = await fetch(`/api/pmt/leads/${lead.id}/solutioning`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      setIsCreating(false);
      loadSessions();
    } else {
      alert("Failed to save solutioning session");
    }
  };

  // Compute live totals
  const totalEffortCost = lineItems.reduce((sum, item) => {
    const band = rateBands.find((b) => b.id === item.rateBandId);
    const rate = band ? Number(band.daily_cost_inr) : 0;
    return sum + item.estimatedDays * item.quantityResources * rate;
  }, 0);

  const totalEffortDays = lineItems.reduce((sum, item) => {
    return sum + item.estimatedDays * item.quantityResources;
  }, 0);

  const totalAddCost = additionalCosts.reduce((s, c) => s + Number(c.amountInr), 0);
  const costWithRisk = totalEffortCost * (1 + riskBuffer / 100);
  const proposedFee = costWithRisk + totalAddCost;
  const marginPercent = proposedFee > 0 ? ((proposedFee - (totalEffortCost + totalAddCost)) / proposedFee) * 100 : 0;

  // Grade breakdown for effort transparency
  const gradeBreakdown = useMemo(() => {
    const map: Record<string, { days: number; cost: number; bandName: string }> = {};
    for (const item of lineItems) {
      const band = rateBands.find((b) => b.id === item.rateBandId);
      if (!band) continue;
      const days = item.estimatedDays * item.quantityResources;
      const rate = Number(band.daily_cost_inr);
      const cost = days * rate;
      if (!map[band.level_code]) {
        map[band.level_code] = { days: 0, cost: 0, bandName: band.band_name };
      }
      map[band.level_code].days += days;
      map[band.level_code].cost += cost;
    }
    return map;
  }, [lineItems, rateBands]);

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 border border-navy-500/10 shadow-sm flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-xs font-bold text-navy-400 bg-navy-50 px-2 py-1 rounded uppercase">
              {lead.leadNumber}
            </span>
            <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-1 rounded capitalize">
              {lead.status}
            </span>
            <span className="text-xs font-semibold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full flex items-center gap-1 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              Darwinbox Grade Mapping (M2 → G5)
            </span>
          </div>
          <h1 className="text-2xl font-bold text-navy-900 font-[family-name:var(--font-league-spartan)] tracking-tight">
            {lead.companyName}
          </h1>
          <p className="text-sm text-navy-500 mt-1">
            {lead.contactName} • Estimated Pipeline Value: {lead.opportunityValueInr ? formatCurrency(lead.opportunityValueInr) : "TBD"}
          </p>
        </div>
        <div className="flex gap-2">
          {sessions.some((s) => s.status === "finalized") && leadStatus !== "won" && (
            <button
              onClick={() => setConverting(true)}
              className="px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition-colors shadow-sm cursor-pointer"
            >
              Convert to project
            </button>
          )}
          {!isCreating && (
            <button
              onClick={() => setIsCreating(true)}
              className="px-4 py-2 bg-navy-900 text-white text-sm font-semibold rounded-xl hover:bg-navy-700 transition-colors shadow-sm shadow-navy-900/20 cursor-pointer"
            >
              + New Effort Estimation & Solutioning
            </button>
          )}
        </div>
      </div>

      {actionError && (
        <div role="alert" className="bg-red-600/5 border border-red-600/20 text-red-600 text-sm rounded-lg px-4 py-3">
          {actionError}
        </div>
      )}

      {isCreating && (
        <div className="bg-white rounded-2xl border-2 border-blue-500/20 shadow-lg overflow-hidden animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="bg-gradient-to-r from-blue-50 to-white p-6 border-b border-navy-500/10">
            <h2 className="text-lg font-bold text-navy-900 flex items-center gap-2">
              <span className="text-blue-600">⚒</span> Effort Estimation & Solutioning Draft
            </h2>
            <div className="mt-4 max-w-sm">
              <label className="block text-xs font-bold text-navy-700 mb-1.5 uppercase">Version Name</label>
              <input
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                className="w-full text-sm border border-navy-500/15 rounded-xl px-3 py-2 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>

          <div className="p-6 space-y-8">
            {/* Resource Effort Section */}
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                <div>
                  <h3 className="font-semibold text-navy-900 text-sm uppercase tracking-wide flex items-center gap-2">
                    <span>1. Resource Effort Estimation</span>
                    <span className="text-xs font-normal text-navy-500">
                      ({totalEffortDays} Total Person-Days)
                    </span>
                  </h3>
                  <p className="text-xs text-navy-500 mt-0.5">
                    Select by Darwinbox consultant grade or assign from live Darwinbox staff. Daily costs map directly from the grade rate card.
                  </p>
                </div>
                <button
                  onClick={handleAddLineItem}
                  className="self-start sm:self-auto text-xs font-bold px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg transition-colors cursor-pointer"
                >
                  + Add Effort Row
                </button>
              </div>

              {/* Visual Darwinbox Grade Progression Hierarchy Bar */}
              <div className="bg-navy-900 text-white rounded-xl p-3 mb-4 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-white/80 uppercase text-[11px] tracking-wider">
                  Darwinbox Seniority Hierarchy (Lower → Higher):
                </span>
                <div className="flex flex-wrap items-center gap-1 font-mono text-[11px]">
                  {["M2", "G1", "SRG1", "G2", "SRG2", "G3", "SRG3", "G4", "SRG4", "G5"].map((code, idx) => (
                    <React.Fragment key={code}>
                      <span className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 font-bold">
                        {code}
                      </span>
                      {idx < 9 && <span className="text-blue-300 font-sans">→</span>}
                    </React.Fragment>
                  ))}
                </div>
              </div>

              <div className="overflow-x-auto border border-navy-500/10 rounded-xl">
                <table className="w-full text-left text-sm">
                  <thead className="bg-navy-50/70 text-navy-700 font-semibold text-xs uppercase tracking-wider">
                    <tr>
                      <th className="px-3 py-2.5">Phase</th>
                      <th className="px-3 py-2.5">Task / Role</th>
                      <th className="px-3 py-2.5">Darwinbox Staff (Optional)</th>
                      <th className="px-3 py-2.5">Darwinbox Grade & Rate Band</th>
                      <th className="px-3 py-2.5 text-right">Resources</th>
                      <th className="px-3 py-2.5 text-right">Days</th>
                      <th className="px-3 py-2.5 text-right">Daily Cost</th>
                      <th className="px-3 py-2.5 text-right">Subtotal</th>
                      <th className="px-2 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-navy-500/10">
                    {lineItems.map((item, idx) => {
                      const band = rateBands.find((b) => b.id === item.rateBandId);
                      const rate = band ? Number(band.daily_cost_inr) : 0;
                      const sub = rate * item.quantityResources * item.estimatedDays;
                      const rank = band ? DARWINBOX_GRADE_RANK[band.level_code] : null;

                      return (
                        <tr key={item.id} className="group hover:bg-navy-50/30 transition-colors">
                          <td className="px-3 py-2.5">
                            <input
                              value={item.phaseName}
                              onChange={(e) => {
                                const v = [...lineItems];
                                v[idx].phaseName = e.target.value;
                                setLineItems(v);
                              }}
                              className="w-full bg-transparent border-b border-transparent focus:border-blue-400 focus:outline-none text-xs"
                              placeholder="e.g. Discovery"
                            />
                          </td>
                          <td className="px-3 py-2.5">
                            <input
                              value={item.taskDescription}
                              onChange={(e) => {
                                const v = [...lineItems];
                                v[idx].taskDescription = e.target.value;
                                setLineItems(v);
                              }}
                              className="w-full bg-transparent border-b border-transparent focus:border-blue-400 focus:outline-none text-xs"
                              placeholder="Role or task description"
                            />
                          </td>

                          {/* Quick pick Darwinbox employee */}
                          <td className="px-3 py-2.5">
                            <select
                              value={item.employeeId || ""}
                              onChange={(e) => handleAssignEmployee(idx, e.target.value)}
                              className="w-full bg-neutral-50 border border-navy-500/15 rounded-lg px-2 py-1 text-xs text-navy-800 focus:outline-none focus:ring-1 focus:ring-navy-900"
                            >
                              <option value="">— Pick Darwinbox Staff —</option>
                              {darwinboxEmployees.map((e) => (
                                <option key={e.employee_id} value={e.employee_id}>
                                  {e.full_name} ({e.job_level || "No Grade"})
                                </option>
                              ))}
                            </select>
                          </td>

                          {/* Darwinbox Grade & Rate Band */}
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-1.5">
                              {rank && (
                                <span className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded bg-purple-100 text-purple-900 border border-purple-200">
                                  T{rank}
                                </span>
                              )}
                              <select
                                value={item.rateBandId}
                                onChange={(e) => {
                                  const v = [...lineItems];
                                  v[idx].rateBandId = e.target.value;
                                  setLineItems(v);
                                }}
                                className="flex-1 bg-neutral-50 border border-navy-500/15 rounded-lg px-2 py-1 text-xs text-navy-900 font-medium focus:outline-none focus:ring-1 focus:ring-navy-900"
                              >
                                {rateBands.map((b) => {
                                  const rk = DARWINBOX_GRADE_RANK[b.level_code];
                                  return (
                                    <option key={b.id} value={b.id}>
                                      {rk ? `[Grade ${b.level_code} · Tier ${rk}] ` : `[${b.level_code}] `}
                                      {b.band_name} — {formatCurrency(Number(b.daily_cost_inr))}/d
                                    </option>
                                  );
                                })}
                              </select>
                            </div>
                          </td>

                          <td className="px-3 py-2.5 text-right">
                            <input
                              type="number"
                              min="1"
                              value={item.quantityResources}
                              onChange={(e) => {
                                const v = [...lineItems];
                                v[idx].quantityResources = Number(e.target.value);
                                setLineItems(v);
                              }}
                              className="w-14 bg-neutral-50 border border-navy-500/15 rounded-lg px-2 py-1 text-right text-xs focus:outline-none"
                            />
                          </td>

                          <td className="px-3 py-2.5 text-right">
                            <input
                              type="number"
                              min="1"
                              value={item.estimatedDays}
                              onChange={(e) => {
                                const v = [...lineItems];
                                v[idx].estimatedDays = Number(e.target.value);
                                setLineItems(v);
                              }}
                              className="w-14 bg-neutral-50 border border-navy-500/15 rounded-lg px-2 py-1 text-right text-xs focus:outline-none"
                            />
                          </td>

                          <td className="px-3 py-2.5 text-right text-xs text-navy-500">
                            {formatCurrency(rate)}
                          </td>
                          <td className="px-3 py-2.5 text-right font-semibold text-navy-900 text-xs">
                            {formatCurrency(sub)}
                          </td>
                          <td className="px-2 py-2.5 text-right">
                            <button
                              onClick={() => handleRemoveLineItem(item.id)}
                              className="text-red-400 hover:text-red-600 opacity-60 group-hover:opacity-100 transition-opacity p-1"
                              title="Delete Row"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Effort Breakdown by Darwinbox Grade */}
              <div className="mt-4 p-3 bg-neutral-50 rounded-xl border border-navy-500/10">
                <div className="text-[11px] font-bold text-navy-600 uppercase tracking-wider mb-2">
                  Effort Allocation by Darwinbox Grade:
                </div>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(gradeBreakdown).map(([code, g]) => (
                    <div
                      key={code}
                      className="px-2.5 py-1 bg-white rounded-lg border border-navy-500/15 shadow-2xs text-xs flex items-center gap-1.5"
                    >
                      <span className="font-mono font-bold px-1.5 py-0.5 rounded bg-navy-900 text-white text-[10px]">
                        {code}
                      </span>
                      <span className="font-semibold text-navy-900">{g.days} days</span>
                      <span className="text-navy-400 text-[11px]">({formatCurrency(g.cost)})</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Additional Costs */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-navy-900 text-sm uppercase tracking-wide">
                  2. Additional Project Costs
                </h3>
                <button
                  onClick={handleAddCost}
                  className="text-xs font-bold px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg transition-colors cursor-pointer"
                >
                  + Add Cost
                </button>
              </div>
              {additionalCosts.length === 0 ? (
                <p className="text-xs text-navy-500 italic">No additional expenses. Click + Add Cost if needed.</p>
              ) : (
                <table className="w-full text-left text-sm max-w-2xl border border-navy-500/10 rounded-xl overflow-hidden">
                  <thead className="bg-navy-50/50 text-navy-500 font-medium text-xs uppercase">
                    <tr>
                      <th className="px-3 py-2">Category</th>
                      <th className="px-3 py-2">Description</th>
                      <th className="px-3 py-2 text-right">Amount (INR)</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-navy-500/10">
                    {additionalCosts.map((c, idx) => (
                      <tr key={c.id}>
                        <td className="px-3 py-2">
                          <select
                            value={c.category}
                            onChange={(e) => {
                              const v = [...additionalCosts];
                              v[idx].category = e.target.value;
                              setAdditionalCosts(v);
                            }}
                            className="bg-transparent text-xs"
                          >
                            <option value="software">Software / Licensing</option>
                            <option value="travel">Travel & Client Site</option>
                            <option value="hardware">Hardware</option>
                            <option value="other">Other</option>
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            value={c.description}
                            onChange={(e) => {
                              const v = [...additionalCosts];
                              v[idx].description = e.target.value;
                              setAdditionalCosts(v);
                            }}
                            className="w-full bg-transparent focus:outline-none border-b border-transparent focus:border-blue-400 text-xs"
                            placeholder="e.g. Server hosting / licenses"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            value={c.amountInr}
                            onChange={(e) => {
                              const v = [...additionalCosts];
                              v[idx].amountInr = Number(e.target.value);
                              setAdditionalCosts(v);
                            }}
                            className="w-full text-right bg-transparent focus:outline-none text-xs"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button onClick={() => handleRemoveCost(c.id)} className="text-red-400 hover:text-red-600">
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Risk Buffer & Financial Summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-6 border-t border-navy-500/10">
              <div>
                <h3 className="font-semibold text-navy-900 text-sm uppercase tracking-wide mb-4">
                  3. Risk Buffer
                </h3>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min="0"
                    max="50"
                    step="5"
                    value={riskBuffer}
                    onChange={(e) => setRiskBuffer(Number(e.target.value))}
                    className="w-full accent-blue-600"
                  />
                  <span className="font-bold text-lg text-blue-600 w-12 text-right">{riskBuffer}%</span>
                </div>
                <p className="text-xs text-navy-500 mt-2">
                  Buffer applied to resource effort to calculate final proposed fee and protect margins against overruns.
                </p>
              </div>

              <div className="bg-navy-900 rounded-xl p-6 text-white shadow-xl shadow-navy-900/20">
                <h3 className="font-semibold text-white/80 text-sm uppercase tracking-wide mb-4 border-b border-white/10 pb-2">
                  Financial Summary
                </h3>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-white/60">Total Estimated Effort</span>
                    <span className="font-semibold">{totalEffortDays} person-days</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/60">Base Effort Cost</span>
                    <span>{formatCurrency(totalEffortCost)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/60">Additional Costs</span>
                    <span>{formatCurrency(totalAddCost)}</span>
                  </div>
                  <div className="flex justify-between text-blue-200">
                    <span>Risk Buffer ({riskBuffer}%)</span>
                    <span>{formatCurrency(totalEffortCost * (riskBuffer / 100))}</span>
                  </div>
                  <div className="pt-3 border-t border-white/10 flex justify-between font-bold text-lg text-green-400">
                    <span>Proposed Fee</span>
                    <span>{formatCurrency(proposedFee)}</span>
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-white/60 font-semibold">Estimated Gross Margin</span>
                    <span className="font-bold text-emerald-400">{marginPercent.toFixed(1)}%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-navy-50 px-6 py-4 flex justify-end gap-3 border-t border-navy-500/10">
            <button
              onClick={() => setIsCreating(false)}
              className="px-5 py-2 rounded-xl text-sm font-semibold text-navy-700 hover:bg-navy-100 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-5 py-2 rounded-xl text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-sm shadow-blue-600/30 cursor-pointer"
            >
              Save Solutioning Version
            </button>
          </div>
        </div>
      )}

      {/* History */}
      {!loading && sessions.length > 0 && (
        <div className="space-y-4 mt-8">
          <h2 className="text-lg font-bold text-navy-900 font-[family-name:var(--font-league-spartan)]">
            Solutioning History
          </h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {sessions.map((s) => (
              <div
                key={s.id}
                className="bg-white rounded-xl p-5 border border-navy-500/15 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group"
              >
                <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-bold text-navy-900">{s.sessionName}</h3>
                    <p className="text-xs text-navy-500">{formatDate(s.createdAt)}</p>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                      s.status === "finalized"
                        ? "bg-green-100 text-green-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {s.status}
                  </span>
                </div>
                <div className="space-y-2 text-sm mt-4">
                  <div className="flex justify-between">
                    <span className="text-navy-500">Effort Cost</span>
                    <span className="font-medium text-navy-900">{formatCurrency(s.totalCostInr)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-navy-500">Proposed Fee</span>
                    <span className="font-bold text-green-600">{formatCurrency(s.proposedFeeInr)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-navy-500">Margin</span>
                    <span className="font-semibold text-blue-600">{Number(s.marginPercent).toFixed(1)}%</span>
                  </div>
                </div>
                <div className="mt-5 pt-4 border-t border-navy-500/10 flex gap-2">
                  <button
                    onClick={() => setViewing(s)}
                    className="flex-1 text-xs font-semibold py-1.5 bg-navy-50 text-navy-700 rounded-lg hover:bg-navy-100 transition-colors flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <span>📄</span> View breakdown
                  </button>
                  {s.status === "draft" && (
                    <button
                      onClick={() => setSessionStatus(s.id, "finalize")}
                      disabled={busyOn === s.id}
                      className="flex-1 text-xs font-semibold py-1.5 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <span>✓</span> {busyOn === s.id ? "Saving…" : "Finalize"}
                    </button>
                  )}
                  {s.status === "finalized" && (
                    <button
                      onClick={() => setSessionStatus(s.id, "reopen")}
                      disabled={busyOn === s.id}
                      className="flex-1 text-xs font-semibold py-1.5 bg-amber-50 text-amber-700 rounded-lg hover:bg-amber-100 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      Reopen
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {viewing && <BreakdownModal session={viewing} onClose={() => setViewing(null)} />}

      {converting && (
        <ConvertModal
          lead={lead}
          estimate={sessions.find((s) => s.status === "finalized")}
          onClose={() => setConverting(false)}
          onConverted={(code) => {
            setConverting(false);
            setLeadStatus("won");
            router.push(`/pmt/${code}`);
          }}
        />
      )}
    </div>
  );
}

// ─── What the estimate is actually made of ─────────────────────────

function BreakdownModal({ session, onClose }: { session: any; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/40 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-xl shadow-2xl">
        <div className="px-6 py-4 border-b border-neutral-100 flex items-start justify-between gap-4 sticky top-0 bg-white">
          <div>
            <h3 className="text-lg font-bold text-navy-900 font-[family-name:var(--font-league-spartan)]">
              {session.sessionName}
            </h3>
            <p className="text-xs text-navy-500">
              {session.status} · {formatDate(session.createdAt)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold rounded-xl border border-navy-500/20 text-navy-700 hover:bg-neutral-50 cursor-pointer"
          >
            Close
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Figure label="Effort" value={`${Number(session.totalEffortDays ?? 0)} days`} />
            <Figure label="Effort cost" value={formatCurrency(session.totalCostInr)} />
            <Figure label="Proposed fee" value={formatCurrency(session.proposedFeeInr)} accent />
            <Figure label="Margin" value={`${Number(session.marginPercent ?? 0).toFixed(1)}%`} />
          </div>

          {(session.lineItems ?? []).length > 0 && (
            <div>
              <h4 className="text-xs uppercase tracking-wider text-navy-500 font-semibold mb-2">
                Effort by phase
              </h4>
              <div className="border border-neutral-100 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 text-[10px] uppercase tracking-wider text-navy-500">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold">Phase</th>
                      <th className="text-left px-3 py-2 font-semibold">Task</th>
                      <th className="text-left px-3 py-2 font-semibold">Band</th>
                      <th className="text-right px-3 py-2 font-semibold">Qty</th>
                      <th className="text-right px-3 py-2 font-semibold">Days</th>
                      <th className="text-right px-3 py-2 font-semibold">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {session.lineItems.map((item: any) => (
                      <tr key={item.id}>
                        <td className="px-3 py-2 text-navy-900">{item.phaseName}</td>
                        <td className="px-3 py-2 text-navy-700">{item.taskDescription}</td>
                        <td className="px-3 py-2 text-navy-500 text-xs">{item.rateBandName ?? "—"}</td>
                        <td className="px-3 py-2 text-right text-navy-700">{item.quantityResources}</td>
                        <td className="px-3 py-2 text-right text-navy-700">{item.estimatedDays}</td>
                        <td className="px-3 py-2 text-right font-medium text-navy-900">
                          {formatCurrency(item.subtotalInr)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {(session.additionalCosts ?? []).length > 0 && (
            <div>
              <h4 className="text-xs uppercase tracking-wider text-navy-500 font-semibold mb-2">
                Other costs
              </h4>
              <div className="space-y-1">
                {session.additionalCosts.map((cost: any) => (
                  <div key={cost.id} className="flex justify-between text-sm">
                    <span className="text-navy-700">
                      {cost.description}
                      <span className="text-navy-500 text-xs"> ({cost.category})</span>
                    </span>
                    <span className="font-medium text-navy-900">{formatCurrency(cost.amountInr)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Figure({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-navy-500 font-semibold">{label}</p>
      <p className={`text-lg font-bold ${accent ? "text-emerald-600" : "text-navy-900"}`}>{value}</p>
    </div>
  );
}

// ─── Won: make it a project ────────────────────────────────────────

function ConvertModal({
  lead,
  estimate,
  onClose,
  onConverted,
}: {
  lead: any;
  estimate: any;
  onClose: () => void;
  onConverted: (code: string) => void;
}) {
  const [name, setName] = useState(lead.companyName ?? "");
  const [startDate, setStartDate] = useState("");
  const [plannedEndDate, setPlannedEndDate] = useState("");
  const [createPlan, setCreatePlan] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/pmt/leads/${lead.id}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          startDate: startDate || null,
          plannedEndDate: plannedEndDate || null,
          createPlanFromEstimate: createPlan,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data.errors ?? [data.error]).filter(Boolean).join(" ") || "Could not convert.");
        return;
      }
      onConverted(data.project.code);
    } finally {
      setBusy(false);
    }
  };

  const field =
    "w-full px-3.5 py-2.5 text-sm rounded-lg border border-navy-500/30 focus:outline-none focus:ring-2 focus:ring-navy-700/30";
  const label = "block text-[10px] uppercase tracking-wider text-navy-500 font-semibold mb-1";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/40 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-lg rounded-xl shadow-2xl p-6">
        <h3 className="text-lg font-bold text-navy-900 font-[family-name:var(--font-league-spartan)]">
          Convert to a project
        </h3>
        <p className="text-sm text-navy-500 mt-1">
          {estimate
            ? <>The budget comes from <span className="font-medium">{estimate.sessionName}</span> — {formatCurrency(estimate.proposedFeeInr)}.</>
            : "No finalized estimate, so the budget will come from the opportunity value."}
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <label className={label}>Project name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={field} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Start</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={field} />
            </div>
            <div>
              <label className={label}>Planned end</label>
              <input
                type="date"
                value={plannedEndDate}
                onChange={(e) => setPlannedEndDate(e.target.value)}
                className={field}
              />
            </div>
          </div>
          <label className="flex items-start gap-2 text-sm text-navy-700">
            <input
              type="checkbox"
              checked={createPlan}
              onChange={(e) => setCreatePlan(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Build the work breakdown from the estimate
              <span className="block text-xs text-navy-500">
                Each phase in the estimate becomes a work package carrying its effort, so the plan
                starts from what was actually priced.
              </span>
            </span>
          </label>
        </div>

        {error && (
          <div role="alert" className="mt-3 bg-red-600/5 border border-red-600/20 text-red-600 text-sm rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3 mt-5">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold rounded-xl border border-navy-500/20 text-navy-700 hover:bg-neutral-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || !name.trim()}
            className="px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-40 cursor-pointer"
          >
            {busy ? "Converting…" : "Create the project"}
          </button>
        </div>
      </div>
    </div>
  );
}
