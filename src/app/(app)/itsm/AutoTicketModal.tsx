"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Combobox } from "@/components/ui/Combobox";
import { Input } from "@/components/ui/Input";

// ─── Types ───────────────────────────────────────────────────────────

interface InferredFields {
  subject: string;
  description: string;
  priority: "low" | "medium" | "high" | "urgent";
  ticketType: "incident" | "service_request" | "problem" | "query";
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onTicketCreated: (ticket: any) => void;
  projects?: Array<{ code: string; name: string; currentPhase?: string }>;
  currentUser?: any;
}

// ─── Helpers ─────────────────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function getFileIcon(mimeType: string): string {
  if (mimeType === "application/pdf") return "📄";
  if (mimeType.startsWith("image/")) return "🖼️";
  if (mimeType.includes("word")) return "📝";
  if (mimeType.includes("excel") || mimeType.includes("spreadsheet")) return "📊";
  if (mimeType === "text/plain" || mimeType === "text/csv") return "📋";
  return "📎";
}

const PRIORITY_STYLES: Record<string, string> = {
  urgent: "bg-red-100 text-red-800 border-red-300 ring-red-500",
  high: "bg-orange-100 text-orange-800 border-orange-300 ring-orange-500",
  medium: "bg-amber-100 text-amber-800 border-amber-300 ring-amber-500",
  low: "bg-green-100 text-green-800 border-green-300 ring-green-500",
};

const TYPE_STYLES: Record<string, string> = {
  incident: "bg-red-50 text-red-700 border-red-200",
  service_request: "bg-blue-50 text-blue-700 border-blue-200",
  problem: "bg-purple-50 text-purple-700 border-purple-200",
  query: "bg-teal-50 text-teal-700 border-teal-200",
};

// ─── Main Component ───────────────────────────────────────────────────

type Step = "upload" | "review" | "submitting" | "success";

