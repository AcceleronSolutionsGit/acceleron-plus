"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { Card, StatCard } from "@/components/ui/Card";
import { ColorBadge, Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { formatDate } from "@/lib/utils";
import { PmtHeaderTabs } from "@/components/layout/PmtHeaderTabs";
import { toDateInput, todayISO } from "@/lib/dates";
import { Combobox } from "@/components/ui/Combobox";

interface GovernanceReviewItem {
  id: string;
  project_id: string;
  project_name: string;
  project_code: string;
  client_company_name: string;
  project_status: string;
  review_type: string;
  review_date: string;
  outcome: "pass" | "conditional_pass" | "fail" | null;
  notes: string | null;
  created_at: string;
}

interface GovernanceStats {
  totalReviews: number;
  passedReviews: number;
  conditionalReviews: number;
  failedReviews: number;
  pendingReviews: number;
  complianceRate: number;
}

interface ProjectOption {
  id: string;
  code: string;
  name: string;
  client_company_name?: string;
}

interface Props {
  initialReviews: GovernanceReviewItem[];
  initialStats: GovernanceStats;
  projects: ProjectOption[];
}

export function GovernanceDashboardClient({ initialReviews, initialStats, projects }: Props) {
  const [reviews, setReviews] = useState<GovernanceReviewItem[]>(initialReviews);
  const [stats, setStats] = useState<GovernanceStats>(initialStats);
  const [outcomeFilter, setOutcomeFilter] = useState<string>("all");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingReview, setEditingReview] = useState<GovernanceReviewItem | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Form State
  const [selectedProjectId, setSelectedProjectId] = useState(projects[0]?.id || "");
  const [reviewType, setReviewType] = useState("Stage-Gate 1: Charter & Scope");
  const [reviewDate, setReviewDate] = useState(todayISO());
  const [outcome, setOutcome] = useState<string>("");
  const [notes, setNotes] = useState("");

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const refreshReviews = async () => {
    try {
      const res = await fetch("/api/pmt/governance");
      const data = await res.json();
      if (data.success) {
        setReviews(data.data.reviews);
        setStats(data.data.stats);
      }
    } catch (err) {
      console.error("Failed to refresh governance data", err);
    }
  };

  const filteredReviews = useMemo(() => {
    return reviews.filter((r) => {
      if (outcomeFilter !== "all") {
        if (outcomeFilter === "pending" && r.outcome !== null) return false;
        if (outcomeFilter !== "pending" && r.outcome !== outcomeFilter) return false;
      }
      if (projectFilter !== "all" && r.project_id !== projectFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesType = r.review_type?.toLowerCase().includes(query);
        const matchesProject = r.project_name?.toLowerCase().includes(query) || r.project_code?.toLowerCase().includes(query);
        const matchesNotes = r.notes?.toLowerCase().includes(query);
        if (!matchesType && !matchesProject && !matchesNotes) return false;
      }
      return true;
    });
  }, [reviews, outcomeFilter, projectFilter, searchQuery]);

  const openScheduleModal = () => {
    setEditingReview(null);
    setSelectedProjectId(projects[0]?.id || "");
    setReviewType("Stage-Gate 1: Charter & Scope Approval");
    setReviewDate(todayISO());
    setOutcome("");
    setNotes("");
    setIsModalOpen(true);
  };

  const openEditModal = (review: GovernanceReviewItem) => {
    setEditingReview(review);
    setSelectedProjectId(review.project_id);
    setReviewType(review.review_type);
    setReviewDate(toDateInput(review.review_date));
    setOutcome(review.outcome || "");
    setNotes(review.notes || "");
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      if (editingReview) {
        // PATCH
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
          showToast("Governance review updated successfully");
          setIsModalOpen(false);
          await refreshReviews();
        } else {
          alert("Failed to update review");
        }
      } else {
        // POST
        const res = await fetch("/api/pmt/governance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            project_id: selectedProjectId,
            review_type: reviewType,
            review_date: reviewDate,
            outcome: outcome || null,
            notes: notes || null,
          }),
        });
        if (res.ok) {
          showToast("Stage-Gate review scheduled successfully");
          setIsModalOpen(false);
          await refreshReviews();
        } else {
          alert("Failed to schedule review");
        }
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getOutcomeBadge = (outcome: string | null) => {
    switch (outcome) {
      case "pass":
        return <ColorBadge colorClass="bg-emerald-50 text-emerald-700 border border-emerald-200">PASS</ColorBadge>;
      case "conditional_pass":
        return <ColorBadge colorClass="bg-amber-50 text-amber-700 border border-amber-200">CONDITIONAL</ColorBadge>;
      case "fail":
        return <ColorBadge colorClass="bg-rose-50 text-rose-700 border border-rose-200">FAIL</ColorBadge>;
      default:
        return <ColorBadge colorClass="bg-blue-50 text-blue-700 border border-blue-200">SCHEDULED</ColorBadge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-navy-900 text-white px-5 py-3 rounded-xl shadow-2xl border border-navy-700">
          <svg className="w-5 h-5 text-emerald-400" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          <span className="text-sm font-medium">{toastMessage}</span>
        </div>
      )}

      {/* PMT High-Level Tabs */}
      <PmtHeaderTabs
        title="Stage-Gate Governance Center"
        subtitle="Cross-project audit readiness, stage-gate compliance, and steering committee approvals"
        action={
          <Button onClick={openScheduleModal}>
            <svg className="w-4 h-4 mr-1.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            Schedule Stage-Gate Review
          </Button>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Compliance Rate"
          value={`${stats.complianceRate}%`}
          icon={
            <svg className="w-5 h-5 text-emerald-600" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          }
        />
        <StatCard
          label="Passed Reviews"
          value={stats.passedReviews}
          icon={
            <svg className="w-5 h-5 text-emerald-500" viewBox="0 0 20 20" fill="currentColor">
              <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
              <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm9.707 5.707a1 1 0 00-1.414-1.414L9 12.586l-1.293-1.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          }
        />
        <StatCard
          label="Conditional / Actions"
          value={stats.conditionalReviews}
          icon={
            <svg className="w-5 h-5 text-amber-500" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          }
        />
        <StatCard
          label="Scheduled Upcoming"
          value={stats.pendingReviews}
          icon={
            <svg className="w-5 h-5 text-blue-500" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
            </svg>
          }
        />
      </div>

      {/* Stage-Gate Governance Standard Guideline */}
      <Card padding="md" className="bg-gradient-to-r from-navy-900 to-navy-800 text-white border-none shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span>Enterprise Stage-Gate Lifecycle</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-200 border border-blue-400/30">
                PMP & ISO 9001
              </span>
            </h3>
            <p className="text-xs text-navy-200 max-w-2xl">
              All active projects must pass through mandatory formal gates: Gate 1 (Scope Baseline), Gate 2 (Architecture Sign-off), Gate 3 (Mid-term Build Audit), Gate 4 (UAT & Pre-Go-Live), and Gate 5 (Post-Implementation Review).
            </p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="text-right">
              <span className="text-xs text-navy-300 block">Total Governed Projects</span>
              <span className="text-lg font-bold text-white">{projects.length} Active</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-navy-500/15 shadow-sm flex flex-col md:flex-row items-center gap-4 justify-between">
        <div className="flex items-center gap-3 flex-wrap w-full md:w-auto">
          <input
            type="text"
            placeholder="Search by review type, project, or notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="text-sm px-3.5 py-1.5 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-700/20 w-64"
          />

          <Combobox
            className="min-w-[180px]"
            value={outcomeFilter}
            onChange={setOutcomeFilter}
            placeholder="All Outcomes"
            searchPlaceholder="Search outcomes…"
            options={[
              { value: "all", label: "All Outcomes" },
              { value: "pass", label: "Passed" },
              { value: "conditional_pass", label: "Conditional Pass" },
              { value: "fail", label: "Failed" },
              { value: "pending", label: "Scheduled / Pending" },
            ]}
          />

          <Combobox
            className="min-w-[240px]"
            value={projectFilter}
            onChange={setProjectFilter}
            placeholder="All Projects"
            searchPlaceholder="Search by code, name or client…"
            options={[
              { value: "all", label: "All Projects" },
              ...projects.map((pr) => ({
                value: pr.id,
                label: `${pr.code} — ${pr.name}`,
                hint: pr.client_company_name ?? undefined,
              })),
            ]}
          />

          {(outcomeFilter !== "all" || projectFilter !== "all" || searchQuery) && (
            <button
              onClick={() => { setOutcomeFilter("all"); setProjectFilter("all"); setSearchQuery(""); }}
              className="text-xs text-navy-500 hover:text-navy-800 underline cursor-pointer"
            >
              Reset filters
            </button>
          )}
        </div>

        <span className="text-xs text-navy-500 self-end md:self-center">
          Showing {filteredReviews.length} of {reviews.length} reviews
        </span>
      </div>

      {/* Governance Reviews Table */}
      <Card padding="none" className="overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-navy-900">
            <thead className="bg-neutral-50/75 text-xs uppercase font-semibold text-navy-500 border-b border-neutral-100">
              <tr>
                <th className="px-5 py-3">Project</th>
                <th className="px-5 py-3">Review Type & Stage-Gate</th>
                <th className="px-5 py-3">Review Date</th>
                <th className="px-5 py-3">Outcome</th>
                <th className="px-5 py-3">Audit Findings & Notes</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filteredReviews.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-navy-400">
                    No governance reviews match your criteria.
                  </td>
                </tr>
              ) : (
                filteredReviews.map((r) => (
                  <tr key={r.id} className="hover:bg-neutral-50/60 transition-colors">
                    <td className="px-5 py-4">
                      <Link
                        href={`/pmt/${r.project_code || r.project_id}`}
                        className="font-medium text-navy-900 hover:text-blue-600 transition-colors block"
                      >
                        {r.project_name}
                      </Link>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-navy-500">
                        <span className="font-mono">{r.project_code}</span>
                        {r.client_company_name && (
                          <>
                            <span>•</span>
                            <span>{r.client_company_name}</span>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className="font-semibold text-navy-800">{r.review_type}</span>
                    </td>
                    <td className="px-5 py-4 tabular-nums text-navy-600 whitespace-nowrap">
                      {formatDate(r.review_date)}
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      {getOutcomeBadge(r.outcome)}
                    </td>
                    <td className="px-5 py-4 max-w-md">
                      <p className="text-xs text-navy-700 line-clamp-2">
                        {r.notes || <span className="text-navy-400 italic">No notes recorded</span>}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-right whitespace-nowrap">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditModal(r)}
                        className="text-xs text-navy-700 hover:text-navy-900"
                      >
                        Record / Edit
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Schedule / Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingReview ? "Record Governance Review" : "Schedule Stage-Gate Review"}
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
              {isSubmitting ? "Saving..." : editingReview ? "Update Review" : "Schedule Review"}
            </Button>
          </div>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-navy-700 uppercase tracking-wider mb-1">
              Select Project *
            </label>
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              disabled={!!editingReview}
              className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-2 bg-white text-navy-900 focus:outline-none focus:ring-2 focus:ring-navy-700/20 disabled:bg-neutral-100"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} - {p.name} ({p.client_company_name || "Client"})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-navy-700 uppercase tracking-wider mb-1">
              Stage-Gate Review Type *
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
