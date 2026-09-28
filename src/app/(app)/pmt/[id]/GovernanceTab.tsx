"use client";

import React, { useState, useEffect } from "react";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { GovernanceReview, WBSItem } from "@/lib/types";
import { ColorBadge } from "@/components/ui/Badge";
import { DataTable, type Column } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { toDateInput, todayISO } from "@/lib/dates";

interface Props {
  projectId: string;
  reviews: GovernanceReview[];
  wbsTree: WBSItem[];
}

export function GovernanceTab({ projectId, reviews: initialReviews, wbsTree }: Props) {
  const [reviews, setReviews] = useState<GovernanceReview[]>(initialReviews);
  const [timesheets, setTimesheets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingReview, setEditingReview] = useState<GovernanceReview | null>(null);
  const [reviewType, setReviewType] = useState("Stage-Gate 1: Project Charter & Scope Approval");
  const [reviewDate, setReviewDate] = useState(todayISO());
  const [outcome, setOutcome] = useState<string>("pass");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    async function fetchTimesheets() {
      try {
        const res = await fetch(`/api/pmt/projects/${projectId}/timesheets`);
        if (res.ok) {
          setTimesheets((await res.json()).data || []);
        }
      } catch (err) {
        console.error("Failed to fetch timesheets", err);
      } finally {
        setLoading(false);
      }
    }
    fetchTimesheets();
  }, [projectId]);

  const refreshReviews = async () => {
    try {
      const res = await fetch(`/api/pmt/governance?projectId=${projectId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.data?.reviews) {
          setReviews(data.data.reviews.map((r: any) => ({
            id: r.id,
            projectId: r.project_id,
            reviewType: r.review_type,
            reviewDate: r.review_date,
            outcome: r.outcome,
            notes: r.notes,
            createdAt: r.created_at,
          })));
        }
      }
    } catch (err) {
      console.error("Failed to refresh reviews", err);
    }
  };

  const outcomeColor = (outcome?: string) => {
    switch (outcome) {
      case "pass": return "bg-green-100 text-green-700";
      case "conditional_pass": return "bg-amber-100 text-amber-700";
      case "fail": return "bg-red-100 text-red-700";
      default: return "bg-navy-50 text-navy-900";
    }
  };

  const openAddModal = () => {
    setEditingReview(null);
    setReviewType("Stage-Gate 1: Project Charter & Scope Approval");
    setReviewDate(todayISO());
    setOutcome("pass");
    setNotes("");
    setIsModalOpen(true);
  };

  const openEditModal = (r: GovernanceReview) => {
    setEditingReview(r);
    setReviewType(r.reviewType);
    setReviewDate(toDateInput(r.reviewDate) || todayISO());
    setOutcome(r.outcome || "");
    setNotes(r.notes || "");
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (editingReview) {
        const res = await fetch("/api/pmt/governance", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editingReview.id,
            review_type: reviewType,
            review_date: reviewDate,
            outcome: outcome || null,
            notes: notes || null,
          }),
        });
        if (res.ok) {
          setIsModalOpen(false);
          await refreshReviews();
        }
      } else {
        const res = await fetch("/api/pmt/governance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            project_id: projectId,
            review_type: reviewType,
            review_date: reviewDate,
            outcome: outcome || null,
            notes: notes || null,
          }),
        });
        if (res.ok) {
          setIsModalOpen(false);
          await refreshReviews();
        }
      }
    } catch (err: any) {
      alert("Error saving review: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const reviewColumns: Column<GovernanceReview>[] = [
    { key: "reviewType", header: "Review Type", render: (r) => <span className="font-bold">{r.reviewType}</span> },
    { key: "reviewDate", header: "Date", render: (r) => <span className="text-navy-500 tabular-nums">{formatDate(r.reviewDate)}</span> },
    {
      key: "outcome", header: "Outcome",
      render: (r) => r.outcome ? <ColorBadge colorClass={outcomeColor(r.outcome)}>{r.outcome.replace("_", " ").toUpperCase()}</ColorBadge> : <ColorBadge colorClass="bg-blue-50 text-blue-700">SCHEDULED</ColorBadge>,
    },
    { key: "notes", header: "Notes & Action Items", render: (r) => <span className="text-navy-700 text-sm max-w-md line-clamp-2">{r.notes || "—"}</span> },
    {
      key: "actions", header: "Actions",
      render: (r) => (
        <button
          onClick={() => openEditModal(r)}
          className="text-xs text-navy-700 hover:text-navy-900 underline font-medium"
        >
          Edit
        </button>
      ),
      className: "text-right",
    },
  ];

  if (loading) return <div className="p-6 h-64 bg-navy-50 animate-pulse rounded-xl" />;

  return (
    <div className="space-y-8">
      {/* 1. Governance Reviews */}
      <div className="bg-white rounded-xl border border-navy-500/10 shadow-sm overflow-hidden">
        <div className="bg-navy-50/50 px-5 py-4 border-b border-navy-500/10 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-navy-900">Stage-Gate Governance Reviews</h3>
            <p className="text-xs text-navy-500">Formal stage-gate approvals and compliance checks for this project</p>
          </div>
          <Button size="sm" onClick={openAddModal}>
            <svg className="w-4 h-4 mr-1.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            Record Review
          </Button>
        </div>
        <DataTable columns={reviewColumns} data={reviews} emptyMessage="No governance reviews recorded for this project yet." />
      </div>

      {/* 2. Project Execution & Phase-Wise Tracking */}
      <div className="bg-white rounded-xl border border-navy-500/10 shadow-sm overflow-hidden">
        <div className="bg-navy-50/50 px-5 py-4 border-b border-navy-500/10">
          <h3 className="font-bold text-navy-900">Phase-Wise Execution Tracker</h3>
          <p className="text-xs text-navy-500">Deliverables and tracked time grouped by WBS phases</p>
        </div>
        <div className="p-5 space-y-6">
          {wbsTree.map((phase) => {
            const phaseTimesheets = timesheets.filter(t => t.task_description?.toLowerCase().includes(phase.name.toLowerCase()) || timesheets.length > 0);
            const totalHours = phaseTimesheets.reduce((acc, t) => acc + Number(t.hours), 0);

            return (
              <div key={phase.id} className="border border-navy-500/15 rounded-xl overflow-hidden">
                <div className="bg-navy-900 px-5 py-3 flex justify-between items-center text-white">
                  <div>
                    <span className="text-blue-400 font-mono text-xs mr-2">{phase.code}</span>
                    <span className="font-bold">{phase.name}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-white/60 mr-2">Tracked Time:</span>
                    <span className="font-bold text-lg text-blue-400">{totalHours} hrs</span>
                  </div>
                </div>
                
                {/* Child Tasks */}
                <div className="divide-y divide-navy-500/10 bg-white">
                  {phase.children?.map(task => (
                    <div key={task.id} className="px-5 py-3 flex justify-between items-center hover:bg-navy-50/30">
                      <div className="flex items-center gap-3">
                        <span className="text-navy-400 font-mono text-xs">{task.code}</span>
                        <span className="text-navy-900 font-medium text-sm">{task.name}</span>
                      </div>
                      <span className="text-xs font-bold text-navy-500 bg-navy-50 px-2 py-1 rounded">Task</span>
                    </div>
                  ))}
                  {(!phase.children || phase.children.length === 0) && (
                    <div className="px-5 py-3 text-sm text-navy-500 italic">No sub-tasks defined for this phase.</div>
                  )}
                </div>

                {/* Phase specific timesheets preview */}
                {totalHours > 0 && (
                  <div className="bg-navy-50/50 border-t border-navy-500/10 px-5 py-3">
                    <p className="text-xs font-bold text-navy-700 uppercase tracking-wide mb-2">Recent Time Logs</p>
                    <div className="space-y-1">
                      {phaseTimesheets.slice(0, 3).map(t => (
                        <div key={t.id} className="flex justify-between text-xs text-navy-600">
                          <span>{formatDate(t.date_logged)} • {t.user_name}</span>
                          <span className="font-bold">{t.hours}h <span className="font-normal text-navy-400">({t.task_description})</span></span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {wbsTree.length === 0 && <p className="text-center text-navy-500 text-sm py-4">No WBS phases defined yet.</p>}
        </div>
      </div>

      {/* Record Review Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingReview ? "Edit Governance Review" : "Record Stage-Gate Review"}
        footer={
          <div className="flex justify-end gap-2 w-full">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Saving..." : "Save Review"}
            </Button>
          </div>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-navy-700 uppercase tracking-wider mb-1">
              Review Type *
            </label>
            <select
              value={reviewType}
              onChange={(e) => setReviewType(e.target.value)}
              className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-2 bg-white text-navy-900 focus:outline-none focus:ring-2 focus:ring-navy-700/20"
            >
              <option value="Stage-Gate 1: Project Charter & Scope Approval">Stage-Gate 1: Project Charter & Scope Approval</option>
              <option value="Stage-Gate 2: Architecture & Technical Design">Stage-Gate 2: Architecture & Technical Design</option>
              <option value="Stage-Gate 3: Build & Mid-Term Milestone Review">Stage-Gate 3: Build & Mid-Term Milestone Review</option>
              <option value="Stage-Gate 4: UAT Readiness & Pre-Go-Live">Stage-Gate 4: UAT Readiness & Pre-Go-Live</option>
              <option value="Stage-Gate 5: Post-Implementation & Handover">Stage-Gate 5: Post-Implementation & Handover</option>
              <option value="Quarterly Executive Governance Audit">Quarterly Executive Governance Audit</option>
              <option value="Ad-hoc Risk & Escalation Gate">Ad-hoc Risk & Escalation Gate</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-navy-700 uppercase tracking-wider mb-1">
              Review Date *
            </label>
            <input
              type="date"
              value={reviewDate}
              onChange={(e) => setReviewDate(e.target.value)}
              required
              className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-2 text-navy-900 focus:outline-none focus:ring-2 focus:ring-navy-700/20"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-navy-700 uppercase tracking-wider mb-1">
              Gate Outcome
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: "Scheduled", val: "" },
                { label: "Pass", val: "pass" },
                { label: "Conditional", val: "conditional_pass" },
                { label: "Fail", val: "fail" },
              ].map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => setOutcome(opt.val)}
                  className={`py-2 text-xs font-medium rounded-lg border text-center transition-colors ${
                    outcome === opt.val
                      ? "bg-navy-900 text-white border-navy-900"
                      : "bg-white text-navy-800 border-neutral-200 hover:bg-neutral-50"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-navy-700 uppercase tracking-wider mb-1">
              Audit Findings / Steering Committee Notes
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Record approval conditions, risk mitigation items, or meeting sign-off details..."
              className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-2 text-navy-900 focus:outline-none focus:ring-2 focus:ring-navy-700/20"
            />
          </div>
        </form>
      </Modal>
    </div>
  );
}
