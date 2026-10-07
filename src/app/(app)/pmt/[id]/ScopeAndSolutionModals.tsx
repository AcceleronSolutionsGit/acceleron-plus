"use client";

import React, { useState, useEffect, useRef } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { ColorBadge } from "@/components/ui/Badge";
import { formatDate } from "@/lib/utils";

interface Props {
  isScopeOpen: boolean;
  onCloseScope: () => void;
  isSolutionOpen: boolean;
  onCloseSolution: () => void;
  projectId: string;
  projectCode: string;
  projectName: string;
  clientName?: string;
  scopeBaseline?: string | null;
  solutionApproach?: string | null;
}

export function ScopeAndSolutionModals({
  isScopeOpen,
  onCloseScope,
  isSolutionOpen,
  onCloseSolution,
  projectId,
  projectCode,
  projectName,
  clientName = "Client",
  scopeBaseline,
  solutionApproach,
}: Props) {
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeUploadType, setActiveUploadType] = useState<"scope" | "solution_approach" | null>(null);

  const fetchDocs = () => {
    if (!projectId) return;
    setLoading(true);
    fetch(`/api/pmt/projects/${projectId}/documents`)
      .then((res) => res.json())
      .then((data) => {
        if (data.data) {
          setDocs(data.data);
        }
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if ((isScopeOpen || isSolutionOpen) && projectId) {
      fetchDocs();
    }
  }, [isScopeOpen, isSolutionOpen, projectId]);

  const handleTriggerUpload = (type: "scope" | "solution_approach") => {
    setActiveUploadType(type);
    setUploadError("");
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeUploadType) return;

    setUploading(true);
    setUploadError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append(
        "title",
        file.name.replace(/\.[^.]+$/, "") || (activeUploadType === "scope" ? "Scope Document" : "Solution Approach")
      );
      formData.append("documentType", activeUploadType);
      formData.append("category", activeUploadType === "scope" ? "delivery" : "presales");
      formData.append("accessLevel", "team");

      const res = await fetch(`/api/pmt/projects/${projectId}/documents`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setUploadError(data.message || data.error || "Failed to upload document.");
      } else {
        fetchDocs();
      }
    } catch (err: any) {
      setUploadError(err.message || "Network error while uploading file.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const scopeDocs = docs.filter((d) => d.documentType === "scope");
  const solutionDocs = docs.filter((d) => d.documentType === "solution_approach");

  const renderDocList = (list: any[], typeName: string, typeKey: "scope" | "solution_approach") => {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs uppercase font-bold text-navy-600 tracking-wider">
            Attached {typeName} Documents ({list.length})
          </h4>
          <button
            type="button"
            onClick={() => handleTriggerUpload(typeKey)}
            disabled={uploading}
            className="px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
          >
            <span>+</span> {uploading && activeUploadType === typeKey ? "Uploading..." : `Upload ${typeName} Document`}
          </button>
        </div>

        {uploadError && activeUploadType === typeKey && (
          <div className="p-3 bg-red-50 text-red-700 text-xs rounded-lg border border-red-200">
            {uploadError}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-navy-500 italic">Loading documents...</p>
        ) : list.length === 0 ? (
          <div className="bg-neutral-50 p-6 rounded-xl border border-neutral-200 text-center space-y-2">
            <p className="text-sm text-navy-600 font-medium">No {typeName} documents uploaded yet.</p>
            <p className="text-xs text-navy-500">
              Click &quot;Upload {typeName} Document&quot; above to upload PDF, Word, or specification files.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {list.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between p-3.5 bg-white border border-neutral-200 rounded-xl hover:shadow-sm transition-shadow"
              >
                <div>
                  <h5 className="font-semibold text-navy-900 text-sm">{doc.title}</h5>
                  <p className="text-xs text-navy-500 mt-0.5">
                    {doc.fileName} • Version {doc.version || "1.0"} • Uploaded by {doc.uploadedByName || "Team"} on{" "}
                    {formatDate(doc.createdAt)}
                  </p>
                </div>
                <a
                  href={`/api/documents/${doc.id}/download`}
                  download
                  className="px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-xs font-semibold transition-colors"
                >
                  Download
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Hidden file input for quick uploads */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileSelected}
      />

      {/* ─── 1. SCOPE OF WORK MODAL ───────────────────────── */}
      <Modal
        isOpen={isScopeOpen}
        onClose={onCloseScope}
        title={`Scope Baseline & Deliverables Statement: ${projectCode}`}
        className="max-w-2xl"
        footer={
          <div className="flex justify-end w-full">
            <Button variant="secondary" onClick={onCloseScope}>
              Close
            </Button>
          </div>
        }
      >
        <div className="space-y-6 text-sm text-navy-800">
          <div className="bg-neutral-50 p-4 rounded-xl border border-neutral-200/80 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold bg-navy-900 text-white px-2 py-0.5 rounded">
                  {projectCode}
                </span>
                <span className="font-bold text-navy-900">{projectName}</span>
              </div>
              <ColorBadge colorClass="bg-emerald-50 text-emerald-700 border border-emerald-200">
                SCOPE OF WORK
              </ColorBadge>
            </div>
            <p className="text-xs text-navy-500">
              Client Sponsor: <span className="font-semibold text-navy-700">{clientName}</span>
            </p>
          </div>

          {/* Scope Baseline Statement */}
          <div className="space-y-1.5">
            <h4 className="text-xs uppercase font-bold text-navy-600 tracking-wider">
              Scope Baseline & Deliverables Statement
            </h4>
            <div className="p-4 bg-navy-50/50 rounded-xl border border-navy-500/15 text-sm text-navy-800 whitespace-pre-wrap leading-relaxed min-h-[80px]">
              {scopeBaseline || (
                <span className="text-navy-400 italic">
                  No written scope baseline statement provided yet. You can update this via &quot;Edit Project&quot; or upload a Scope document below.
                </span>
              )}
            </div>
          </div>

          {/* Documents */}
          {renderDocList(scopeDocs, "Scope of Work", "scope")}
        </div>
      </Modal>

      {/* ─── 2. SOLUTION APPROACH MODAL ─────────────── */}
      <Modal
        isOpen={isSolutionOpen}
        onClose={onCloseSolution}
        title={`Solution Approach & Technical Architecture: ${projectCode}`}
        className="max-w-2xl"
        footer={
          <div className="flex justify-end w-full">
            <Button variant="secondary" onClick={onCloseSolution}>
              Close
            </Button>
          </div>
        }
      >
        <div className="space-y-6 text-sm text-navy-800">
          <div className="bg-gradient-to-r from-navy-900 to-navy-800 text-white p-4 rounded-xl shadow-sm space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold bg-blue-500/20 text-blue-200 border border-blue-400/30 px-2 py-0.5 rounded">
                SOLUTION APPROACH
              </span>
            </div>
            <h3 className="text-base font-bold text-white mt-1">
              {projectName}
            </h3>
          </div>

          {/* Solution Approach Statement */}
          <div className="space-y-1.5">
            <h4 className="text-xs uppercase font-bold text-navy-600 tracking-wider">
              Technical Architecture & Delivery Strategy
            </h4>
            <div className="p-4 bg-neutral-50 rounded-xl border border-neutral-200 text-sm text-navy-800 whitespace-pre-wrap leading-relaxed min-h-[80px]">
              {solutionApproach || (
                <span className="text-navy-400 italic">
                  No written technical architecture statement provided yet. You can update this via &quot;Edit Project&quot; or upload a Solution Approach document below.
                </span>
              )}
            </div>
          </div>

          {/* Documents */}
          {renderDocList(solutionDocs, "Solution Approach", "solution_approach")}
        </div>
      </Modal>
    </>
  );
}
