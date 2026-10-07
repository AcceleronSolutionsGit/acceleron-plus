"use client";

import React, { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatISODate } from "@/lib/dates";

export default function LeadDocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id: leadId } = use(params);

  const [lead, setLead] = useState<any>(null);
  const [docs, setDocs] = useState<any[]>([]);
  const [filterType, setFilterType] = useState<string>("all");
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
        }
        if (docsData?.documents) {
          setDocs(docsData.documents);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, [leadId]);

  const filteredDocs = filterType === "all" ? docs : docs.filter((d) => d.documentType === filterType);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4 flex items-center justify-center min-h-[400px]">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-navy-900/15 border-t-navy-500" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <div className="bg-white w-full rounded-2xl shadow-sm border border-navy-500/10 p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between pb-4 border-b border-navy-500/10 gap-4">
          <div>
            <span className="text-xs font-mono font-bold bg-navy-100 text-navy-700 px-2 py-0.5 rounded inline-block mb-2">
              {lead?.leadNumber}
            </span>
            <h1 className="text-2xl font-bold text-navy-900 font-[family-name:var(--font-league-spartan)]">
              Documents & Attachments: {lead?.companyName}
            </h1>
            <p className="text-sm text-navy-500 mt-1">
              All documents will carry over to the project when converted.
            </p>
          </div>
          <button
            onClick={() => router.push(`/pmt/leads/${leadId}`)}
            className="px-5 py-2 text-sm font-semibold rounded-xl border border-navy-500/20 text-navy-700 hover:bg-neutral-50 cursor-pointer transition-colors whitespace-nowrap"
          >
            Done
          </button>
        </div>

        {/* Filter Tabs + Action */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-1.5 bg-neutral-100 p-1.5 rounded-xl text-sm">
            {["all", "scope", "solution_approach", "proposal", "other"].map((t) => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={`px-3 py-1.5 rounded-lg font-semibold capitalize transition-colors cursor-pointer ${
                  filterType === t ? "bg-white text-navy-900 shadow-sm" : "text-navy-500 hover:text-navy-800"
                }`}
              >
                {t === "solution_approach" ? "Solution" : t}
              </button>
            ))}
          </div>

          <Link
            href={`/pmt/leads/${leadId}/documents/upload?type=${filterType === "all" ? "scope" : filterType}`}
            className="px-5 py-2.5 bg-navy-900 text-white hover:bg-navy-800 rounded-xl text-sm font-bold transition-colors cursor-pointer shadow-sm text-center"
          >
            + Upload Document
          </Link>
        </div>

        {/* Document list */}
        {filteredDocs.length === 0 ? (
          <div className="bg-neutral-50 p-10 rounded-xl border border-neutral-200 text-center space-y-2 mt-4">
            <p className="text-base text-navy-600 font-medium">No documents found.</p>
            <p className="text-sm text-navy-400 max-w-md mx-auto">
              Click &quot;+ Upload Document&quot; above to attach Scope, Solution Approach, or Proposal files.
            </p>
          </div>
        ) : (
          <div className="space-y-3 mt-4">
            {filteredDocs.map((doc) => (
              <div
                key={doc.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-white border border-neutral-200 rounded-xl hover:shadow-md transition-shadow gap-4"
              >
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h5 className="font-semibold text-navy-900 text-base">{doc.title}</h5>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider bg-navy-50 text-navy-700 border border-navy-200">
                      {doc.documentType}
                    </span>
                  </div>
                  <p className="text-xs text-navy-500">
                    {doc.fileName} • {doc.fileSizeDisplay} • Uploaded by {doc.uploadedByName || "Team"} on{" "}
                    {formatISODate(doc.createdAt)}
                  </p>
                </div>
                <a
                  href={`/api/documents/${doc.id}/download`}
                  download
                  className="px-4 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-sm font-semibold transition-colors text-center whitespace-nowrap"
                >
                  Download
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