export function AutoTicketModal({ isOpen, onClose, onTicketCreated, projects = [], currentUser }: Props) {
  const [step, setStep] = useState<Step>("upload");
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  // Inferred / editable fields
  const [fields, setFields] = useState<InferredFields>({
    subject: "",
    description: "",
    priority: "medium",
    ticketType: "incident",
  });
  const [projectCode, setProjectCode] = useState("");
  const [extractedPreview, setExtractedPreview] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileSize, setFileSize] = useState(0);
  const [mimeType, setMimeType] = useState("");
  const [createdTicket, setCreatedTicket] = useState<any>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  // Reset when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setTimeout(() => {
        setStep("upload");
        setFile(null);
        setAnalyzeError(null);
        setFields({ subject: "", description: "", priority: "medium", ticketType: "incident" });
        setProjectCode("");
        setExtractedPreview("");
        setCreatedTicket(null);
      }, 300);
    }
  }, [isOpen]);

  // ─── Drag-and-drop ─────────────────────────────────────────────────

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) pickFile(dropped);
  }, []); // eslint-disable-line

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    if (picked) pickFile(picked);
  };

  // ─── File selection → preview analysis ─────────────────────────────

  const ALLOWED_TYPES = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
    "text/csv",
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
  ];

  const pickFile = async (f: File) => {
    if (!ALLOWED_TYPES.includes(f.type)) {
      setAnalyzeError(`Unsupported file type: ${f.type || "unknown"}. Please upload a PDF, Word doc, or text file.`);
      return;
    }
    if (f.size > 20 * 1024 * 1024) {
      setAnalyzeError("File is too large (max 20 MB).");
      return;
    }
    setFile(f);
    setAnalyzeError(null);
    setIsAnalyzing(true);

    try {
      const form = new FormData();
      form.append("file", f);
      form.append("preview", "true");

      const res = await fetch("/api/itsm/tickets/generate", {
        method: "POST",
        body: form,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed");

      setFields(data.inferred);
      setExtractedPreview(data.extractedText || "");
      setFileName(data.fileName);
      setFileSize(data.fileSize);
      setMimeType(data.mimeType);
      setStep("review");
    } catch (err: any) {
      setAnalyzeError(err.message || "Failed to analyse attachment");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // ─── Submit ──────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!file) return;
    setStep("submitting");

    try {
      const form = new FormData();
      form.append("file", file);
      if (projectCode) form.append("projectCode", projectCode);
      if (currentUser?.id) form.append("requesterId", currentUser.id);

      const res = await fetch("/api/itsm/tickets/generate", {
        method: "POST",
        body: form,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ticket creation failed");

      setCreatedTicket(data.ticket);
      setStep("success");
      onTicketCreated(data.ticket);
    } catch (err: any) {
      setAnalyzeError(err.message || "Failed to create ticket");
      setStep("review");
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────

  const title =
    step === "upload"
      ? "Auto-Generate Ticket from Attachment"
      : step === "review"
      ? "Review & Confirm Auto-Generated Ticket"
      : step === "submitting"
      ? "Creating Ticket..."
      : "Ticket Created!";

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      footer={
        step === "upload" ? (
          <div className="flex justify-end gap-2 w-full">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
          </div>
        ) : step === "review" ? (
          <div className="flex justify-between items-center w-full">
            <Button variant="secondary" onClick={() => { setStep("upload"); setFile(null); }}>
              ← Re-upload
            </Button>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={onClose}>Cancel</Button>
              <Button
                onClick={handleSubmit}
                className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
              >
                Create Ticket
              </Button>
            </div>
          </div>
        ) : step === "success" ? (
          <div className="flex justify-end gap-2 w-full">
            <Button variant="secondary" onClick={onClose}>Close</Button>
            <Button onClick={() => window.open(`/itsm/${createdTicket?.ticket_number || createdTicket?.ticketNumber}`, "_blank")}>
              View Ticket
            </Button>
          </div>
        ) : null
      }
    >
      {/* ── Step: Upload ── */}
      {step === "upload" && (
        <div className="space-y-5">
          <p className="text-sm text-navy-600">
            Upload an attachment (PDF, Word, text file, or image). Acceleron will read it,
            extract the content, and <span className="font-semibold text-navy-900">automatically populate the ticket fields</span> for your review.
          </p>

          {/* Drag-and-drop zone */}
          <div
            ref={dropRef}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`relative rounded-2xl border-2 border-dashed p-10 flex flex-col items-center justify-center cursor-pointer transition-all duration-300 group select-none
              ${isDragging
                ? "border-blue-500 bg-blue-50 scale-[1.01] shadow-lg shadow-blue-500/20"
                : "border-navy-300/40 bg-neutral-50/60 hover:border-blue-400/60 hover:bg-blue-50/30"
              }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.txt,.csv,.png,.jpg,.jpeg,.webp,.gif"
              className="hidden"
              onChange={handleFileInput}
            />

            {/* Animated upload icon */}
            <div className={`relative mb-4 p-5 rounded-full bg-white shadow-md transition-all duration-300 ${isDragging ? "scale-110 shadow-blue-300/40" : "group-hover:scale-105"}`}>
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-blue-500/10 to-purple-500/10 animate-pulse" />
              <svg className={`w-10 h-10 transition-colors ${isDragging ? "text-blue-600" : "text-navy-400 group-hover:text-blue-500"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>

            <p className={`text-base font-bold transition-colors ${isDragging ? "text-blue-700" : "text-navy-700 group-hover:text-navy-900"}`}>
              {isDragging ? "Drop it here!" : "Drag & drop your file here"}
            </p>
            <p className="text-sm text-navy-500 mt-1">
              or <span className="text-blue-600 font-semibold underline underline-offset-2">click to browse</span>
            </p>
            <p className="text-xs text-navy-400 mt-3 font-medium">
              PDF · Word · Text · CSV · Images &nbsp;·&nbsp; Max 20 MB
            </p>
          </div>

          {isAnalyzing && (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-blue-50 border border-blue-200">
              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-blue-800">Analysing attachment...</p>
                <p className="text-xs text-blue-600 mt-0.5">Extracting text and inferring ticket details</p>
              </div>
            </div>
          )}

          {analyzeError && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-200">
              <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <div>
                <p className="text-sm font-semibold text-red-800">Analysis failed</p>
                <p className="text-xs text-red-600 mt-0.5">{analyzeError}</p>
              </div>
            </div>
          )}

          {/* How it works */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: "📤", title: "Upload", desc: "Drop any document or image" },
              { icon: "🤖", title: "Auto-Read", desc: "Content is extracted & analysed" },
              { icon: "🎫", title: "Ticket Ready", desc: "Fields pre-filled for your review" },
            ].map((s) => (
              <div key={s.title} className="text-center p-3 rounded-xl bg-white border border-navy-500/10 shadow-sm">
                <div className="text-2xl mb-1.5">{s.icon}</div>
                <p className="text-xs font-bold text-navy-900">{s.title}</p>
                <p className="text-[11px] text-navy-500 mt-0.5 leading-tight">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Step: Review ── */}
      {step === "review" && (
        <div className="space-y-5">
          {/* File info pill */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200">
            <div className="text-2xl">{getFileIcon(mimeType)}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-emerald-900 truncate">{fileName}</p>
              <p className="text-xs text-emerald-600">{formatSize(fileSize)} · Successfully analysed</p>
            </div>
            <svg className="w-5 h-5 text-emerald-500 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          </div>

          {analyzeError && (
            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800">
              <svg className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              {analyzeError}
            </div>
          )}

          {/* Auto-detected badge */}
          <div className="flex items-center gap-2 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2">
            <span className="text-lg">✨</span>
            Fields auto-detected from attachment — review and edit before creating
          </div>

          {/* Subject */}
          <div>
            <label className="block text-xs font-bold text-navy-700 mb-1.5">Subject *</label>
            <Input
              value={fields.subject}
              onChange={(e) => setFields({ ...fields, subject: e.target.value })}
              placeholder="Ticket subject..."
              required
            />
          </div>

          {/* Type & Priority row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-navy-700 mb-2">Ticket Type</label>
              <div className="flex flex-col gap-1.5">
                {(["incident", "service_request", "problem", "query"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setFields({ ...fields, ticketType: t })}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all text-left ${
                      fields.ticketType === t
                        ? `${TYPE_STYLES[t]} ring-1 ring-offset-1 ring-current shadow-sm`
                        : "border-neutral-200 text-navy-600 hover:bg-neutral-50"
                    }`}
                  >
                    {t === "service_request" ? "Service Request" : t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-navy-700 mb-2">Priority</label>
              <div className="flex flex-col gap-1.5">
                {(["urgent", "high", "medium", "low"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setFields({ ...fields, priority: p })}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all text-left capitalize ${
                      fields.priority === p
                        ? `${PRIORITY_STYLES[p]} ring-1 ring-offset-1 shadow-sm`
                        : "border-neutral-200 text-navy-600 hover:bg-neutral-50"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-bold text-navy-700 mb-1.5">Description</label>
            <textarea
              value={fields.description}
              onChange={(e) => setFields({ ...fields, description: e.target.value })}
              rows={4}
              className="w-full text-sm border border-navy-500/15 rounded-xl px-3 py-2.5 bg-neutral-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all resize-y"
              placeholder="Detailed description..."
            />
          </div>

          {/* Link to Project */}
          {projects.length > 0 && (
            <div>
              <Combobox
                label="Link to Project (optional)"
                value={projectCode}
                onChange={setProjectCode}
                options={[
                  { value: "", label: "No Project (Unlinked)" },
                  ...projects.map((p) => ({
                    value: p.code,
                    label: `${p.code} — ${p.name}`,
                    detail: p.currentPhase ? p.currentPhase : undefined
                  }))
                ]}
              />
            </div>
          )}

          {/* Extracted text preview */}
          {extractedPreview && (
            <details className="group">
              <summary className="cursor-pointer text-xs font-semibold text-navy-500 hover:text-navy-700 flex items-center gap-1.5 py-1">
                <svg className="w-3.5 h-3.5 group-open:rotate-90 transition-transform" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
                View extracted text ({extractedPreview.length} chars)
              </summary>
              <div className="mt-2 p-3 bg-neutral-50 rounded-lg border border-neutral-200 text-xs text-navy-600 font-mono whitespace-pre-wrap max-h-32 overflow-y-auto">
                {extractedPreview}
              </div>
            </details>
          )}
        </div>
      )}

      {/* ── Step: Submitting ── */}
      {step === "submitting" && (
        <div className="py-10 flex flex-col items-center justify-center gap-4 text-center">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 rounded-full bg-blue-100 animate-ping opacity-40" />
            <div className="relative w-16 h-16 rounded-full bg-blue-50 border-2 border-blue-500/30 flex items-center justify-center">
              <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          </div>
          <div>
            <p className="text-base font-bold text-navy-900">Creating ticket...</p>
            <p className="text-sm text-navy-500 mt-1">Saving attachment & writing to database</p>
          </div>
        </div>
      )}

      {/* ── Step: Success ── */}
      {step === "success" && createdTicket && (
        <div className="py-8 flex flex-col items-center justify-center gap-4 text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center shadow-md shadow-emerald-200/60">
            <svg className="w-8 h-8 text-emerald-600" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <p className="text-lg font-bold text-navy-900">Ticket Created!</p>
            <p className="text-sm text-navy-500 mt-1">
              Auto-generated from <span className="font-medium text-navy-700">{fileName}</span>
            </p>
            <div className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-navy-900 text-white rounded-xl font-mono text-sm font-bold shadow-md">
              <span className="text-emerald-400">✓</span>
              {createdTicket.ticket_number || createdTicket.ticketNumber}
            </div>
          </div>
          <div className="text-sm text-navy-600 max-w-xs">
            The ticket is now in your queue and the attachment has been stored against it.
          </div>
        </div>
      )}
    </Modal>
  );
}