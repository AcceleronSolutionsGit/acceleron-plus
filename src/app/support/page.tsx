"use client";

import React, { useState } from "react";

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  open:        { label: "Open",        color: "bg-blue-100 text-blue-800 border-blue-200",     icon: "🔵" },
  in_progress: { label: "In Progress", color: "bg-amber-100 text-amber-800 border-amber-200",  icon: "🟡" },
  pending:     { label: "Pending",     color: "bg-purple-100 text-purple-800 border-purple-200", icon: "🟣" },
  resolved:    { label: "Resolved",    color: "bg-green-100 text-green-800 border-green-200",  icon: "🟢" },
  closed:      { label: "Closed",      color: "bg-gray-100 text-gray-700 border-gray-200",     icon: "⚪" },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  low:    { label: "Low",    color: "bg-slate-100 text-slate-700" },
  medium: { label: "Medium", color: "bg-amber-100 text-amber-700" },
  high:   { label: "High",   color: "bg-orange-100 text-orange-700" },
  urgent: { label: "Urgent", color: "bg-red-100 text-red-700" },
};

function formatDate(d: string) {
  return new Date(d).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

type View = "home" | "submit" | "track";

interface TrackedTicket {
  ticketNumber: string;
  subject: string;
  description?: string;
  status: string;
  priority: string;
  ticketType: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  resolution?: string;
  agentName?: string | null;
  attachments?: {
    id: string;
    fileName: string;
    mimeType: string;
    fileSizeBytes: number;
    downloadUrl: string;
  }[];
}

export default function SupportPortal() {
  const [view, setView] = useState<View>("home");

  // Submit state
  const [form, setForm] = useState({ name: "", email: "", subject: "", description: "", priority: "medium", ticketType: "service_request" });
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<{ ticketNumber: string; message: string } | null>(null);
  const [submitError, setSubmitError] = useState("");

  // Track state
  const [trackId, setTrackId] = useState("");
  const [tracking, setTracking] = useState(false);
  const [trackedTicket, setTrackedTicket] = useState<TrackedTicket | null>(null);
  const [trackError, setTrackError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError("");
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      files.forEach((f) => fd.append("attachments", f));
      const res = await fetch("/api/portal/tickets", { method: "POST", body: fd });
      const data = await res.json();
      if (res.ok && data.success) {
        setSubmitted({ ticketNumber: data.ticketNumber, message: data.message });
        setForm({ name: "", email: "", subject: "", description: "", priority: "medium", ticketType: "service_request" });
        setFiles([]);
      } else {
        setSubmitError(data.error || "Submission failed. Please try again.");
      }
    } catch {
      setSubmitError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackId.trim()) return;
    setTracking(true);
    setTrackError("");
    setTrackedTicket(null);
    try {
      const res = await fetch(`/api/portal/tickets/${trackId.trim().toUpperCase()}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setTrackedTicket(data.ticket);
      } else {
        setTrackError(data.error || "Ticket not found.");
      }
    } catch {
      setTrackError("Network error. Please try again.");
    } finally {
      setTracking(false);
    }
  };

  const statusInfo = trackedTicket ? (STATUS_CONFIG[trackedTicket.status] || { label: trackedTicket.status, color: "bg-gray-100 text-gray-700 border-gray-200", icon: "⚪" }) : null;
  const priorityInfo = trackedTicket ? (PRIORITY_CONFIG[trackedTicket.priority] || { label: trackedTicket.priority, color: "bg-gray-100 text-gray-700" }) : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white font-sans">
      {/* Floating background orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-48 -left-48 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute top-1/2 -right-48 w-80 h-80 bg-indigo-600/20 rounded-full blur-3xl animate-pulse delay-1000" />
        <div className="absolute bottom-0 left-1/2 w-96 h-96 bg-cyan-600/10 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 max-w-3xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-4 py-1.5 text-xs text-blue-300 font-medium mb-5 backdrop-blur-sm">
            <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" />
            Support Portal — Available 24/7
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4 bg-gradient-to-r from-white via-blue-100 to-cyan-200 bg-clip-text text-transparent">
            How can we help?
          </h1>
          <p className="text-slate-400 text-lg">Submit a ticket or track an existing request — no account needed.</p>
        </div>

        {/* Nav Tabs */}
        <div className="flex flex-col sm:flex-row gap-2 bg-white/5 border border-white/10 rounded-2xl p-1.5 mb-8 backdrop-blur-sm">
          {[
            { id: "home",   label: "🏠 Home" },
            { id: "submit", label: "✉️ Submit Ticket" },
            { id: "track",  label: "🔍 Track Ticket" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => { setView(tab.id as View); setSubmitted(null); setTrackedTicket(null); }}
              className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-semibold transition-all duration-200 ${
                view === tab.id
                  ? "bg-white text-slate-900 shadow-lg"
                  : "text-slate-400 hover:text-white hover:bg-white/10"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Home view */}
        {view === "home" && (
          <div className="grid md:grid-cols-2 gap-4">
            <button
              onClick={() => setView("submit")}
              className="group bg-white/5 hover:bg-blue-500/10 border border-white/10 hover:border-blue-500/30 rounded-2xl p-6 text-left transition-all duration-200 backdrop-blur-sm"
            >
              <div className="text-4xl mb-4">✉️</div>
              <h2 className="text-lg font-bold text-white mb-2">Submit a New Ticket</h2>
              <p className="text-slate-400 text-sm leading-relaxed">Report an issue, request a service, or raise a change — we will get back to you promptly.</p>
              <div className="mt-4 text-blue-400 text-sm font-semibold group-hover:text-blue-300 transition-colors">Get started →</div>
            </button>
            <button
              onClick={() => setView("track")}
              className="group bg-white/5 hover:bg-indigo-500/10 border border-white/10 hover:border-indigo-500/30 rounded-2xl p-6 text-left transition-all duration-200 backdrop-blur-sm"
            >
              <div className="text-4xl mb-4">🔍</div>
              <h2 className="text-lg font-bold text-white mb-2">Track Your Ticket</h2>
              <p className="text-slate-400 text-sm leading-relaxed">Use your ticket number (e.g. TKT-2026-AB12CD) to check the status and any updates.</p>
              <div className="mt-4 text-indigo-400 text-sm font-semibold group-hover:text-indigo-300 transition-colors">Track now →</div>
            </button>
          </div>
        )}

        {/* Submit view */}
        {view === "submit" && (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-8 backdrop-blur-sm">
            {submitted ? (
              <div className="text-center py-8 space-y-4">
                <div className="text-6xl">🎉</div>
                <h2 className="text-2xl font-bold text-white">Ticket Submitted!</h2>
                <p className="text-slate-400">{submitted.message}</p>
                <div className="inline-block bg-blue-500/10 border border-blue-500/20 rounded-xl px-6 py-3">
                  <p className="text-xs text-blue-300 mb-1">Your Ticket Number</p>
                  <p className="text-2xl font-mono font-bold text-white">{submitted.ticketNumber}</p>
                </div>
                <div className="flex gap-3 justify-center mt-6">
                  <button onClick={() => { setSubmitted(null); setTrackId(submitted.ticketNumber); setView("track"); }} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-semibold transition-colors">Track This Ticket</button>
                  <button onClick={() => setSubmitted(null)} className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-semibold transition-colors">Submit Another</button>
                </div>
              </div>
            ) : (
              <>
                <h2 className="text-xl font-bold text-white mb-6">Submit a Support Request</h2>
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wide">Full Name *</label>
                      <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                        className="w-full bg-white/10 border border-white/15 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                        placeholder="John Smith" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wide">Email Address *</label>
                      <input required type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                        className="w-full bg-white/10 border border-white/15 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                        placeholder="john@company.com" />
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wide">Request Type</label>
                      <select value={form.ticketType} onChange={e => setForm({ ...form, ticketType: e.target.value })}
                        className="w-full bg-white/10 border border-white/15 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all [&>option]:bg-slate-800">
                        <option value="service_request">Service Request</option>
                        <option value="incident">Incident / Bug</option>
                        <option value="change_request">Change Request</option>
                        <option value="question">General Question</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wide">Priority</label>
                      <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}
                        className="w-full bg-white/10 border border-white/15 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all [&>option]:bg-slate-800">
                        <option value="low">Low — No immediate impact</option>
                        <option value="medium">Medium — Workaround available</option>
                        <option value="high">High — Affecting multiple users</option>
                        <option value="urgent">Urgent — System down</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wide">Subject *</label>
                    <input required value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })}
                      className="w-full bg-white/10 border border-white/15 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                      placeholder="Brief summary of the issue or request" />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wide">Description</label>
                    <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={4}
                      className="w-full bg-white/10 border border-white/15 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all resize-none"
                      placeholder="Describe the issue in detail — steps to reproduce, expected vs actual outcome, affected users, etc." />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wide">Attachments <span className="normal-case text-slate-500 font-normal">(optional)</span></label>
                    <label className="flex flex-col items-center gap-2 border-2 border-dashed border-white/15 hover:border-blue-500/40 rounded-xl px-4 py-5 cursor-pointer transition-all group">
                      <input type="file" multiple className="sr-only"
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.png,.jpg,.jpeg,.webp,.zip"
                        onChange={e => {
                          const picked = Array.from(e.target.files ?? []);
                          setFiles(prev => {
                            const names = new Set(prev.map(f => f.name));
                            return [...prev, ...picked.filter(f => !names.has(f.name))];
                          });
                          e.target.value = "";
                        }}
                      />
                      <span className="text-2xl group-hover:scale-110 transition-transform">📎</span>
                      <p className="text-xs text-slate-400 text-center">Click to attach files <span className="text-slate-600">(PDF, Word, Excel, images — max 50 MB each)</span></p>
                    </label>
                    {files.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {files.map((f, i) => (
                          <li key={i} className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-1.5 text-xs text-slate-300">
                            <span className="truncate max-w-[220px]">📄 {f.name}</span>
                            <span className="text-slate-500 mx-2 shrink-0">{(f.size / 1024).toFixed(0)} KB</span>
                            <button type="button" onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-300 ml-1 shrink-0">✕</button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {submitError && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-300">{submitError}</div>
                  )}

                  <button type="submit" disabled={submitting}
                    className="w-full py-3 px-6 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed rounded-xl font-semibold text-sm transition-all duration-200 shadow-lg shadow-blue-500/20">
                    {submitting ? "Submitting..." : "Submit Request →"}
                  </button>
                </form>
              </>
            )}
          </div>
        )}

        {/* Track view */}
        {view === "track" && (
          <div className="space-y-4">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-8 backdrop-blur-sm">
              <h2 className="text-xl font-bold text-white mb-2">Track Your Ticket</h2>
              <p className="text-slate-400 text-sm mb-6">Enter the ticket number you received when you submitted your request.</p>
              <form onSubmit={handleTrack} className="flex gap-3">
                <input
                  value={trackId}
                  onChange={e => setTrackId(e.target.value.toUpperCase())}
                  className="flex-1 bg-white/10 border border-white/15 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all uppercase"
                  placeholder="TKT-2026-AB12CD"
                />
                <button type="submit" disabled={tracking || !trackId.trim()}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 rounded-xl font-semibold text-sm transition-all">
                  {tracking ? "..." : "Track"}
                </button>
              </form>
              {trackError && (
                <div className="mt-4 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-300">{trackError}</div>
              )}
            </div>

            {trackedTicket && statusInfo && priorityInfo && (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-8 backdrop-blur-sm space-y-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <p className="text-xs text-slate-400 mb-1 font-mono">{trackedTicket.ticketNumber}</p>
                    <h3 className="text-lg font-bold text-white">{trackedTicket.subject}</h3>
                  </div>
                  <span className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${statusInfo.color}`}>
                    {statusInfo.icon} {statusInfo.label}
                  </span>
                </div>

                {trackedTicket.description && (
                  <p className="text-sm text-slate-300 leading-relaxed border-l-2 border-blue-500/40 pl-4">{trackedTicket.description}</p>
                )}

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs">
                  <div className="bg-white/5 rounded-xl p-3">
                    <p className="text-slate-400 mb-1">Priority</p>
                    <span className={`font-semibold px-2 py-0.5 rounded ${priorityInfo.color}`}>{priorityInfo.label}</span>
                  </div>
                  <div className="bg-white/5 rounded-xl p-3">
                    <p className="text-slate-400 mb-1">Submitted</p>
                    <p className="text-white font-medium">{formatDate(trackedTicket.createdAt)}</p>
                  </div>
                  {trackedTicket.resolvedAt && (
                    <div className="bg-white/5 rounded-xl p-3">
                      <p className="text-slate-400 mb-1">Resolved On</p>
                      <p className="text-green-300 font-medium">{formatDate(trackedTicket.resolvedAt)}</p>
                    </div>
                  )}
                  {trackedTicket.agentName && (
                    <div className="bg-white/5 rounded-xl p-3">
                      <p className="text-slate-400 mb-1">Assigned To</p>
                      <p className="text-blue-300 font-medium">{trackedTicket.agentName}</p>
                    </div>
                  )}
                </div>

                {trackedTicket.resolution && (
                  <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-4">
                    <p className="text-xs font-semibold text-green-400 mb-1.5 uppercase tracking-wide">Resolution</p>
                    <p className="text-sm text-slate-200 leading-relaxed">{trackedTicket.resolution}</p>
                  </div>
                )}

                {/* Attachments */}
                {trackedTicket.attachments && trackedTicket.attachments.length > 0 && (
                  <div className="border-t border-white/10 pt-4">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">📎 Attachments</p>
                    <div className="space-y-2">
                      {trackedTicket.attachments.map((att) => {
                        const isPreviewable = ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif", "text/plain"].includes(att.mimeType);
                        return (
                          <div key={att.id} className="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl px-4 py-2.5">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-lg shrink-0">
                                {att.mimeType.startsWith("image/") ? "🖼️" : att.mimeType === "application/pdf" ? "📑" : "📄"}
                              </span>
                              <div className="min-w-0">
                                <p className="text-xs text-slate-200 font-medium truncate">{att.fileName}</p>
                                <p className="text-[10px] text-slate-500">{(att.fileSizeBytes / 1024).toFixed(0)} KB</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 ml-3">
                              {isPreviewable && (
                                <a
                                  href={att.downloadUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-blue-300 rounded-lg transition-colors"
                                >
                                  👁 View
                                </a>
                              )}
                              <a
                                href={att.downloadUrl}
                                download={att.fileName}
                                className="text-xs px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 rounded-lg transition-colors"
                              >
                                ⬇ Download
                              </a>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Timeline */}
                <div className="border-t border-white/10 pt-4">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Timeline</p>
                  <div className="space-y-3">
                    <TimelineEvent icon="📥" label="Ticket Submitted" date={trackedTicket.createdAt} active />
                    {(trackedTicket.status === "in_progress" || trackedTicket.status === "resolved" || trackedTicket.status === "closed") && (
                      <TimelineEvent icon="🔧" label="Being Worked On" date={trackedTicket.updatedAt} active />
                    )}
                    {(trackedTicket.status === "resolved" || trackedTicket.status === "closed") && trackedTicket.resolvedAt && (
                      <TimelineEvent icon="✅" label="Resolved" date={trackedTicket.resolvedAt} active />
                    )}
                    {trackedTicket.status === "closed" && (
                      <TimelineEvent icon="🔒" label="Closed" date={trackedTicket.updatedAt} active />
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="text-center mt-12 text-slate-600 text-xs">
          Powered by Acceleron Plus — Enterprise Service Management
        </div>
      </div>
    </div>
  );
}

function TimelineEvent({ icon, label, date, active }: { icon: string; label: string; date: string; active: boolean }) {
  return (
    <div className={`flex items-center gap-3 text-xs ${active ? "text-slate-200" : "text-slate-600"}`}>
      <span className="text-base w-6 text-center">{icon}</span>
      <span className="font-medium">{label}</span>
      <span className="text-slate-500 ml-auto">{formatDate(date)}</span>
    </div>
  );
}


