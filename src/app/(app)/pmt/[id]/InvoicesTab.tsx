"use client";

import React, { useState, useEffect } from "react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Card, StatCard } from "@/components/ui/Card";
import { ColorBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { todayISO, todayPlusISO } from "@/lib/dates";

interface Invoice {
  id: string;
  project_id: string;
  invoice_number: string;
  client_name: string;
  amount_inr: string;
  tax_amount_inr: string;
  total_amount_inr: string;
  currency: string;
  status: "draft" | "sent" | "paid" | "overdue";
  issue_date: string;
  due_date: string;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
}

interface Props {
  projectId: string;
  projectCode: string;
  clientName?: string;
}

export function InvoicesTab({ projectId, projectCode, clientName }: Props) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Form State
  const [invoiceNumber, setInvoiceNumber] = useState(`INV-2026-00${Math.floor(Math.random() * 90) + 10}`);
  const [formClientName, setFormClientName] = useState(clientName || "Global Tech Inc.");
  const [amountInr, setAmountInr] = useState("250000");
  const [issueDate, setIssueDate] = useState(todayISO());
  const [dueDate, setDueDate] = useState(todayPlusISO(30));
  const [notes, setNotes] = useState("");

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const fetchInvoices = async () => {
    try {
      const res = await fetch(`/api/pmt/projects/${projectCode || projectId}/invoices`);
      if (res.ok) {
        const json = await res.json();
        setInvoices(json.data || []);
      }
    } catch (err) {
      console.error("Failed to load invoices", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, [projectId, projectCode]);

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const base = parseFloat(amountInr) || 0;
      const tax = base * 0.18;
      const total = base + tax;

      const res = await fetch(`/api/pmt/projects/${projectCode || projectId}/invoices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoice_number: invoiceNumber,
          client_name: formClientName,
          amount_inr: base,
          tax_amount_inr: tax,
          total_amount_inr: total,
          issue_date: issueDate,
          due_date: dueDate,
          status: "sent",
          notes,
        }),
      });

      if (res.ok) {
        showToast(`Invoice ${invoiceNumber} created and dispatched!`);
        setIsModalOpen(false);
        setNotes("");
        setInvoiceNumber(`INV-2026-00${Math.floor(Math.random() * 90) + 10}`);
        await fetchInvoices();
      } else {
        alert("Failed to create invoice");
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMarkAsPaid = async (inv: Invoice) => {
    try {
      const res = await fetch(`/api/pmt/projects/${projectCode || projectId}/invoices`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId: inv.id,
          status: "paid",
        }),
      });

      if (res.ok) {
        showToast(`Invoice ${inv.invoice_number} marked as Paid!`);
        await fetchInvoices();
      }
    } catch (err: any) {
      alert("Error updating invoice: " + err.message);
    }
  };

  // Financial KPIs
  const totalBilled = invoices.reduce((acc, i) => acc + (parseFloat(i.total_amount_inr) || 0), 0);
  const totalPaid = invoices
    .filter((i) => i.status === "paid")
    .reduce((acc, i) => acc + (parseFloat(i.total_amount_inr) || 0), 0);
  const totalPending = totalBilled - totalPaid;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "paid":
        return <ColorBadge colorClass="bg-emerald-50 text-emerald-700 border border-emerald-200">PAID</ColorBadge>;
      case "sent":
        return <ColorBadge colorClass="bg-blue-50 text-blue-700 border border-blue-200">DISPATCHED</ColorBadge>;
      case "overdue":
        return <ColorBadge colorClass="bg-rose-50 text-rose-700 border border-rose-200">OVERDUE</ColorBadge>;
      default:
        return <ColorBadge colorClass="bg-neutral-100 text-navy-700">DRAFT</ColorBadge>;
    }
  };

  if (loading) return <div className="p-6 h-64 bg-navy-50 animate-pulse rounded-xl" />;

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-navy-900 text-white px-5 py-3 rounded-xl shadow-2xl border border-navy-700">
          <svg className="w-5 h-5 text-emerald-400" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          <span className="text-sm font-medium">{toastMessage}</span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Total Billed"
          value={formatCurrency(totalBilled)}
          icon={
            <svg className="w-5 h-5 text-navy-600" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
            </svg>
          }
        />
        <StatCard
          label="Collected / Paid"
          value={formatCurrency(totalPaid)}
          icon={
            <svg className="w-5 h-5 text-emerald-600" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          }
        />
        <StatCard
          label="Outstanding Balance"
          value={formatCurrency(totalPending)}
          icon={
            <svg className="w-5 h-5 text-amber-500" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
            </svg>
          }
        />
      </div>

      {/* Invoices List Header & Action */}
      <div className="bg-white rounded-xl border border-navy-500/10 shadow-sm overflow-hidden">
        <div className="bg-navy-50/50 px-5 py-4 border-b border-navy-500/10 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-navy-900">Project Billing & Milestone Invoices</h3>
            <p className="text-xs text-navy-500">Track dispatched client tax invoices and payments</p>
          </div>
          <Button size="sm" onClick={() => setIsModalOpen(true)}>
            <svg className="w-4 h-4 mr-1.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            Create Invoice
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-navy-900">
            <thead className="bg-neutral-50/75 text-xs uppercase font-semibold text-navy-500 border-b border-neutral-100">
              <tr>
                <th className="px-5 py-3">Invoice #</th>
                <th className="px-5 py-3">Client</th>
                <th className="px-5 py-3">Issue Date</th>
                <th className="px-5 py-3">Due Date</th>
                <th className="px-5 py-3 text-right">Taxable (INR)</th>
                <th className="px-5 py-3 text-right">Total (Inc. GST)</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-navy-400">
                    No invoices recorded for this project yet.
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-neutral-50/60 transition-colors">
                    <td className="px-5 py-4 font-mono font-bold text-navy-900">
                      {inv.invoice_number}
                    </td>
                    <td className="px-5 py-4 font-medium text-navy-800">
                      {inv.client_name}
                      {inv.notes && (
                        <p className="text-xs text-navy-400 truncate max-w-xs">{inv.notes}</p>
                      )}
                    </td>
                    <td className="px-5 py-4 tabular-nums text-navy-600 text-xs whitespace-nowrap">
                      {formatDate(inv.issue_date)}
                    </td>
                    <td className="px-5 py-4 tabular-nums text-navy-600 text-xs whitespace-nowrap">
                      {formatDate(inv.due_date)}
                    </td>
                    <td className="px-5 py-4 text-right tabular-nums text-navy-700 font-medium">
                      {formatCurrency(parseFloat(inv.amount_inr))}
                    </td>
                    <td className="px-5 py-4 text-right tabular-nums text-navy-900 font-bold">
                      {formatCurrency(parseFloat(inv.total_amount_inr))}
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      {getStatusBadge(inv.status)}
                    </td>
                    <td className="px-5 py-4 text-right whitespace-nowrap">
                      {inv.status !== "paid" ? (
                        <button
                          onClick={() => handleMarkAsPaid(inv)}
                          className="px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors"
                        >
                          Mark Paid
                        </button>
                      ) : (
                        <span className="text-xs text-navy-400 italic">
                          Paid {inv.paid_at ? formatDate(inv.paid_at) : ""}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Invoice Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Generate Milestone Tax Invoice"
        footer={
          <div className="flex justify-end gap-2 w-full">
            <Button variant="secondary" size="sm" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleCreateInvoice} disabled={isSubmitting}>
              {isSubmitting ? "Generating..." : "Generate & Dispatch"}
            </Button>
          </div>
        }
      >
        <form onSubmit={handleCreateInvoice} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-navy-700 uppercase tracking-wider mb-1">
                Invoice # *
              </label>
              <input
                type="text"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                required
                className="w-full text-sm font-mono border border-neutral-200 rounded-lg px-3 py-2 text-navy-900 focus:outline-none focus:ring-2 focus:ring-navy-700/20"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-navy-700 uppercase tracking-wider mb-1">
                Client Organization *
              </label>
              <input
                type="text"
                value={formClientName}
                onChange={(e) => setFormClientName(e.target.value)}
                required
                className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-2 text-navy-900 focus:outline-none focus:ring-2 focus:ring-navy-700/20"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-navy-700 uppercase tracking-wider mb-1">
              Taxable Amount (INR) *
            </label>
            <input
              type="number"
              step="1000"
              value={amountInr}
              onChange={(e) => setAmountInr(e.target.value)}
              required
              className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-2 text-navy-900 focus:outline-none focus:ring-2 focus:ring-navy-700/20"
            />
            <div className="flex items-center justify-between text-xs text-navy-500 mt-1 bg-neutral-50 p-2 rounded">
              <span>GST (18%): {formatCurrency((parseFloat(amountInr) || 0) * 0.18)}</span>
              <span className="font-bold text-navy-900">Total: {formatCurrency((parseFloat(amountInr) || 0) * 1.18)}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-navy-700 uppercase tracking-wider mb-1">
                Issue Date *
              </label>
              <input
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                required
                className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-2 text-navy-900 focus:outline-none focus:ring-2 focus:ring-navy-700/20"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-navy-700 uppercase tracking-wider mb-1">
                Payment Due Date *
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                required
                className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-2 text-navy-900 focus:outline-none focus:ring-2 focus:ring-navy-700/20"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-navy-700 uppercase tracking-wider mb-1">
              Milestone / Scope Notes
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Milestone 2 Sign-off, Core module deployment payment..."
              className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-2 text-navy-900 focus:outline-none focus:ring-2 focus:ring-navy-700/20"
            />
          </div>
        </form>
      </Modal>
    </div>
  );
}
