"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
  canSeeCosts = false,
}: {
  lead: any;
  rateBands: RateBand[];
  darwinboxEmployees?: DarwinboxEmployee[];
  canSeeCosts?: boolean;
}) {
  const router = useRouter();
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [busyOn, setBusyOn] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [viewing, setViewing] = useState<any | null>(null);
  const [leadStatus, setLeadStatus] = useState<string>(lead.status);

  // Scope, Solution Approach & Documents
  const [convertedProject, setConvertedProject] = useState<any | null>(null);
  const [scopeBaseline, setScopeBaseline] = useState<string>(lead.scopeBaseline || "");
  const [solutionApproach, setSolutionApproach] = useState<string>(lead.solutionApproach || "");
  const [leadDocs, setLeadDocs] = useState<any[]>([]);

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
  const [overheadMargin, setOverheadMargin] = useState(0);
  const [actualMargin, setActualMargin] = useState(0);

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

  const loadLeadDetailsAndDocs = async () => {
    try {
      const [leadRes, docsRes] = await Promise.all([
        fetch(`/api/pmt/leads/${lead.id}`),
        fetch(`/api/pmt/leads/${lead.id}/documents`),
      ]);
      if (leadRes.ok) {
        const leadData = await leadRes.json();
        if (leadData.project) setConvertedProject(leadData.project);
        if (leadData.data) {
          if (leadData.data.scopeBaseline !== undefined) setScopeBaseline(leadData.data.scopeBaseline || "");
          if (leadData.data.solutionApproach !== undefined) setSolutionApproach(leadData.data.solutionApproach || "");
          if (leadData.data.status) setLeadStatus(leadData.data.status);
        }
      }
      if (docsRes.ok) {
        const docsData = await docsRes.json();
        setLeadDocs(docsData.data || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveScope = async (newText: string) => {
    try {
      const res = await fetch(`/api/pmt/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scopeBaseline: newText }),
      });
      if (res.ok) {
        setScopeBaseline(newText);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const handleSaveSolution = async (newText: string) => {
    try {
      const res = await fetch(`/api/pmt/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ solutionApproach: newText }),
      });
      if (res.ok) {
        setSolutionApproach(newText);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  useEffect(() => {
    loadSessions();
    loadLeadDetailsAndDocs();
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
      overheadMarginPercent: overheadMargin,
      actualMarginPercent: actualMargin,
      lineItems: lineItems.map((l) => ({ ...l, rateBandId: l.rateBandId || null, allocatedUserId: l.employeeId || null })),
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
  
  const totalRawCost = totalEffortCost + totalAddCost;
  const overheadAmount = totalRawCost * (overheadMargin / 100);
  const costWithOverhead = totalRawCost + overheadAmount;
  const profitAmount = costWithOverhead * (actualMargin / 100);
  const proposedFee = costWithOverhead + profitAmount;

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
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => router.push(`/pmt/leads/${lead.id}/scope`)}
            className="px-3.5 py-2 text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200/80 rounded-xl hover:bg-blue-100 transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
          >
            <span>📋</span>
            <span>Scope Baseline</span>
            {leadDocs.filter((d) => d.documentType === "scope").length > 0 && (
              <span className="bg-blue-200/80 text-blue-800 text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                {leadDocs.filter((d) => d.documentType === "scope").length}
              </span>
            )}
          </button>

          <button
            onClick={() => router.push(`/pmt/leads/${lead.id}/solution`)}
            className="px-3.5 py-2 text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200/80 rounded-xl hover:bg-indigo-100 transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
          >
            <span>📐</span>
            <span>Solution Approach</span>
            {leadDocs.filter((d) => d.documentType === "solution_approach").length > 0 && (
              <span className="bg-indigo-200/80 text-indigo-800 text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                {leadDocs.filter((d) => d.documentType === "solution_approach").length}
              </span>
            )}
          </button>

          <button
            onClick={() => router.push(`/pmt/leads/${lead.id}/documents`)}
            className="px-3.5 py-2 text-xs font-semibold bg-neutral-50 text-navy-700 border border-neutral-200 rounded-xl hover:bg-neutral-100 transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
          >
            <span>📁</span>
            <span>Documents ({leadDocs.length})</span>
          </button>

          {convertedProject ? (
            <Link
              href={`/pmt/${convertedProject.code}`}
              className="px-4 py-2 bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100 text-xs font-bold rounded-xl transition-colors shadow-sm flex items-center gap-1.5"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>Project {convertedProject.code} ({convertedProject.name})</span>
            </Link>
          ) : (
            <button
              onClick={() => router.push(`/pmt/leads/${lead.id}/convert`)}
              className="px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 transition-colors shadow-sm cursor-pointer flex items-center gap-1.5"
            >
              <span>🚀</span>
              <span>Convert to project</span>
            </button>
          )}

          {!isCreating && (
            <button
              onClick={() => setIsCreating(true)}
              className="px-4 py-2 bg-navy-900 text-white text-xs font-bold rounded-xl hover:bg-navy-700 transition-colors shadow-sm shadow-navy-900/20 cursor-pointer"
            >
              + New Effort Estimation
            </button>
          )}
        </div>
      </div>

      {/* Scope & Solution Approach Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Scope Baseline Card */}
        <div className="bg-white rounded-2xl p-5 border border-navy-500/10 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2">
                <span className="text-base">📋</span>
                <h3 className="font-bold text-sm text-navy-900">Scope Baseline & Deliverables</h3>
              </div>
              <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                {leadDocs.filter((d) => d.documentType === "scope").length} Doc(s)
              </span>
            </div>
            <p className="text-xs text-navy-600 line-clamp-3 leading-relaxed">
              {scopeBaseline ? (
                scopeBaseline
              ) : (
                <span className="text-navy-400 italic">
                  No scope baseline text defined yet. Click below to add key deliverables or attach SOW/Scope documents.
                </span>
              )}
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-navy-500/10 flex items-center justify-between">
            <button
              onClick={() => router.push(`/pmt/leads/${lead.id}/scope`)}
              className="text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors cursor-pointer"
            >
              View / Edit Scope & Documents →
            </button>
            <button
              onClick={() => router.push(`/pmt/leads/${lead.id}/documents/upload?type=scope`)}
              className="text-xs font-semibold px-2.5 py-1 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg transition-colors cursor-pointer"
            >
              + Upload Scope Doc
            </button>
          </div>
        </div>

        {/* Solution Approach Card */}
        <div className="bg-white rounded-2xl p-5 border border-navy-500/10 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2">
                <span className="text-base">📐</span>
                <h3 className="font-bold text-sm text-navy-900">Solution Approach & Architecture</h3>
              </div>
              <span className="text-[11px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">
                {leadDocs.filter((d) => d.documentType === "solution_approach").length} Doc(s)
              </span>
            </div>
            <p className="text-xs text-navy-600 line-clamp-3 leading-relaxed">
              {solutionApproach ? (
                solutionApproach
              ) : (
                <span className="text-navy-400 italic">
                  No technical architecture statement defined yet. Click below to describe the solution or attach architecture docs.
                </span>
              )}
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-navy-500/10 flex items-center justify-between">
            <button
              onClick={() => router.push(`/pmt/leads/${lead.id}/solution`)}
              className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer"
            >
              View / Edit Solution & Documents →
            </button>
            <button
              onClick={() => router.push(`/pmt/leads/${lead.id}/documents/upload?type=solution_approach`)}
              className="text-xs font-semibold px-2.5 py-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg transition-colors cursor-pointer"
            >
              + Upload Architecture Doc
            </button>
          </div>
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
                      <th className="px-3 py-2.5 w-1/4">Phase & Role</th>
                      <th className="px-3 py-2.5 w-1/3">Darwinbox Allocation</th>
                      <th className="px-3 py-2.5 text-right w-1/6">Effort (Days/Res)</th>
                      {canSeeCosts && <th className="px-3 py-2.5 text-right w-1/6">Costs</th>}
                      <th className="px-2 py-2.5 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-navy-500/10">
                    {lineItems.map((item, idx) => {
                      const band = rateBands.find((b) => b.id === item.rateBandId);
                      const rate = band ? Number(band.daily_cost_inr) : 0;
                      const sub = rate * item.quantityResources * item.estimatedDays;
                      const rank = band ? DARWINBOX_GRADE_RANK[band.level_code] : null;

                      return (
                        <tr key={item.id} className="group hover:bg-navy-50/30 transition-colors align-top">
                          <td className="px-3 py-3">
                            <input
                              value={item.phaseName}
                              onChange={(e) => {
                                const v = [...lineItems];
                                v[idx].phaseName = e.target.value;
                                setLineItems(v);
                              }}
                              className="w-full bg-transparent border-b border-navy-500/20 focus:border-blue-400 focus:outline-none text-xs font-semibold mb-2 pb-1"
                              placeholder="Phase (e.g. Discovery)"
                            />
                            <textarea
                              value={item.taskDescription}
                              onChange={(e) => {
                                const v = [...lineItems];
                                v[idx].taskDescription = e.target.value;
                                setLineItems(v);
                              }}
                              rows={2}
                              className="w-full bg-neutral-50/50 border border-transparent focus:bg-white focus:border-blue-400 focus:outline-none text-xs resize-none p-1.5 rounded-lg"
                              placeholder="Role or task description"
                            />
                          </td>

                          <td className="px-3 py-3 space-y-2">
                            <select
                              value={item.employeeId || ""}
                              onChange={(e) => handleAssignEmployee(idx, e.target.value)}
                              className="w-full bg-neutral-50 border border-navy-500/15 rounded-lg px-2 py-1.5 text-xs text-navy-800 focus:outline-none focus:ring-1 focus:ring-navy-900"
                            >
                              <option value="">— Pick Darwinbox Staff (Optional) —</option>
                              {darwinboxEmployees.map((e) => (
                                <option key={e.employee_id} value={e.employee_id}>
                                  {e.full_name} ({e.job_level || "No Grade"})
                                </option>
                              ))}
                            </select>

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
                                className="flex-1 w-full bg-neutral-50 border border-navy-500/15 rounded-lg px-2 py-1.5 text-xs text-navy-900 font-medium focus:outline-none focus:ring-1 focus:ring-navy-900"
                              >
                                {rateBands.map((b) => {
                                  const rk = DARWINBOX_GRADE_RANK[b.level_code];
                                  return (
                                    <option key={b.id} value={b.id}>
                                      {rk ? `[Grade ${b.level_code} · Tier ${rk}] ` : `[${b.level_code}] `}
                                      {b.band_name} {canSeeCosts && `— ${formatCurrency(Number(b.daily_cost_inr))}/d`}
                                    </option>
                                  );
                                })}
                              </select>
                            </div>
                          </td>

                          <td className="px-3 py-3 text-right space-y-2">
                            <div className="flex items-center justify-end gap-2">
                              <span className="text-xs text-navy-500">Resources:</span>
                              <input
                                type="number"
                                min="1"
                                value={item.quantityResources}
                                onChange={(e) => {
                                  const v = [...lineItems];
                                  v[idx].quantityResources = Number(e.target.value);
                                  setLineItems(v);
                                }}
                                className="w-16 bg-neutral-50 border border-navy-500/15 rounded-lg px-2 py-1 text-right text-xs focus:outline-none"
                              />
                            </div>
                            <div className="flex items-center justify-end gap-2">
                              <span className="text-xs text-navy-500">Days:</span>
                              <input
                                type="number"
                                min="1"
                                value={item.estimatedDays}
                                onChange={(e) => {
                                  const v = [...lineItems];
                                  v[idx].estimatedDays = Number(e.target.value);
                                  setLineItems(v);
                                }}
                                className="w-16 bg-neutral-50 border border-navy-500/15 rounded-lg px-2 py-1 text-right text-xs focus:outline-none"
                              />
                            </div>
                          </td>

                          {canSeeCosts && (
                            <td className="px-3 py-3 text-right space-y-2">
                              <div className="text-xs text-navy-500 mt-1">
                                {formatCurrency(rate)} <span className="text-[10px]">/ day</span>
                              </div>
                              <div className="font-semibold text-sm text-navy-900">
                                {formatCurrency(sub)}
                              </div>
                            </td>
                          )}
                          <td className="px-2 py-3 text-right">
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
                      {canSeeCosts && <span className="text-navy-400 text-[11px]">({formatCurrency(g.cost)})</span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Additional Costs */}
            {canSeeCosts && (
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
            )}

            {/* Risk Buffer & Financial Summary */}
            {canSeeCosts && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-6 border-t border-navy-500/10">
                <div className="space-y-4">
                  <h3 className="font-semibold text-navy-800 text-sm uppercase tracking-wide mb-2">
                    Pricing & Margins
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-navy-600 mb-1">Overhead Margin (%)</label>
                      <div className="relative">
                        <input
                          type="number"
                          value={overheadMargin}
                          onChange={(e) => setOverheadMargin(Number(e.target.value))}
                          className="w-full bg-neutral-50 border border-navy-500/15 rounded-xl pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-navy-400 font-semibold">%</span>
                      </div>
                      <p className="text-[10px] text-navy-500 mt-1">Covers infra, admin, SG&A.</p>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-navy-600 mb-1">Profit Margin (%)</label>
                      <div className="relative">
                        <input
                          type="number"
                          value={actualMargin}
                          onChange={(e) => setActualMargin(Number(e.target.value))}
                          className="w-full bg-neutral-50 border border-navy-500/15 rounded-xl pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-navy-400 font-semibold">%</span>
                      </div>
                      <p className="text-[10px] text-navy-500 mt-1">Applied on top of cost + overhead.</p>
                    </div>
                  </div>
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
                      <span className="text-white/60">Raw Base Effort Cost</span>
                      <span>{formatCurrency(totalEffortCost)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/60">Additional Costs</span>
                      <span>{formatCurrency(totalAddCost)}</span>
                    </div>
                    
                    <div className="pt-2 mt-2 border-t border-white/5 flex justify-between text-xs">
                      <span className="text-white/50">Total Raw Cost</span>
                      <span className="text-white/80">{formatCurrency(totalRawCost)}</span>
                    </div>
                    {overheadMargin > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-white/50">Overhead ({overheadMargin}%)</span>
                        <span className="text-amber-200/80">+{formatCurrency(overheadAmount)}</span>
                      </div>
                    )}
                    {actualMargin > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-white/50">Profit Margin ({actualMargin}%)</span>
                        <span className="text-emerald-200/80">+{formatCurrency(profitAmount)}</span>
                      </div>
                    )}

                    <div className="pt-3 border-t border-white/10 flex justify-between font-bold text-lg text-green-400">
                      <span>Total Quote Amount</span>
                      <span>{formatCurrency(proposedFee)}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
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
                    <span className="text-navy-500">Total Effort</span>
                    <span className="font-medium text-navy-900">{s.totalEffortDays} days</span>
                  </div>
                  {canSeeCosts && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-navy-500">Effort Cost</span>
                        <span className="font-medium text-navy-900">{formatCurrency(s.totalCostInr)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-navy-500">Total Amount</span>
                        <span className="font-bold text-green-600">{formatCurrency(s.proposedFeeInr)}</span>
                      </div>
                    </>
                  )}
                </div>
                <div className="mt-5 pt-4 border-t border-navy-500/10 flex gap-2">
                  <button
                    onClick={() => setViewing(s)}
                    className="flex-1 text-xs font-semibold py-1.5 bg-navy-50 text-navy-700 rounded-lg hover:bg-navy-100 transition-colors flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <span>📄</span> View breakdown
                  </button>
                  {canSeeCosts && s.status === "draft" && (
                    <button
                      onClick={() => setSessionStatus(s.id, "finalize")}
                      disabled={busyOn === s.id}
                      className="flex-1 text-xs font-semibold py-1.5 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <span>✓</span> {busyOn === s.id ? "Saving…" : "Finalize"}
                    </button>
                  )}
                  {canSeeCosts && s.status === "finalized" && (
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

      {viewing && <BreakdownModal session={viewing} canSeeCosts={canSeeCosts} onClose={() => setViewing(null)} />}

    </div>
  );
}

// ─── What the estimate is actually made of ─────────────────────────

function BreakdownModal({ session, canSeeCosts, onClose }: { session: any; canSeeCosts?: boolean; onClose: () => void }) {
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
            {canSeeCosts && <Figure label="Effort cost" value={formatCurrency(session.totalCostInr)} />}
            {canSeeCosts && <Figure label="Amount" value={formatCurrency(session.proposedFeeInr)} accent />}
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
                      {canSeeCosts && <th className="text-right px-3 py-2 font-semibold">Subtotal</th>}
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
                        {canSeeCosts && (
                          <td className="px-3 py-2 text-right font-medium text-navy-900">
                            {formatCurrency(item.subtotalInr)}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {canSeeCosts && (session.additionalCosts ?? []).length > 0 && (
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


