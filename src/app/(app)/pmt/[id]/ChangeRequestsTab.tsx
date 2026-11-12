"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { formatCurrency, formatStatus, cn } from "@/lib/utils";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Textarea, Select } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { withBase } from "@/lib/base-path";

export interface ChangeRequestItem {
  id: string;
  projectId: string;
  tenantId: string;
  crNumber: string;
  title: string;
  description: string | null;
  status: "approved" | "requested" | "in_progress" | "completed" | "rejected" | "draft";
  orderValueInr: number;
  plannedHours: number;
  actualHours: number;
  poNumber: string | null;
  documentId: string | null;
  documentName: string | null;
  documentUrl: string | null;
  documentStoredName: string | null;
  documentSizeBytes: number | null;
  documentMimeType: string | null;
  createdByUserId: string | null;
  createdByName: string | null;
  approvedByUserId: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChangeRequestsSummary {
  initialOrderValueInr: number;
  crOrderValueInr: number;
  totalOrderValueInr: number;
  totalPlannedHours: number;
  totalActualHours: number;
  varianceHours: number;
  hoursBurnPercent: number;
  count: number;
  approvedCount: number;
}

interface ChangeRequestsTabProps {
  projectId: string;
  projectCode: string;
  canManage: boolean;
  currency?: string;
  onOrderValueUpdated?: (newOrderValue: number, newCrValue?: number, initialValue?: number) => void;
}

export function ChangeRequestsTab({
  projectId,
  projectCode,
  canManage,
  currency = "INR",
  onOrderValueUpdated,
}: ChangeRequestsTabProps) {
  const [items, setItems] = useState<ChangeRequestItem[]>([]);
  const [summary, setSummary] = useState<ChangeRequestsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    title: "",
    crNumber: "",
    orderValueInr: "",
    plannedHours: "",
    poNumber: "",
    status: "approved",
    description: "",
  });

  // Fetch change requests
  const loadChangeRequests = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const res = await fetch(withBase(`/api/pmt/projects/${projectId}/change-requests`));
      if (!res.ok) {
        throw new Error(`Failed to load change requests (HTTP ${res.status})`);
      }
      const data = await res.json();
      setItems(data.changeRequests || []);
      setSummary(data.summary || null);
      if (data.summary && onOrderValueUpdated) {
        onOrderValueUpdated(
          data.summary.totalOrderValueInr,
          data.summary.crOrderValueInr,
          data.summary.initialOrderValueInr
        );
      }
    } catch (err: any) {
      console.error("loadChangeRequests error:", err);
      setError(err.message || "Failed to load change requests.");
    } finally {
      setLoading(false);
    }
  }, [projectId, onOrderValueUpdated]);

  useEffect(() => {
    loadChangeRequests();
  }, [loadChangeRequests]);

  // Open modal with clean defaults
  const handleOpenAddModal = () => {
    const nextSeq = (items.length + 1).toString().padStart(3, "0");
    setForm({
      title: "",
      crNumber: `CR-${projectCode || "PRJ"}-${nextSeq}`,
      orderValueInr: "",
      plannedHours: "",
      poNumber: "",
      status: "approved",
      description: "",
    });
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setError("");
    setIsModalOpen(true);
  };

  // Submit new Change Request
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      setError("Please enter a title for the Change Request.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("title", form.title.trim());
      formData.append("crNumber", form.crNumber.trim());
      formData.append("orderValueInr", form.orderValueInr.trim() || "0");
      formData.append("plannedHours", form.plannedHours.trim() || "0");
      formData.append("poNumber", form.poNumber.trim());
      formData.append("status", form.status);
      formData.append("description", form.description.trim());

      if (selectedFile) {
        formData.append("file", selectedFile);
      }

      const res = await fetch(withBase(`/api/pmt/projects/${projectId}/change-requests`), {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create Change Request");
      }

      setNotice("Change Request added successfully! Project order value updated.");
      setTimeout(() => setNotice(""), 4000);
      setIsModalOpen(false);
      await loadChangeRequests();
    } catch (err: any) {
      console.error("handleSubmit error:", err);
      setError(err.message || "Failed to submit Change Request");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Status badge styling helper
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "in_progress":
        return "bg-blue-50 text-blue-700 border-blue-200";
      case "completed":
        return "bg-purple-50 text-purple-700 border-purple-200";
      case "requested":
        return "bg-amber-50 text-amber-700 border-amber-200";
      case "rejected":
        return "bg-rose-50 text-rose-700 border-rose-200";
      default:
        return "bg-neutral-50 text-neutral-600 border-neutral-200";
    }
  };

  // Handle status update
  const handleUpdateStatus = async (crId: string, newStatus: string) => {
    try {
      const res = await fetch(withBase(`/api/pmt/projects/${projectId}/change-requests/${crId}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed to update status");
      }
      setNotice("Status updated and order value reconciled.");
      setTimeout(() => setNotice(""), 3000);
      await loadChangeRequests();
    } catch (err: any) {
      setError(err.message || "Failed to update status.");
    }
  };

  // Handle delete
  const handleDelete = async (crId: string, crNum: string) => {
    if (!confirm(`Are you sure you want to delete change request ${crNum}? This will adjust the project order value.`)) {
      return;
    }
    try {
      const res = await fetch(withBase(`/api/pmt/projects/${projectId}/change-requests/${crId}`), {
        method: "DELETE",
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed to delete change request");
      }
      setNotice(`Change request ${crNum} deleted and order value updated.`);
      setTimeout(() => setNotice(""), 3000);
      await loadChangeRequests();
    } catch (err: any) {
      setError(err.message || "Failed to delete change request.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Alert Notices */}
      {error && (
        <div className="flex items-center justify-between rounded-xl bg-rose-50 border border-rose-200 p-4 text-sm text-rose-800">
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
          <button onClick={() => setError("")} className="text-rose-500 hover:text-rose-700">✕</button>
        </div>
      )}

      {notice && (
        <div className="flex items-center justify-between rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-800">
          <div className="flex items-center gap-2">
            <span>✓</span>
            <span>{notice}</span>
          </div>
          <button onClick={() => setNotice("")} className="text-emerald-500 hover:text-emerald-700">✕</button>
        </div>
      )}

      {/* ── 1. Order Value Reconciliation & Hours Tracking Banner ── */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Initial Order Value */}
          <Card className="p-4 border border-navy-900/10 bg-white">
            <span className="text-[11px] font-bold text-navy-500 uppercase tracking-wider">
              Initial Order Value
            </span>
            <p className="text-2xl font-bold text-navy-900 mt-1">
              {formatCurrency(summary.initialOrderValueInr, currency)}
            </p>
            <p className="text-[11px] text-navy-400 mt-1">
              Baseline Contract / SOW Scope
            </p>
          </Card>

          {/* Card 2: CR Order Value */}
          <Card className="p-4 border border-blue-500/20 bg-blue-50/40">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-blue-800 uppercase tracking-wider">
                Change Value (CR)
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">
                +{summary.approvedCount} CR{summary.approvedCount === 1 ? "" : "s"}
              </span>
            </div>
            <p className="text-2xl font-bold text-blue-700 mt-1">
              +{formatCurrency(summary.crOrderValueInr, currency)}
            </p>
            <p className="text-[11px] text-blue-600 mt-1">
              Approved change value additions
            </p>
          </Card>

          {/* Card 3: Total Revised Order Value */}
          <Card className="p-4 border-2 border-emerald-500/30 bg-emerald-50/30">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">
                Total Order Value
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-200 text-emerald-900">
                Reconciled
              </span>
            </div>
            <p className="text-2xl font-bold text-emerald-800 mt-1">
              {formatCurrency(summary.totalOrderValueInr, currency)}
            </p>
            <p className="text-[11px] text-emerald-700 mt-1 font-medium">
              Breakdown: Initial ({formatCurrency(summary.initialOrderValueInr, currency)}) + Change Value ({formatCurrency(summary.crOrderValueInr, currency)})
            </p>
          </Card>

          {/* Card 4: Hours Tracking Against CRs */}
          <Card className="p-4 border border-indigo-500/20 bg-indigo-50/30">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-indigo-800 uppercase tracking-wider">
                CR Planned vs Actual Hours
              </span>
              <span className="text-[10px] font-semibold text-indigo-700">
                {summary.hoursBurnPercent}% Burn
              </span>
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-indigo-900">
                {summary.totalActualHours}
              </span>
              <span className="text-xs text-indigo-600">
                / {summary.totalPlannedHours} hrs planned
              </span>
            </div>
            <div className="w-full bg-indigo-100 rounded-full h-1.5 mt-2 overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  summary.hoursBurnPercent > 100
                    ? "bg-rose-500"
                    : summary.hoursBurnPercent >= 80
                    ? "bg-amber-500"
                    : "bg-indigo-600"
                )}
                style={{ width: `${Math.min(100, summary.hoursBurnPercent)}%` }}
              />
            </div>
          </Card>
        </div>
      )}

      {/* ── 2. Header & Action Row ── */}
      <div className="bg-white rounded-xl border border-navy-500/10 p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-navy-900">
                Project Change Requests (CR)
              </h2>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-neutral-100 text-navy-700">
                {items.length} Record{items.length === 1 ? "" : "s"}
              </span>
            </div>
            <p className="text-xs text-navy-600 mt-1">
              Add change requests with PO / doc upload, planned hours, and order value. Track actuals against planned hours and automatically update project order value.
            </p>
          </div>

          {canManage && (
            <Button
              variant="primary"
              size="sm"
              onClick={handleOpenAddModal}
              className="shrink-0"
            >
              <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Change Request
            </Button>
          )}
        </div>
      </div>

      {/* ── 3. Change Requests Table ── */}
      <Card className="overflow-hidden border border-navy-500/10 shadow-sm bg-white">
        {loading ? (
          <div className="p-12 text-center text-sm text-navy-500">
            Loading Change Requests...
          </div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="mx-auto w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-xl">
              📝
            </div>
            <h3 className="text-base font-bold text-navy-900">No Change Requests Added Yet</h3>
            <p className="text-xs text-navy-500 max-w-md mx-auto">
              Add a change request to record customer scope extensions, attach signed POs or contracts, estimate planned hours, and update the project order value.
            </p>
            {canManage && (
              <Button variant="primary" size="sm" onClick={handleOpenAddModal} className="mt-2">
                + Add First Change Request
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-navy-50/70 border-b border-navy-500/10 text-[11px] font-bold text-navy-700 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">CR #</th>
                  <th className="py-3 px-4">Title & Description</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Order Value</th>
                  <th className="py-3 px-4">Planned vs Actual Hours</th>
                  <th className="py-3 px-4">PO / Document</th>
                  <th className="py-3 px-4">Date Added</th>
                  {canManage && <th className="py-3 px-4 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-500/5">
                {items.map((cr) => {
                  const burnPct = cr.plannedHours > 0 ? Math.round((cr.actualHours / cr.plannedHours) * 100) : 0;
                  return (
                    <tr key={cr.id} className="hover:bg-neutral-50/60 transition-colors">
                      {/* CR Number */}
                      <td className="py-3.5 px-4 font-mono font-bold text-xs text-navy-900 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded bg-navy-100 text-navy-800 border border-navy-200">
                          {cr.crNumber}
                        </span>
                      </td>

                      {/* Title & Description */}
                      <td className="py-3.5 px-4 max-w-xs">
                        <p className="font-semibold text-navy-900 truncate" title={cr.title}>
                          {cr.title}
                        </p>
                        {cr.description && (
                          <p className="text-xs text-navy-500 truncate mt-0.5" title={cr.description}>
                            {cr.description}
                          </p>
                        )}
                        {cr.poNumber && (
                          <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-mono font-medium text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                            PO: {cr.poNumber}
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {canManage ? (
                          <select
                            value={cr.status}
                            onChange={(e) => handleUpdateStatus(cr.id, e.target.value)}
                            className={cn(
                              "text-xs font-semibold px-2.5 py-1 rounded-full border cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors",
                              getStatusBadge(cr.status)
                            )}
                          >
                            <option value="approved">Approved</option>
                            <option value="in_progress">In Progress</option>
                            <option value="completed">Completed</option>
                            <option value="requested">Requested</option>
                            <option value="rejected">Rejected</option>
                            <option value="draft">Draft</option>
                          </select>
                        ) : (
                          <span
                            className={cn(
                              "text-xs font-semibold px-2.5 py-0.5 rounded-full border inline-block",
                              getStatusBadge(cr.status)
                            )}
                          >
                            {formatStatus(cr.status)}
                          </span>
                        )}
                      </td>

                      {/* Order Value */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="font-bold text-navy-900 text-sm">
                          {formatCurrency(cr.orderValueInr, currency)}
                        </span>
                        {cr.status !== "rejected" && cr.status !== "draft" && (
                          <span className="block text-[10px] text-emerald-600 font-medium">
                            Added to Project Order Value
                          </span>
                        )}
                      </td>

                      {/* Planned vs Actual Hours */}
                      <td className="py-3.5 px-4 min-w-[140px]">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-navy-800">
                            {cr.actualHours} / {cr.plannedHours} hrs
                          </span>
                          <span
                            className={cn(
                              "text-[10px] font-bold",
                              burnPct > 100
                                ? "text-rose-600"
                                : burnPct >= 80
                                ? "text-amber-600"
                                : "text-emerald-600"
                            )}
                          >
                            {burnPct}%
                          </span>
                        </div>
                        <div className="w-full bg-neutral-100 rounded-full h-1.5 mt-1.5 overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all",
                              burnPct > 100
                                ? "bg-rose-500"
                                : burnPct >= 80
                                ? "bg-amber-500"
                                : "bg-emerald-500"
                            )}
                            style={{ width: `${Math.min(100, burnPct)}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-navy-400 mt-0.5 block">
                          {cr.plannedHours - cr.actualHours >= 0
                            ? `${(cr.plannedHours - cr.actualHours).toFixed(1)} hrs remaining`
                            : `${Math.abs(cr.plannedHours - cr.actualHours).toFixed(1)} hrs over plan`}
                        </span>
                      </td>

                      {/* PO / Document Download */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {cr.documentId || cr.documentUrl ? (
                          <a
                            href={withBase(cr.documentUrl || `/api/documents/${cr.documentId}/download`)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors shadow-2xs"
                            title={`Download ${cr.documentName || "Document"}`}
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <span className="max-w-[120px] truncate">{cr.documentName || "Download PO"}</span>
                          </a>
                        ) : cr.poNumber ? (
                          <span className="text-xs text-navy-500 font-mono">PO: {cr.poNumber}</span>
                        ) : (
                          <span className="text-xs text-neutral-400 italic">No doc attached</span>
                        )}
                      </td>

                      {/* Date */}
                      <td className="py-3.5 px-4 text-xs text-navy-500 whitespace-nowrap">
                        {new Date(cr.createdAt).toLocaleDateString()}
                        {cr.createdByName && (
                          <span className="block text-[10px] text-navy-400">by {cr.createdByName}</span>
                        )}
                      </td>

                      {/* Actions */}
                      {canManage && (
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleDelete(cr.id, cr.crNumber)}
                            className="text-xs text-rose-500 hover:text-rose-700 font-medium px-2 py-1 rounded hover:bg-rose-50 transition-colors"
                            title="Delete change request"
                          >
                            Delete
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── 4. Add Change Request Modal ── */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Add Change Request (CR) to Project"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-xs text-navy-600">
            Record a change request with its billable order value, estimated hours, and supporting PO/document. Once approved, the project&apos;s total order value updates immediately.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-navy-700 mb-1">
                CR Title / Subject <span className="text-rose-500">*</span>
              </label>
              <Input
                placeholder="e.g. Additional Mobile App Module"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-navy-700 mb-1">
                CR Number
              </label>
              <Input
                placeholder="e.g. CR-PRJ-001"
                value={form.crNumber}
                onChange={(e) => setForm({ ...form, crNumber: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-navy-700 mb-1">
                Order Value (INR ₹) <span className="text-rose-500">*</span>
              </label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="e.g. 250000"
                value={form.orderValueInr}
                onChange={(e) => setForm({ ...form, orderValueInr: e.target.value })}
                required
              />
              <span className="text-[10.5px] text-navy-500 mt-0.5 block">
                Billable contract increase for this change order
              </span>
            </div>

            <div>
              <label className="block text-xs font-bold text-navy-700 mb-1">
                Planned Delivery Hours <span className="text-rose-500">*</span>
              </label>
              <Input
                type="number"
                min="0"
                step="0.5"
                placeholder="e.g. 80"
                value={form.plannedHours}
                onChange={(e) => setForm({ ...form, plannedHours: e.target.value })}
                required
              />
              <span className="text-[10.5px] text-navy-500 mt-0.5 block">
                Estimated team hours to deliver this scope
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-navy-700 mb-1">
                Customer PO # / Ref
              </label>
              <Input
                placeholder="e.g. PO-2026-9901"
                value={form.poNumber}
                onChange={(e) => setForm({ ...form, poNumber: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-navy-700 mb-1">
                Status
              </label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="w-full text-xs rounded-lg border border-navy-500/15 py-2 px-3 text-navy-900 bg-surface focus:outline-none focus:ring-2 focus:ring-navy-900/10"
              >
                <option value="approved">Approved (Updates Order Value)</option>
                <option value="in_progress">In Progress (Updates Order Value)</option>
                <option value="requested">Requested (Under Evaluation)</option>
                <option value="completed">Completed</option>
                <option value="draft">Draft</option>
              </select>
            </div>
          </div>

          {/* File Upload (PO or Doc) */}
          <div className="space-y-1.5 border border-dashed border-navy-500/20 rounded-xl p-3 bg-neutral-50/50">
            <label className="block text-xs font-bold text-navy-700">
              Upload PO or Change Request Document
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.zip"
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              className="text-xs text-navy-700 file:mr-3 file:rounded-md file:border-0 file:bg-navy-900 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-navy-800"
            />
            {selectedFile && (
              <span className="block text-xs font-medium text-emerald-700">
                Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
              </span>
            )}
            <p className="text-[10px] text-navy-400">
              Attach approved Purchase Order, SOW amendment, or client change document (PDF, Word, Excel up to 50MB).
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-navy-700 mb-1">
              Description & Scope Justification
            </label>
            <Textarea
              rows={3}
              placeholder="Scope details, deliverables, and reasons for this change request..."
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>

          {/* Dynamic Order Value Impact Preview */}
          {summary && form.orderValueInr && Number(form.orderValueInr) > 0 && form.status !== "rejected" && form.status !== "draft" && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-900 space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <span>📈</span> Order Value Impact:
              </p>
              <div className="flex justify-between text-[11.5px]">
                <span>Current Initial Order Value:</span>
                <span className="font-semibold">{formatCurrency(summary.initialOrderValueInr, currency)}</span>
              </div>
              <div className="flex justify-between text-[11.5px]">
                <span>Total Approved CRs:</span>
                <span className="font-semibold">{formatCurrency(summary.crOrderValueInr + Number(form.orderValueInr), currency)}</span>
              </div>
              <div className="flex justify-between text-xs font-bold border-t border-emerald-200 pt-1 text-emerald-950">
                <span>Revised Total Order Value:</span>
                <span>{formatCurrency(summary.initialOrderValueInr + summary.crOrderValueInr + Number(form.orderValueInr), currency)}</span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-100">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsModalOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={isSubmitting}
            >
              Add Change Request
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

