"use client";

import React, { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatISODate } from "@/lib/dates";

export default function LeadSolutionPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id: leadId } = use(params);

  const [lead, setLead] = useState<any>(null);
  const [docs, setDocs] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [leadRes, docsRes] = await Promise.all([
          fetch(`/api/pmt/leads/${leadId}`),
          fetch(`/api/pmt/leads/${leadId}/documents`)
        ]);

        const leadData = await leadRes.json();
        const docsData = await docsRes.json();

        if (leadData?.lead) {
          setLead(leadData.lead);
          setText(leadData.lead.solutionApproach || "");
        }
        if (docsData?.documents) {
          setDocs(docsData.documents.filter((d: any) => d.documentType === "solution"));
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, [leadId]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/pmt/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ solutionApproach: text }),
      });
      if (res.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch {
      // ignore
    }
    setIsSaving(false);
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto py-8 px-4 flex items-center justify-center min-h-[400px]">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-navy-900/15 border-t-navy-500" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <div className="bg-white w-full rounded-2xl shadow-sm border border-navy-500/10 p-6 sm:p-8 space-y-6">
        <div className="flex items-start justify-between pb-4 border-b border-navy-500/10">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-mono font-bold bg-navy-100 text-navy-700 px-2 py-0.5 rounded">
                {lead?.leadNumber}
              </span>
              <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                SOLUTION APPROACH
              </span>
            </div>
            <h1 className="text-2xl font-bold text-navy-900 font-[family-name:var(--font-league-spartan)]">
              Solution Approach: {lead?.companyName}
            </h1>
          </div>
        </div>

        {/* Written Solution Statement */}
        <div className="space-y-3">
          <label className="block text-xs uppercase font-bold text-navy-700 tracking-wider">
            Solution Approach Statement
          </label>
          <textarea
            rows={8}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Technical architecture, technology stack, integration strategy, and delivery methodology..."
            className="w-full text-sm border border-navy-500/20 rounded-xl p-4 focus:ring-2 focus:ring-amber-500/20 focus:outline-none shadow-inner bg-white"
          />
          <div className="flex items-center justify-between">
            {saveSuccess ? (
              <span className="text-sm font-semibold text-emerald-600">✓ Solution saved successfully</span>
            ) : (
              <span className="text-sm text-navy-400">Transfers automatically to project on conversion</span>
            )}
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-5 py-2.5 bg-navy-900 text-white rounded-lg text-sm font-bold hover:bg-navy-800 disabled:opacity-50 cursor-pointer shadow-sm transition-colors"
            >
              {isSaving ? "Saving..." : "Save Solution Statement"}
            </button>
          </div>
        </div>

        {/* Attached Solution Documents */}
        <div className="space-y-4 pt-6 border-t border-navy-500/10">
          <div className="flex items-center justify-between">
            <h4 className="text-sm uppercase font-bold text-navy-700 tracking-wider">
              Attached Architecture & Solution Documents ({docs.length})
            </h4>
            <Link
              href={`/pmt/leads/${leadId}/documents/upload?type=solution`}
              className="px-4 py-2 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-lg text-sm font-bold transition-colors cursor-pointer"
            >
              + Upload Document
            </Link>
          </div>

          {docs.length === 0 ? (
            <div className="bg-neutral-50 p-8 rounded-xl border border-neutral-200 text-center space-y-2">
              <p className="text-sm text-navy-600 font-medium">No solution documents attached yet.</p>
              <p className="text-sm text-navy-400">
                Upload architecture diagrams, proposed timelines, or technical approach papers.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {docs.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-4 bg-white border border-neutral-200 rounded-xl hover:shadow-md transition-shadow"
                >
                  <div>
                    <h5 className="font-semibold text-navy-900 text-sm mb-1">{doc.title}</h5>
                    <p className="text-xs text-navy-500">
                      {doc.fileName} • {doc.fileSizeDisplay} • {formatISODate(doc.createdAt)}
                    </p>
                  </div>
                  <a
                    href={`/api/documents/${doc.id}/download`}
                    download
                    className="px-4 py-2 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-lg text-sm font-semibold transition-colors"
                  >
                    Download
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end pt-6 border-t border-navy-500/10">
          <button
            onClick={() => router.push(`/pmt/leads/${leadId}`)}
            className="px-6 py-2.5 text-sm font-semibold rounded-xl border border-navy-500/20 text-navy-700 hover:bg-neutral-50 cursor-pointer transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
