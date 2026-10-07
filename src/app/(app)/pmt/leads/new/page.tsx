"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewLeadPage() {
  const router = useRouter();
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [value, setValue] = useState("");
  const [expectedCloseDate, setExpectedCloseDate] = useState("");
  const [description, setDescription] = useState("");
  const [scopeBaseline, setScopeBaseline] = useState("");
  const [solutionApproach, setSolutionApproach] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!companyName.trim()) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/pmt/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: companyName.trim(),
          contactName: contactName.trim() || null,
          contactEmail: contactEmail.trim() || null,
          opportunityValueInr: value ? Number(value) : null,
          expectedCloseDate: expectedCloseDate || null,
          description: description.trim() || null,
          scopeBaseline: scopeBaseline.trim() || null,
          solutionApproach: solutionApproach.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          (data.details ?? []).map((d: { message: string }) => d.message).join(" ") ||
            data.error ||
            "Could not create the lead."
        );
        return;
      }
      router.push("/pmt/leads");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const field =
    "w-full px-3.5 py-2.5 text-sm rounded-lg border border-navy-500/30 focus:outline-none focus:ring-2 focus:ring-navy-700/30 focus:border-navy-700";
  const label = "block text-[10px] uppercase tracking-wider text-navy-500 font-semibold mb-1";

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <div className="bg-white w-full rounded-xl shadow-sm border border-navy-500/10 p-6">
        <h3 className="text-xl font-bold text-navy-900 font-[family-name:var(--font-league-spartan)]">
          New lead
        </h3>
        <p className="text-sm text-navy-500 mt-1">
          It starts in <span className="font-medium">New Leads</span>; you can move it along as the deal progresses.
        </p>

        <div className="mt-6 space-y-4">
          <div>
            <label className={label}>Company *</label>
            <input
              autoFocus
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="e.g. Gainwell Commosales"
              className={field}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={label}>Contact</label>
              <input value={contactName} onChange={(e) => setContactName(e.target.value)} className={field} />
            </div>
            <div>
              <label className={label}>Email</label>
              <input
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                className={field}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={label}>Opportunity value (₹)</label>
              <input
                type="number"
                min={0}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Leave blank until estimated"
                className={field}
              />
            </div>
            <div>
              <label className={label}>Expected close</label>
              <input
                type="date"
                value={expectedCloseDate}
                onChange={(e) => setExpectedCloseDate(e.target.value)}
                className={field}
              />
            </div>
          </div>
          <div>
            <label className={label}>What are they asking for? (Description)</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="High-level customer requirements or RFP overview..."
              className={field}
            />
          </div>
          <div>
            <label className={label}>Scope Baseline & Key Deliverables</label>
            <textarea
              rows={3}
              value={scopeBaseline}
              onChange={(e) => setScopeBaseline(e.target.value)}
              placeholder="In-scope deliverables, boundary definitions, milestones..."
              className={field}
            />
          </div>
          <div>
            <label className={label}>Solution Approach & Technical Architecture</label>
            <textarea
              rows={3}
              value={solutionApproach}
              onChange={(e) => setSolutionApproach(e.target.value)}
              placeholder="Proposed technical stack, delivery strategy, architecture notes..."
              className={field}
            />
          </div>
        </div>

        {error && (
          <div role="alert" className="mt-4 bg-red-600/5 border border-red-600/20 text-red-600 text-sm rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-navy-500/10">
          <button
            onClick={() => router.back()}
            className="px-5 py-2 text-sm font-semibold rounded-xl border border-navy-500/20 text-navy-700 hover:bg-neutral-50 cursor-pointer transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || !companyName.trim()}
            className="px-5 py-2 bg-navy-900 text-white text-sm font-semibold rounded-xl hover:bg-navy-700 disabled:opacity-40 cursor-pointer transition-colors shadow-sm"
          >
            {busy ? "Creating…" : "Create lead"}
          </button>
        </div>
      </div>
    </div>
  );
}
