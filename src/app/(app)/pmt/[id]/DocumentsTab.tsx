"use client";

import React, { useState, useRef, useCallback } from "react";
import type { ProjectDocument, DocumentType, DocumentCategory, DocumentAccessLevel } from "@/lib/types";
import { formatDate, formatStatus } from "@/lib/utils";
import { Combobox } from "@/components/ui/Combobox";

// ─── Constants ─────────────────────────────────────────────────────

const DOCUMENT_TYPES: { value: DocumentType; label: string; icon: string; color: string }[] = [
  { value: "scope",            label: "Scope of Work",      icon: "📋", color: "bg-blue-50 text-blue-700 border-blue-200" },
  { value: "solution_approach", label: "Solution Approach & Architecture", icon: "📐", color: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  { value: "sop",              label: "SOP",                icon: "📖", color: "bg-purple-50 text-purple-700 border-purple-200" },
  { value: "proposal",         label: "Proposal",           icon: "📄", color: "bg-amber-50 text-amber-700 border-amber-200" },
  { value: "po",               label: "Purchase Order",     icon: "🧾", color: "bg-green-50 text-green-700 border-green-200" },
  { value: "contract",         label: "Contract",           icon: "⚖️",  color: "bg-red-50 text-red-700 border-red-200" },
  { value: "sow",              label: "Statement of Work",  icon: "📝", color: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  { value: "test_plan",        label: "Test Plan",          icon: "🧪", color: "bg-teal-50 text-teal-700 border-teal-200" },
  { value: "meeting_minutes",  label: "Meeting Minutes",    icon: "🗒️",  color: "bg-slate-50 text-slate-700 border-slate-200" },
  { value: "phase_report",     label: "Phase Report",       icon: "📊", color: "bg-orange-50 text-orange-700 border-orange-200" },
  { value: "risk_register",    label: "Risk Register",      icon: "⚠️",  color: "bg-rose-50 text-rose-700 border-rose-200" },
  { value: "other",            label: "Other",              icon: "📁", color: "bg-gray-50 text-gray-700 border-gray-200" },
];

const CATEGORIES: { value: DocumentCategory; label: string }[] = [
  { value: "general",    label: "General" },
  { value: "presales",   label: "Pre-Sales" },
  { value: "delivery",   label: "Delivery" },
  { value: "legal",      label: "Legal" },
  { value: "finance",    label: "Finance" },
  { value: "governance", label: "Governance" },
];

const ACCESS_LEVELS: { value: DocumentAccessLevel; label: string; description: string; icon: string }[] = [
  { value: "team",          label: "Team",          description: "PM + all team members",      icon: "👥" },
  { value: "pm_only",       label: "PM Only",       description: "Project Manager & Admin",    icon: "🔒" },
  { value: "client_visible", label: "Client Visible", description: "Shared with client portal", icon: "🌐" },
];

const MIME_ICONS: Record<string, string> = {
  "application/pdf":   "📕",
  "application/msword": "📘",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "📘",
  "application/vnd.ms-excel": "📗",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "📗",
  "application/vnd.ms-powerpoint": "📙",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "📙",
  "text/plain": "📄",
  "text/csv":   "📊",
  "image/png":  "🖼️",
  "image/jpeg": "🖼️",
  "application/zip": "🗜️",
};

function getMimeIcon(mimeType: string) {
  return MIME_ICONS[mimeType] ?? "📄";
}

function getDocTypeMeta(type: string) {
  return DOCUMENT_TYPES.find(d => d.value === type) ?? DOCUMENT_TYPES[DOCUMENT_TYPES.length - 1];
}

// ─── Upload Modal ───────────────────────────────────────────────────

function UploadModal({ projectId, onSuccess, onClose }: {
  projectId: string;
  onSuccess: () => void;
  onClose: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [form, setForm] = useState({
    title: "",
    documentType: "other" as DocumentType,
    category: "general" as DocumentCategory,
    description: "",
    version: "1.0",
    tags: "",
    accessLevel: "team" as DocumentAccessLevel,
  });

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) {
      setFile(dropped);
      if (!form.title) setForm(f => ({ ...f, title: dropped.name.replace(/\.[^.]+$/, "") }));
    }
  }, [form.title]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    if (picked) {
      setFile(picked);
      if (!form.title) setForm(f => ({ ...f, title: picked.name.replace(/\.[^.]+$/, "") }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setProgress(20);

    const fd = new FormData();
    fd.append("file", file);
    Object.entries(form).forEach(([k, v]) => fd.append(k, v));

    try {
      setProgress(50);
      const res = await fetch(`/api/pmt/projects/${projectId}/documents`, {
        method: "POST", body: fd,
      });
      setProgress(90);
      if (!res.ok) {
        const err = await res.json();
        alert(err.details?.[0]?.message ?? err.error ?? "Upload failed");
        return;
      }
      setProgress(100);
      onSuccess();
      onClose();
    } catch {
      alert("Upload failed due to network error");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-navy-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-navy-900 to-navy-800 px-6 py-5 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white font-[family-name:var(--font-league-spartan)]">Upload Document</h2>
            <p className="text-xs text-white/60 mt-0.5">PDF, DOCX, XLSX, PPTX, images — max 50 MB</p>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center gap-3 cursor-pointer transition-all duration-200
              ${dragOver ? "border-blue-500 bg-blue-50" : file ? "border-green-400 bg-green-50" : "border-navy-500/20 hover:border-blue-400 hover:bg-blue-50/50"}`}
          >
            <input ref={fileRef} type="file" className="sr-only" onChange={handleFileChange}
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.png,.jpg,.jpeg,.webp,.zip" />
            {file ? (
              <>
                <span className="text-3xl">{getMimeIcon(file.type)}</span>
                <div className="text-center">
                  <p className="font-semibold text-navy-900 text-sm">{file.name}</p>
                  <p className="text-xs text-navy-500 mt-0.5">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
                <span className="text-xs text-green-600 font-medium bg-green-100 px-3 py-1 rounded-full">✓ Ready to upload</span>
              </>
            ) : (
              <>
                <div className="w-12 h-12 rounded-xl bg-navy-50 flex items-center justify-center text-navy-500">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-navy-700">Drop file here or <span className="text-blue-600">browse</span></p>
              </>
            )}
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-bold text-navy-700 mb-1.5 uppercase tracking-wide">Document Title *</label>
            <input
              value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              required placeholder="e.g. Phase 1 Scope of Work"
              className="w-full text-sm border border-navy-500/15 rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Document Type */}
            <div>
              <label className="block text-xs font-bold text-navy-700 mb-1.5 uppercase tracking-wide">Type</label>
              <select value={form.documentType} onChange={e => setForm(f => ({ ...f, documentType: e.target.value as DocumentType }))}
                className="w-full text-sm border border-navy-500/15 rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white">
                {DOCUMENT_TYPES.map(dt => <option key={dt.value} value={dt.value}>{dt.icon} {dt.label}</option>)}
              </select>
            </div>
            {/* Category */}
            <div>
              <label className="block text-xs font-bold text-navy-700 mb-1.5 uppercase tracking-wide">Category</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as DocumentCategory }))}
                className="w-full text-sm border border-navy-500/15 rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white">
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Version */}
            <div>
              <label className="block text-xs font-bold text-navy-700 mb-1.5 uppercase tracking-wide">Version</label>
              <input value={form.version} onChange={e => setForm(f => ({ ...f, version: e.target.value }))}
                placeholder="1.0"
                className="w-full text-sm border border-navy-500/15 rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
            </div>
            {/* Access Level */}
            <div>
              <label className="block text-xs font-bold text-navy-700 mb-1.5 uppercase tracking-wide">Access</label>
              <select value={form.accessLevel} onChange={e => setForm(f => ({ ...f, accessLevel: e.target.value as DocumentAccessLevel }))}
                className="w-full text-sm border border-navy-500/15 rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white">
                {ACCESS_LEVELS.map(a => <option key={a.value} value={a.value}>{a.icon} {a.label}</option>)}
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-bold text-navy-700 mb-1.5 uppercase tracking-wide">Description</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={2} placeholder="Brief description of this document…"
              className="w-full text-sm border border-navy-500/15 rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none" />
          </div>

          {/* Tags */}
          <div>
            <label className="block text-xs font-bold text-navy-700 mb-1.5 uppercase tracking-wide">Tags (comma separated)</label>
            <input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
              placeholder="phase-1, final, approved"
              className="w-full text-sm border border-navy-500/15 rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
          </div>

          {/* Progress bar */}
          {uploading && (
            <div className="bg-navy-50 rounded-xl p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-navy-700">Uploading…</span>
                <span className="text-xs text-navy-500">{progress}%</span>
              </div>
              <div className="h-1.5 bg-navy-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2 border-t border-navy-500/10">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-navy-700 border border-navy-500/20 rounded-xl hover:bg-navy-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={!file || !form.title || uploading}
              className="px-5 py-2 text-sm font-semibold text-white bg-navy-900 rounded-xl hover:bg-navy-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2">
              {uploading ? (
                <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>Uploading…</>
              ) : "Upload Document"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Document Card ──────────────────────────────────────────────────

function DocumentCard({ doc, canDelete, onDelete }: {
  doc: any;
  canDelete: boolean;
  onDelete: (id: string) => void;
}) {
  const meta = getDocTypeMeta(doc.documentType);
  const accessMeta = ACCESS_LEVELS.find(a => a.value === doc.accessLevel)!;

  const handleDownload = () => {
    window.open(`/api/documents/${doc.id}/download`, "_blank");
  };
  const handlePreview = () => {
    window.open(`/api/documents/${doc.id}/download?mode=preview`, "_blank");
  };

  const isPreviewable = ["application/pdf", "image/png", "image/jpeg", "image/webp"].includes(doc.mimeType);

  return (
    <div className="group flex items-start gap-4 p-4 bg-white rounded-xl border border-navy-500/10 hover:border-navy-500/25 hover:shadow-md transition-all duration-200">
      {/* File icon */}
      <div className="w-12 h-12 flex-shrink-0 rounded-xl bg-navy-50 flex items-center justify-center text-2xl">
        {getMimeIcon(doc.mimeType)}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-sm text-navy-900 truncate">{doc.title}</p>
            <p className="text-xs text-navy-500 truncate mt-0.5">{doc.fileName}</p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${meta.color}`}>
              {meta.icon} {meta.label}
            </span>
          </div>
        </div>

        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
          <span className="text-[11px] text-navy-500">v{doc.version}</span>
          <span className="text-[11px] text-navy-400">•</span>
          <span className="text-[11px] text-navy-500">{doc.fileSizeDisplay}</span>
          <span className="text-[11px] text-navy-400">•</span>
          <span className="text-[11px] text-navy-500">{accessMeta.icon} {accessMeta.label}</span>
          <span className="text-[11px] text-navy-400">•</span>
          <span className="text-[11px] text-navy-500">↓ {doc.downloadCount}</span>
          <span className="text-[11px] text-navy-400">•</span>
          <span className="text-[11px] text-navy-500">{formatDate(doc.createdAt)}</span>
        </div>

        {/* Tags */}
        {doc.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {doc.tags.map((tag: string) => (
              <span key={tag} className="text-[10px] font-medium px-2 py-0.5 bg-navy-50 text-navy-600 rounded-full">
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Uploaded by */}
        {doc.uploadedByName && (
          <p className="text-[11px] text-navy-400 mt-1.5">Uploaded by {doc.uploadedByName}</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        {isPreviewable && (
          <button onClick={handlePreview} title="Preview"
            className="p-2 rounded-lg text-navy-500 hover:text-navy-900 hover:bg-navy-50 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          </button>
        )}
        <button onClick={handleDownload} title="Download"
          className="p-2 rounded-lg text-navy-500 hover:text-navy-900 hover:bg-navy-50 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </button>
        {canDelete && (
          <button onClick={() => onDelete(doc.id)} title="Delete"
            className="p-2 rounded-lg text-navy-500 hover:text-red-600 hover:bg-red-50 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main Documents Tab ─────────────────────────────────────────────

interface DocumentsTabProps {
  projectId: string;
  userRole: "admin" | "pm" | "member" | "client";
}

export function DocumentsTab({ projectId, userRole }: DocumentsTabProps) {
  const [docs, setDocs] = useState<any[]>([]);
  const [grouped, setGrouped] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [filterType, setFilterType] = useState<string>("all");
  const [filterAccess, setFilterAccess] = useState<string>("all");
  const [search, setSearch] = useState("");

  const canUpload = userRole === "admin" || userRole === "pm" || userRole === "member";
  const canDelete = userRole === "admin" || userRole === "pm";

  const loadDocs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterType !== "all") params.set("documentType", filterType);
      if (search) params.set("q", search);
      const res = await fetch(`/api/pmt/projects/${projectId}/documents?${params.toString()}`);
      const json = await res.json();
      if (json.success) {
        setDocs(json.data ?? []);
        setGrouped(json.grouped ?? {});
      }
    } finally {
      setLoading(false);
    }
  }, [projectId, filterType, search]);

  React.useEffect(() => { loadDocs(); }, [loadDocs]);

  const handleDelete = async (docId: string) => {
    if (!confirm("Delete this document? This cannot be undone.")) return;
    const res = await fetch(`/api/documents/${docId}/download`, { method: "DELETE" });
    if (res.ok) loadDocs();
  };

  const visibleDocs = filterAccess === "all" ? docs
    : docs.filter((d: any) => d.accessLevel === filterAccess);

  const visibleGrouped: Record<string, any[]> = {};
  if (filterType === "all") {
    for (const [type, items] of Object.entries(grouped)) {
      const filtered = filterAccess === "all" ? items : items.filter((d: any) => d.accessLevel === filterAccess);
      if (filtered.length > 0) visibleGrouped[type] = filtered;
    }
  }

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search */}
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-navy-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search documents…"
              className="pl-9 pr-4 py-2 text-sm border border-navy-500/15 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 w-48"
            />
          </div>

          {/* Type filter */}
          <Combobox
            className="min-w-[200px]"
            value={filterType}
            onChange={setFilterType}
            placeholder="All Types"
            searchPlaceholder="Search document types…"
            options={[
              { value: "all", label: "All Types" },
              ...DOCUMENT_TYPES.map((dt) => ({ value: dt.value, label: `${dt.icon} ${dt.label}` })),
            ]}
          />

          {/* Access filter (not for client) */}
          {userRole !== "client" && (
            <Combobox
              className="min-w-[190px]"
              value={filterAccess}
              onChange={setFilterAccess}
              placeholder="All Access"
              searchPlaceholder="Search access levels…"
              options={[
                { value: "all", label: "All Access" },
                ...ACCESS_LEVELS.map((a) => ({ value: a.value, label: `${a.icon} ${a.label}` })),
              ]}
            />
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm text-navy-500">{visibleDocs.length} document{visibleDocs.length !== 1 ? "s" : ""}</span>
          {canUpload && (
            <button onClick={() => setShowUpload(true)}
              className="flex items-center gap-2 px-4 py-2 bg-navy-900 text-white text-sm font-semibold rounded-xl hover:bg-navy-700 transition-colors shadow-sm shadow-navy-900/20">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              Upload Document
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-navy-900/20 border-t-navy-900 rounded-full animate-spin" />
        </div>
      ) : visibleDocs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-navy-50 flex items-center justify-center text-3xl mb-4">📂</div>
          <p className="font-semibold text-navy-900">No documents yet</p>
          <p className="text-sm text-navy-500 mt-1 max-w-xs">
            {canUpload ? "Upload project documents like scope, SOP, proposals, contracts and more." : "No documents have been shared with you yet."}
          </p>
          {canUpload && (
            <button onClick={() => setShowUpload(true)}
              className="mt-4 px-4 py-2 bg-navy-900 text-white text-sm font-semibold rounded-xl hover:bg-navy-700 transition-colors">
              Upload First Document
            </button>
          )}
        </div>
      ) : filterType === "all" ? (
        // Grouped view
        <div className="space-y-6">
          {Object.entries(visibleGrouped).map(([type, items]) => {
            const meta = getDocTypeMeta(type);
            return (
              <div key={type}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-base">{meta.icon}</span>
                  <h3 className="font-semibold text-sm text-navy-900">{meta.label}</h3>
                  <span className="text-xs text-navy-500 bg-navy-50 px-2 py-0.5 rounded-full">{items.length}</span>
                </div>
                <div className="space-y-2 pl-1 border-l-2 border-navy-50 ml-2.5 pl-4">
                  {items.map((doc: any) => (
                    <DocumentCard key={doc.id} doc={doc} canDelete={canDelete} onDelete={handleDelete} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        // Flat filtered view
        <div className="space-y-2">
          {visibleDocs.map((doc: any) => (
            <DocumentCard key={doc.id} doc={doc} canDelete={canDelete} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {/* Upload modal */}
      {showUpload && (
        <UploadModal
          projectId={projectId}
          onSuccess={loadDocs}
          onClose={() => setShowUpload(false)}
        />
      )}
    </div>
  );
}
