"use client";

import React, { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/utils";
import type { Lead } from "@/lib/types";

export default function ConvertLeadPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id: leadId } = use(params);

  const [lead, setLead] = useState<Lead | null>(null);
  const [estimate, setEstimate] = useState<any | null>(null);
  const [docsCount, setDocsCount] = useState(0);

  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [plannedEndDate, setPlannedEndDate] = useState("");
  const [createPlan, setCreatePlan] = useState(true);
  const [scopeBaseline, setScopeBaseline] = useState("");
  const [solutionApproach, setSolutionApproach] = useState("");
  
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [leadRes, sessionsRes, docsRes] = await Promise.all([
          fetch(`/api/pmt/leads/${leadId}`),
          fetch(`/api/pmt/leads/${leadId}/sessions`),
          fetch(`/api/pmt/leads/${leadId}/documents`)
        ]);

        const leadData = await leadRes.json();
        const sessionsData = await sessionsRes.json();
        const docsData = await docsRes.json();

        if (leadData?.lead) {
          setLead(leadData.lead);
          setName(leadData.lead.companyName || "");
          setScopeBaseline(leadData.lead.scopeBaseline || "");
          setSolutionApproach(leadData.lead.solutionApproach || "");
        }

        if (sessionsData?.sessions) {
          const finalEstimate = sessionsData.sessions.find((s: any) => s.status === "finalized");
          setEstimate(finalEstimate || null);
        }

        if (docsData?.documents) {
          setDocsCount(docsData.documents.length);
        }
      } catch (err) {
        setError("Failed to load lead details.");
      } finally {
        setLoading(false);
      }
    })();
  }, [leadId]);

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/pmt/leads/${leadId}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          startDate: startDate || null,
          plannedEndDate: plannedEndDate || null,
          createPlanFromEstimate: createPlan,
          scopeBaseline: scopeBaseline.trim() || null,
          solutionApproach: solutionApproach.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data.errors ?? [data.error]).filter(Boolean).join(" ") || "Could not convert.");
        return;
      }
      
      router.push(`/pmt/${data.project.code}`);
      router.refresh();
    } catch (err) {
      setError("An unexpected error occurred.");
    } finally {
      setBusy(false);
    }
  };

  const field = "w-full px-3.5 py-2.5 text-sm rounded-lg border border-navy-500/30 focus:outline-none focus:ring-2 focus:ring-navy-700/30 bg-white";
  const label = "block text-[10px] uppercase tracking-wider text-navy-500 font-semibold mb-1";

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto py-8 px-4 flex items-center justify-center min-h-[400px]">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-navy-900/15 border-t-navy-500" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <div className="bg-white w-full rounded-xl shadow-sm border border-navy-500/10 p-6 sm:p-8">
        <h1 className="text-2xl font-bold text-navy-900 font-[family-name:var(--font-league-spartan)] mb-2">
          Convert to a project
        </h1>
        <p className="text-sm text-navy-500 mb-8">
          {estimate ? (
            <>
              The budget comes from <span className="font-medium text-navy-800">{estimate.sessionName}</span> —{" "}
              {formatCurrency(estimate.proposedFeeInr)}.
            </>
          ) : (
            "No finalized estimate, so the budget will come from the opportunity value."
          )}
        </p>

        <div className="space-y-5">
          <div>
            <label className={label}>Project name *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={field} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={label}>Start Date</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={field} />
            </div>
            <div>
              <label className={label}>Planned End Date</label>
              <input
                type="date"
                value={plannedEndDate}
                onChange={(e) => setPlannedEndDate(e.target.value)}
                className={field}
              />
            </div>
          </div>

          <div>
            <label className={label}>Scope Baseline & Deliverables Statement</label>
            <textarea
              rows={3}
              value={scopeBaseline}
              onChange={(e) => setScopeBaseline(e.target.value)}
              placeholder="In-scope deliverables and boundaries..."
              className={field}
            />
          </div>

          <div>
            <label className={label}>Solution Approach & Architecture Statement</label>
            <textarea
              rows={3}
              value={solutionApproach}
              onChange={(e) => setSolutionApproach(e.target.value)}
              placeholder="Technical architecture, delivery methodology..."
              className={field}
            />
          </div>

          {docsCount > 0 && (
            <div className="bg-blue-50/60 p-3.5 rounded-lg border border-blue-200/70 text-sm text-blue-900 flex items-center gap-3">
              <span className="text-xl">📁</span>
              <span>
                <strong>{docsCount} document(s)</strong> attached to this lead will automatically transfer to the new project&apos;s Documents repository.
              </span>
            </div>
          )}

          {estimate && (
            <label className="flex items-start gap-3 text-sm text-navy-700 pt-2 cursor-pointer bg-neutral-50 p-4 rounded-lg border border-navy-500/10 hover:border-navy-500/20 transition-colors">
              <input
                type="checkbox"
                checked={createPlan}
                onChange={(e) => setCreatePlan(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-navy-500/30 text-emerald-600 focus:ring-emerald-600/30"
              />
              <span>
                <span className="font-semibold block mb-0.5">Build the work breakdown from the estimate</span>
                <span className="block text-[13px] text-navy-500">
                  Each phase in the estimate becomes a work package carrying its effort, so the plan
                  starts from what was actually priced.
                </span>
              </span>
            </label>
          )}
        </div>

        {error && (
          <div role="alert" className="mt-6 bg-red-600/5 border border-red-600/20 text-red-600 text-sm rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3 mt-8 pt-5 border-t border-navy-900/10">
          <button
            onClick={() => router.back()}
            className="px-4 py-2 text-sm font-semibold rounded-xl border border-navy-500/20 text-navy-700 hover:bg-neutral-50 cursor-pointer transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || !name.trim()}
            className="px-5 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-40 cursor-pointer transition-colors shadow-sm"
          >
            {busy ? "Converting…" : "Create the project"}
          </button>
        </div>
      </div>
    </div>
  );
}
