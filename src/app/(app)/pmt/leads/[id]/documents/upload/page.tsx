"use client";

import React, { useState, useEffect, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function UploadLeadDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { id: leadId } = use(params);
  const initialType = searchParams.get("type") || "scope";

  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [documentType, setDocumentType] = useState(initialType);
  const [category, setCategory] = useState("presales");
  const [description, setDescription] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      if (!title) {
        setTitle(f.name.replace(/\.[^.]+$/, ""));
      }
    }
  };

  const submit = async () => {
    if (!file) {
      setError("Please choose a file to upload.");
      return;
    }
    if (!title.trim()) {
      setError("Please give the document a title.");
      return;
    }

    setUploading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", title.trim());
      formData.append("documentType", documentType);
      formData.append("category", category);
      if (description.trim()) formData.append("description", description.trim());

      const res = await fetch(`/api/pmt/leads/${leadId}/documents`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || data.error || "Failed to upload file.");
        return;
      }
      
      // Go back to the previous page where they came from
      router.back();
      setTimeout(() => router.refresh(), 100);
    } catch (err: any) {
      setError(err.message || "Network error while uploading file.");
    } finally {
      setUploading(false);
    }
  };

  const field = "w-full px-4 py-2.5 text-sm rounded-xl border border-navy-500/20 focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500/40 transition-all bg-white";
  const label = "block text-[11px] uppercase tracking-widest text-navy-500 font-bold mb-1.5";

  return (
    <div className="max-w-xl mx-auto py-8 px-4">
      <div className="bg-white w-full rounded-2xl shadow-sm border border-navy-500/10 p-6 sm:p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-navy-900 font-[family-name:var(--font-league-spartan)] mb-1">
            Upload Lead Document
          </h1>
          <p className="text-sm text-navy-500">
            Attach files to support the presales process
          </p>
        </div>

        <div className="space-y-4 pt-2">
          <div>
            <label className={label}>Select File *</label>
            <input
              type="file"
              onChange={handleFileChange}
              className="w-full text-sm text-navy-700 file:mr-4 file:py-2.5 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer transition-colors border border-navy-500/20 rounded-xl bg-neutral-50/50"
            />
          </div>

          <div>
            <label className={label}>Document Title *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Scope Baseline v1.0"
              className={field}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={label}>Document Type *</label>
              <select
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value)}
                className={field}
              >
                <option value="scope">Scope Document (SOW, RFP)</option>
                <option value="solution_approach">Solution / Architecture</option>
                <option value="commercials">Commercials / Pricing</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className={label}>Category *</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className={field}
              >
                <option value="presales">Presales / Pursuit</option>
                <option value="legal">Legal / Contract</option>
                <option value="technical">Technical</option>
              </select>
            </div>
          </div>

          <div>
            <label className={label}>Description (Optional)</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief note about what this document contains..."
              className={field}
            />
          </div>

          {error && (
            <div role="alert" className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-6 border-t border-navy-500/10">
          <button
            onClick={() => router.back()}
            disabled={uploading}
            className="px-5 py-2.5 text-sm font-semibold rounded-xl border border-navy-500/20 text-navy-700 hover:bg-neutral-50 cursor-pointer transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={uploading}
            className="px-6 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 cursor-pointer transition-colors shadow-sm"
          >
            {uploading ? "Uploading..." : "Upload Document"}
          </button>
        </div>
      </div>
    </div>
  );
}
