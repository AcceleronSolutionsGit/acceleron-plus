"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Card, SectionHeading, StatCard } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { cn, formatCurrency } from "@/lib/utils";
import type { ZohoSalesOrderRow, SalesOrderImportSummary } from "@/lib/imports/sales-order-import";

export interface PersistedSalesOrder {
  id: string;
  salesOrderNumber: string;
  rowLabel?: string | null;
  classification?: "group" | "non_group" | string | null;
  category?: string | null;
  currency: string;
  materialInfo?: string | null;
  productName?: string | null;
  orderStatus: string;
  orderDate?: string | null;
  customerName: string;
  purchaseOrder?: string | null;
  invoicedStatus?: string | null;
  amount: number;
  invoicedAmount: number;
  balanceAmount: number;
  projectId?: string | null;
  projectCode?: string | null;
  projectName?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

interface OrdersResponse {
  success: boolean;
  orders: PersistedSalesOrder[];
  summary: {
    total: number;
    filteredCount: number;
    totalAmountINR: number;
    totalAmountUSD: number;
    totalInvoicedINR: number;
    totalInvoicedUSD: number;
    totalRemainingINR: number;
    totalRemainingUSD: number;
    negativeCount: number;
    groupOrdersCount?: number;
    nonGroupOrdersCount?: number;
    categories: string[];
    groups: string[];
  };
}

interface ImportResponse {
  success: boolean;
  committed: boolean;
  rows: ZohoSalesOrderRow[];
  summary: SalesOrderImportSummary;
  error?: string;
}

const CATEGORY_STYLES: Record<string, { badge: string; dot: string }> = {
  SAP:      { badge: "bg-indigo-50 text-indigo-700 border-indigo-200", dot: "bg-indigo-500" },
  SOFTWARE: { badge: "bg-blue-50 text-blue-700 border-blue-200",     dot: "bg-blue-500" },
  SUPPORT:  { badge: "bg-teal-50 text-teal-700 border-teal-200",     dot: "bg-teal-500" },
  INFRA:    { badge: "bg-purple-50 text-purple-700 border-purple-200", dot: "bg-purple-500" },
  LICENCE:  { badge: "bg-amber-50 text-amber-700 border-amber-200",   dot: "bg-amber-500" },
  AUDIT:    { badge: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  OTHER:    { badge: "bg-neutral-100 text-neutral-700 border-neutral-200", dot: "bg-neutral-500" },
};

function getCategoryStyle(cat?: string | null) {
  if (!cat) return CATEGORY_STYLES.OTHER;
  const upper = cat.trim().toUpperCase();
  return CATEGORY_STYLES[upper] || {
    badge: "bg-navy-50 text-navy-700 border-navy-200",
    dot: "bg-navy-500",
  };
}

function formatMoney(amount: number | null | undefined, currency: string = "INR"): string {
  if (amount === null || amount === undefined || isNaN(amount)) return "—";
  const isNeg = amount < 0;
  const absVal = Math.abs(amount);
  const prefix = isNeg ? "- " : "";

  if (currency === "USD") {
    return `${prefix}$${absVal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `${prefix}₹${absVal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function SalesOrdersClient() {
  // Main data state
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<PersistedSalesOrder[]>([]);
  const [dataSummary, setDataSummary] = useState<OrdersResponse["summary"] | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedGroup, setSelectedGroup] = useState("all");
  const [selectedClassification, setSelectedClassification] = useState<"all" | "group" | "non_group">("all");
  const [selectedCurrency, setSelectedCurrency] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedInvoicedStatus, setSelectedInvoicedStatus] = useState("all");
  const [balanceFilter, setBalanceFilter] = useState<"all" | "negative" | "positive">("all");
  const [groupBy, setGroupBy] = useState<"none" | "group" | "classification" | "category" | "customer">("group");
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  // Modal / Import state
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<"" | "preview" | "commit">("");
  const [uploadError, setUploadError] = useState("");
  const [importResult, setImportResult] = useState<ImportResponse | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Clear-import modal state
  const [clearModalOpen, setClearModalOpen] = useState(false);
  const [clearBusy, setClearBusy] = useState<"" | "clear_orders" | "clear_with_projects" | "full_reset">("");
  const [clearResult, setClearResult] = useState<{ message: string; ordersDeleted: number; projectsDeleted: number } | null>(null);
  const [clearConfirmMode, setClearConfirmMode] = useState<"" | "clear_orders" | "clear_with_projects" | "full_reset">("");

  // Fetch persisted sales orders from API
  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/sales-orders");
      const json: OrdersResponse = await res.json();
      if (json.success) {
        setOrders(json.orders || []);
        setDataSummary(json.summary || null);
      }
    } catch (err) {
      console.error("Failed to load sales orders:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Upload handler
  async function handleUpload(commit: boolean) {
    if (!file) return;
    setBusy(commit ? "commit" : "preview");
    setUploadError("");

    try {
      const body = new FormData();
      body.set("file", file);
      if (commit) body.set("commit", "true");

      const res = await fetch("/api/admin/sales-orders", {
        method: "POST",
        body,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setUploadError(data.error || "Could not process that file.");
        if (!commit) setImportResult(null);
        return;
      }

      setImportResult(data as ImportResponse);

      if (commit) {
        setToastMessage(`Import successful! ${data.summary?.created || 0} projects created, ${data.summary?.updated || 0} updated.`);
        setUploadModalOpen(false);
        setFile(null);
        setImportResult(null);
        await fetchOrders();
      }
    } catch {
      setUploadError("Could not connect to the server.");
    } finally {
      setBusy("");
    }
  }

  function chooseFile(next: File | null) {
    setFile(next);
    setImportResult(null);
    setUploadError("");
  }

  // Clear-import handler
  async function handleClear(mode: "clear_orders" | "clear_with_projects" | "full_reset") {
    setClearBusy(mode);
    setClearResult(null);
    try {
      const res = await fetch(`/api/admin/sales-orders?mode=${mode}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        setClearResult({
          message: data.message,
          ordersDeleted: data.ordersDeleted ?? 0,
          projectsDeleted: data.projectsDeleted ?? 0,
        });
        setClearConfirmMode("");
        await fetchOrders();
      } else {
        setClearResult({ message: data.error || "Operation failed.", ordersDeleted: 0, projectsDeleted: 0 });
      }
    } catch {
      setClearResult({ message: "Could not connect to the server.", ordersDeleted: 0, projectsDeleted: 0 });
    } finally {
      setClearBusy("");
    }
  }

  // Filtered orders
  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();

    return orders.filter((item) => {
      if (selectedCategory !== "all" && item.category !== selectedCategory) return false;
      if (selectedGroup !== "all" && item.rowLabel !== selectedGroup) return false;
      if (selectedClassification !== "all") {
        const itemClass = (item.classification || "non_group").toLowerCase() === "group" ? "group" : "non_group";
        if (itemClass !== selectedClassification) return false;
      }
      if (selectedCurrency !== "all" && item.currency !== selectedCurrency) return false;
      if (selectedStatus !== "all" && item.orderStatus.toLowerCase() !== selectedStatus.toLowerCase()) return false;
      if (selectedInvoicedStatus !== "all" && item.invoicedStatus?.toLowerCase() !== selectedInvoicedStatus.toLowerCase()) return false;
      if (balanceFilter === "negative" && item.balanceAmount >= 0) return false;
      if (balanceFilter === "positive" && item.balanceAmount < 0) return false;

      if (q) {
        const text = [
          item.salesOrderNumber,
          item.customerName,
          item.productName,
          item.materialInfo,
          item.purchaseOrder,
          item.projectCode,
          item.category,
          item.rowLabel,
          item.classification,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [orders, search, selectedCategory, selectedGroup, selectedClassification, selectedCurrency, selectedStatus, selectedInvoicedStatus, balanceFilter]);

  // Grouping logic
  const groupedSections = useMemo(() => {
    if (groupBy === "none") {
      return [{ key: "All Orders", title: "All Orders", items: filteredOrders }];
    }

    const map = new Map<string, PersistedSalesOrder[]>();

    for (const ord of filteredOrders) {
      let groupKey = "Unassigned";
      if (groupBy === "group") {
        groupKey = ord.rowLabel || "Other";
      } else if (groupBy === "classification") {
        const isGrp = (ord.classification || "non_group").toLowerCase() === "group";
        groupKey = isGrp ? "Group Projects" : "Non-Group Projects";
      } else if (groupBy === "category") {
        groupKey = ord.category || "Uncategorized";
      } else if (groupBy === "customer") {
        groupKey = ord.customerName || "Unknown Customer";
      }

      if (!map.has(groupKey)) map.set(groupKey, []);
      map.get(groupKey)!.push(ord);
    }

    return Array.from(map.entries())
      .map(([key, items]) => ({
        key,
        title: key,
        items,
      }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [filteredOrders, groupBy]);

  const toggleGroupCollapse = (key: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Export to CSV
  const exportToCSV = () => {
    if (filteredOrders.length === 0) return;

    const headers = [
      "Row Labels",
      "Classification",
      "Category",
      "Currency",
      "Sales Order",
      "Material Info",
      "Product Name",
      "Order Status",
      "Date",
      "Customer Name",
      "Purchase Order",
      "Invoiced",
      "Sum of Amount",
      "Sum of Invoiced Amount",
      "Sum of Balance",
      "Linked Project Code",
    ];

    const csvRows = [headers.join(",")];

    for (const item of filteredOrders) {
      const escape = (val: any) => `"${String(val ?? "").replace(/"/g, '""')}"`;
      csvRows.push(
        [
          escape(item.rowLabel || ""),
          escape((item.classification || "non_group").toLowerCase() === "group" ? "Group" : "Non-Group"),
          escape(item.category || ""),
          escape(item.currency || "INR"),
          escape(item.salesOrderNumber || ""),
          escape(item.materialInfo || ""),
          escape(item.productName || ""),
          escape(item.orderStatus || ""),
          escape(item.orderDate || ""),
          escape(item.customerName || ""),
          escape(item.purchaseOrder || ""),
          escape(item.invoicedStatus || ""),
          escape(item.amount),
          escape(item.invoicedAmount),
          escape(item.balanceAmount),
          escape(item.projectCode || ""),
        ].join(",")
      );
    }

    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Sales_Orders_Export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const categories = dataSummary?.categories || [];
  const groups = dataSummary?.groups || [];

  return (
    <div className="space-y-6">
      {/* ── Toast notification banner ───────────────────────────── */}
      {toastMessage && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 shadow-xs">
          <div className="flex items-center gap-2">
            <svg className="h-5 w-5 text-emerald-600" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span className="font-medium">{toastMessage}</span>
          </div>
          <button
            onClick={() => setToastMessage(null)}
            className="text-emerald-700 hover:text-emerald-900 font-semibold text-xs"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-navy-900 text-white shadow-xs">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            </span>
            <h1 className="text-2xl font-bold text-navy-900 font-[family-name:var(--font-league-spartan)]">
              Sales Orders & Invoicing
            </h1>
          </div>
          <p className="mt-1.5 text-sm text-navy-500 max-w-3xl">
            Centralized register of client sales orders, contract values, billed revenue, and live remaining balances.
            Amounts are synchronized automatically with PMT projects.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2.5">
          <Button
            variant="secondary"
            size="sm"
            onClick={exportToCSV}
            disabled={filteredOrders.length === 0}
            className="h-10 text-xs font-semibold gap-2"
          >
            <svg className="w-4 h-4 text-navy-600" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 16v1a2 2 0 002 2h8a2 2 0 002-2v-1M7 10l3 3m0 0l3-3m-3 3V3" />
            </svg>
            Export CSV
          </Button>

          <Button
            size="sm"
            onClick={() => setUploadModalOpen(true)}
            className="h-10 text-xs font-semibold gap-2 bg-navy-900 hover:bg-navy-800 text-white shadow-xs"
          >
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 14v1a2 2 0 002 2h10a2 2 0 002-2v-1M10 3v10m-3-3l3-3 3 3" />
            </svg>
            Upload Workbook (.xlsx)
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => { setClearModalOpen(true); setClearResult(null); setClearConfirmMode(""); }}
            className="h-10 text-xs font-semibold gap-2 text-red-600 border-red-200 hover:bg-red-50"
          >
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            Clear Import Data
          </Button>

          <Link href="/pmt">
            <Button variant="secondary" size="sm" className="h-10 text-xs font-semibold">
              PMT Projects
            </Button>
          </Link>
        </div>
      </div>

      {/* ── KPI Stat Cards ──────────────────────────────────────── */}
      {dataSummary && (
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          {/* Card 1: Total Orders & Contract Value */}
          <Card padding="md" className="border-navy-900/8 bg-surface">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-navy-400">Total Contract Value</p>
                <h3 className="mt-1 text-2xl font-bold tracking-tight text-navy-900">
                  {formatMoney(dataSummary.totalAmountINR, "INR")}
                </h3>
                {dataSummary.totalAmountUSD > 0 && (
                  <p className="mt-0.5 text-xs font-semibold text-navy-500">
                    + {formatMoney(dataSummary.totalAmountUSD, "USD")} USD
                  </p>
                )}
              </div>
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
              </span>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-navy-500 border-t border-navy-900/5 pt-2">
              <span>{dataSummary.total} Total Orders</span>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 font-semibold text-emerald-700" title="Group client orders">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  {dataSummary.groupOrdersCount ?? orders.filter((o) => (o.classification || "non_group").toLowerCase() === "group").length} Group
                </span>
                <span className="text-navy-300">•</span>
                <span className="inline-flex items-center gap-1 font-semibold text-orange-700" title="Non-Group client orders">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                  {dataSummary.nonGroupOrdersCount ?? orders.filter((o) => (o.classification || "non_group").toLowerCase() !== "group").length} Non-Group
                </span>
              </div>
            </div>
          </Card>

          {/* Card 2: Total Invoiced */}
          <Card padding="md" className="border-navy-900/8 bg-surface">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-navy-400">Total Invoiced Amount</p>
                <h3 className="mt-1 text-2xl font-bold tracking-tight text-emerald-700">
                  {formatMoney(dataSummary.totalInvoicedINR, "INR")}
                </h3>
                {dataSummary.totalInvoicedUSD > 0 && (
                  <p className="mt-0.5 text-xs font-semibold text-emerald-600">
                    + {formatMoney(dataSummary.totalInvoicedUSD, "USD")} USD
                  </p>
                )}
              </div>
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </span>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-navy-500 border-t border-navy-900/5 pt-2">
              <span>Billed to clients</span>
              <span className="font-semibold text-emerald-700">
                {dataSummary.totalAmountINR > 0
                  ? `${Math.round((dataSummary.totalInvoicedINR / dataSummary.totalAmountINR) * 100)}% Billed`
                  : "0%"}
              </span>
            </div>
          </Card>

          {/* Card 3: Net Remaining Balance */}
          <Card padding="md" className="border-navy-900/8 bg-surface">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-navy-400">Net Remaining Balance</p>
                <h3 className={cn("mt-1 text-2xl font-bold tracking-tight", dataSummary.totalRemainingINR < 0 ? "text-red-600" : "text-navy-900")}>
                  {formatMoney(dataSummary.totalRemainingINR, "INR")}
                </h3>
                {dataSummary.totalRemainingUSD !== 0 && (
                  <p className={cn("mt-0.5 text-xs font-semibold", dataSummary.totalRemainingUSD < 0 ? "text-red-500" : "text-navy-500")}>
                    + {formatMoney(dataSummary.totalRemainingUSD, "USD")} USD
                  </p>
                )}
              </div>
              <span className={cn(
                "flex h-10 w-10 items-center justify-center rounded-xl",
                dataSummary.totalRemainingINR < 0 ? "bg-red-50 text-red-600" : "bg-navy-50 text-navy-600"
              )}>
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <line x1="6" y1="12" x2="18" y2="12" />
                </svg>
              </span>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-navy-500 border-t border-navy-900/5 pt-2">
              <span>Unbilled contract balance</span>
              <span className="font-semibold text-navy-700">Amount - Invoiced</span>
            </div>
          </Card>

          {/* Card 4: Negative Balances / Over-billed Alert Card */}
          <div
            onClick={() => setBalanceFilter(balanceFilter === "negative" ? "all" : "negative")}
            className={cn(
              "cursor-pointer transition-all duration-200 border rounded-2xl p-5 shadow-xs",
              dataSummary.negativeCount > 0
                ? "bg-red-50/40 border-red-200 hover:border-red-300 hover:shadow-xs"
                : "border-navy-900/8 bg-surface hover:border-navy-900/20",
              balanceFilter === "negative" && "ring-2 ring-red-500 bg-red-50"
            )}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-red-600">Over-Billed Orders</p>
                <div className="mt-1 flex items-baseline gap-2">
                  <h3 className="text-2xl font-bold tracking-tight text-red-600">
                    {dataSummary.negativeCount}
                  </h3>
                  <span className="text-xs font-semibold text-red-500">Negative Balance</span>
                </div>
              </div>
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 text-red-600">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </span>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-red-700 font-medium border-t border-red-200/50 pt-2">
              <span>{balanceFilter === "negative" ? "Showing negative only ✓" : "Click to filter negative items"}</span>
              <span className="underline text-[11px]">Filter</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Classification & Category Quick Filters ─────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-navy-900/8 pb-2">
        {/* Quick Classification Toggle Pills */}
        <div className="flex items-center gap-1.5 p-1 bg-navy-900/5 rounded-xl border border-navy-900/10 shrink-0">
          <button
            onClick={() => setSelectedClassification("all")}
            className={cn(
              "px-3 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer",
              selectedClassification === "all" ? "bg-navy-900 text-white shadow-2xs" : "text-navy-600 hover:text-navy-900"
            )}
          >
            All Orders ({orders.length})
          </button>
          <button
            onClick={() => setSelectedClassification(selectedClassification === "group" ? "all" : "group")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer",
              selectedClassification === "group"
                ? "bg-emerald-600 text-white shadow-2xs"
                : "text-emerald-700 hover:bg-emerald-50"
            )}
          >
            <span className={cn("w-2 h-2 rounded-full", selectedClassification === "group" ? "bg-white" : "bg-emerald-500")} />
            Group ({dataSummary?.groupOrdersCount ?? orders.filter((o) => (o.classification || "non_group").toLowerCase() === "group").length})
          </button>
          <button
            onClick={() => setSelectedClassification(selectedClassification === "non_group" ? "all" : "non_group")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer",
              selectedClassification === "non_group"
                ? "bg-orange-600 text-white shadow-2xs"
                : "text-orange-700 hover:bg-orange-50"
            )}
          >
            <span className={cn("w-2 h-2 rounded-full", selectedClassification === "non_group" ? "bg-white" : "bg-orange-500")} />
            Non-Group ({dataSummary?.nonGroupOrdersCount ?? orders.filter((o) => (o.classification || "non_group").toLowerCase() !== "group").length})
          </button>
        </div>

        {/* Category Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          <button
            onClick={() => setSelectedCategory("all")}
            className={cn(
              "rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors shrink-0",
              selectedCategory === "all"
                ? "bg-navy-900 text-white shadow-xs"
                : "text-navy-600 hover:bg-navy-900/5"
            )}
          >
            All ({orders.length})
          </button>
          {categories.map((cat) => {
            const count = orders.filter((o) => o.category === cat).length;
            const style = getCategoryStyle(cat);
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(selectedCategory === cat ? "all" : cat)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors shrink-0 border",
                  selectedCategory === cat
                    ? "bg-navy-900 text-white border-navy-900 shadow-xs"
                    : `${style.badge} hover:brightness-95`
                )}
              >
                <span>{cat}</span>
                <span className={cn(
                  "rounded-full px-1.5 py-0.2 text-[10px] font-bold",
                  selectedCategory === cat ? "bg-white/20 text-white" : "bg-black/5 text-navy-800"
                )}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Filters & Controls Bar ──────────────────────────────── */}
      <Card padding="md" className="border-navy-900/8 bg-surface space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 items-center">
          {/* Search bar */}
          <div className="xl:col-span-2 relative">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search Sales Order#, Customer, Product, PO..."
              className="w-full h-10 rounded-xl border border-navy-900/15 bg-surface pl-9 pr-4 text-xs font-medium text-navy-800 placeholder:text-navy-400 focus:border-navy-900 focus:outline-none focus:ring-1 focus:ring-navy-900"
            />
            <svg
              className="absolute left-3 top-3 h-4 w-4 text-navy-400"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="8" cy="8" r="5" />
              <line x1="12" y1="12" x2="16" y2="16" />
            </svg>
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-2.5 text-xs text-navy-400 hover:text-navy-700"
              >
                ✕
              </button>
            )}
          </div>

          {/* Classification Filter */}
          <div>
            <select
              value={selectedClassification}
              onChange={(e) => setSelectedClassification(e.target.value as any)}
              className="w-full h-10 rounded-xl border border-navy-900/15 bg-surface px-3 text-xs font-semibold text-navy-800 focus:border-navy-900 focus:outline-none"
            >
              <option value="all">All Classifications</option>
              <option value="group">Group Only</option>
              <option value="non_group">Non-Group Only</option>
            </select>
          </div>

          {/* Group / Row Labels Filter */}
          <div>
            <select
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
              className="w-full h-10 rounded-xl border border-navy-900/15 bg-surface px-3 text-xs font-semibold text-navy-800 focus:border-navy-900 focus:outline-none"
            >
              <option value="all">All Row Groups</option>
              {groups.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>

          {/* Currency Filter */}
          <div>
            <select
              value={selectedCurrency}
              onChange={(e) => setSelectedCurrency(e.target.value)}
              className="w-full h-10 rounded-xl border border-navy-900/15 bg-surface px-3 text-xs font-semibold text-navy-800 focus:border-navy-900 focus:outline-none"
            >
              <option value="all">All Currencies</option>
              <option value="INR">INR (₹)</option>
              <option value="USD">USD ($)</option>
            </select>
          </div>

          {/* Invoiced Status */}
          <div>
            <select
              value={selectedInvoicedStatus}
              onChange={(e) => setSelectedInvoicedStatus(e.target.value)}
              className="w-full h-10 rounded-xl border border-navy-900/15 bg-surface px-3 text-xs font-semibold text-navy-800 focus:border-navy-900 focus:outline-none"
            >
              <option value="all">All Invoice Statuses</option>
              <option value="Invoiced">Invoiced</option>
              <option value="Partially Invoiced">Partially Invoiced</option>
              <option value="Not Invoiced">Not Invoiced</option>
            </select>
          </div>

          {/* Balance Filter */}
          <div>
            <select
              value={balanceFilter}
              onChange={(e) => setBalanceFilter(e.target.value as any)}
              className={cn(
                "w-full h-10 rounded-xl border px-3 text-xs font-semibold focus:outline-none",
                balanceFilter === "negative"
                  ? "border-red-400 text-red-600 bg-red-50/50"
                  : "border-navy-900/15 bg-surface text-navy-800"
              )}
            >
              <option value="all">All Balances</option>
              <option value="negative">Negative Balance Only (Over-billed)</option>
              <option value="positive">Positive / Pending Balance Only</option>
            </select>
          </div>
        </div>

        {/* View Arrangement Toggle */}
        <div className="flex items-center justify-between gap-3 flex-wrap border-t border-navy-900/5 pt-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-navy-500">Arrange View:</span>
            <div className="flex rounded-lg border border-navy-900/12 bg-surface shadow-2xs overflow-hidden">
              {[
                { id: "group", label: "Grouped by Row Labels" },
                { id: "classification", label: "Grouped by Classification" },
                { id: "category", label: "Grouped by Category" },
                { id: "customer", label: "Grouped by Customer" },
                { id: "none", label: "Flat Table" },
              ].map((m) => (
                <button
                  key={m.id}
                  onClick={() => setGroupBy(m.id as any)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
                    groupBy === m.id
                      ? "bg-navy-900 text-white font-semibold"
                      : "text-navy-600 hover:bg-navy-900/5"
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-navy-500">
              Showing <strong className="text-navy-800">{filteredOrders.length}</strong> of {orders.length} orders
            </span>

            {(search || selectedCategory !== "all" || selectedGroup !== "all" || selectedClassification !== "all" || selectedCurrency !== "all" || selectedInvoicedStatus !== "all" || balanceFilter !== "all") && (
              <button
                onClick={() => {
                  setSearch("");
                  setSelectedCategory("all");
                  setSelectedGroup("all");
                  setSelectedClassification("all");
                  setSelectedCurrency("all");
                  setSelectedInvoicedStatus("all");
                  setBalanceFilter("all");
                }}
                className="text-xs font-semibold text-red-600 hover:underline cursor-pointer"
              >
                Clear all filters
              </button>
            )}
          </div>
        </div>
      </Card>

      {/* ── Main Orders List / Table View ───────────────────────── */}
      {loading ? (
        <Card padding="lg" className="flex flex-col items-center justify-center py-16 text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-3 border-navy-900/20 border-t-navy-900" />
          <p className="mt-4 text-sm font-semibold text-navy-700">Loading sales orders and financials...</p>
        </Card>
      ) : orders.length === 0 ? (
        <Card padding="lg" className="flex flex-col items-center justify-center py-16 text-center border-dashed">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-navy-50 text-navy-600">
            <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
          </div>
          <h3 className="mt-4 text-lg font-bold text-navy-900">No Sales Orders Imported Yet</h3>
          <p className="mt-1 text-sm text-navy-500 max-w-md">
            Upload your Sales Orders & Invoicing workbook (.xlsx) to automatically populate project values, billing records, and remaining balances.
          </p>
          <Button
            onClick={() => setUploadModalOpen(true)}
            className="mt-5 h-10 px-5 text-xs font-semibold bg-navy-900 text-white"
          >
            Upload Sales Orders Workbook
          </Button>
        </Card>
      ) : filteredOrders.length === 0 ? (
        <Card padding="lg" className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-sm font-semibold text-navy-700">No sales orders match your selected filters.</p>
          <p className="mt-1 text-xs text-navy-400">Try loosening your search terms or clearing category filters.</p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setSearch("");
              setSelectedCategory("all");
              setSelectedGroup("all");
              setSelectedClassification("all");
              setSelectedCurrency("all");
              setSelectedInvoicedStatus("all");
              setBalanceFilter("all");
            }}
            className="mt-4 text-xs"
          >
            Clear Filters
          </Button>
        </Card>
      ) : (
        <div className="space-y-6">
          {groupedSections.map((section) => {
            const isCollapsed = collapsedGroups[section.key] ?? false;

            // Group subtotals
            let groupAmtINR = 0;
            let groupInvINR = 0;
            let groupBalINR = 0;
            let groupAmtUSD = 0;
            let groupInvUSD = 0;
            let groupBalUSD = 0;

            for (const item of section.items) {
              if (item.currency === "USD") {
                groupAmtUSD += item.amount;
                groupInvUSD += item.invoicedAmount;
                groupBalUSD += item.balanceAmount;
              } else {
                groupAmtINR += item.amount;
                groupInvINR += item.invoicedAmount;
                groupBalINR += item.balanceAmount;
              }
            }

            return (
              <div key={section.key} className="rounded-xl border border-navy-900/10 bg-surface shadow-xs overflow-hidden">
                {/* Accordion / Group Header */}
                <div
                  onClick={() => toggleGroupCollapse(section.key)}
                  className="flex items-center justify-between px-5 py-3.5 bg-navy-50/70 border-b border-navy-900/10 cursor-pointer select-none hover:bg-navy-100/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      className="text-navy-500 hover:text-navy-800 transition-transform duration-200"
                      style={{ transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)" }}
                    >
                      ▼
                    </button>
                    <span className="font-bold text-navy-900 text-sm">{section.title}</span>
                    <span className="rounded-full bg-navy-900/10 px-2 py-0.5 text-[11px] font-bold text-navy-700">
                      {section.items.length} order{section.items.length === 1 ? "" : "s"}
                    </span>
                  </div>

                  {/* Subtotal metrics in group header */}
                  <div className="flex items-center gap-4 text-xs font-semibold">
                    <span className="text-navy-600">
                      Amount: <strong className="text-navy-900">{formatMoney(groupAmtINR, "INR")}</strong>
                    </span>
                    <span className="text-emerald-700">
                      Billed: <strong>{formatMoney(groupInvINR, "INR")}</strong>
                    </span>
                    {/* Remaining Amount with negative red styling */}
                    <span className={cn(
                      "px-2.5 py-1 rounded-md font-bold",
                      groupBalINR < 0
                        ? "bg-red-100 text-red-700 border border-red-300"
                        : "bg-emerald-50 text-emerald-800 border border-emerald-200"
                    )}>
                      Balance: {formatMoney(groupBalINR, "INR")}
                    </span>
                  </div>
                </div>

                {/* Table Content */}
                {!isCollapsed && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-navy-900/10 bg-navy-50/30 text-[11px] font-semibold text-navy-600 uppercase tracking-wider">
                          <th className="px-4 py-3">Classification</th>
                          <th className="px-4 py-3">Category</th>
                          <th className="px-4 py-3">Sales Order #</th>
                          <th className="px-4 py-3">Customer & Purchase Order</th>
                          <th className="px-4 py-3">Product / Material Info</th>
                          <th className="px-4 py-3">Order Status</th>
                          <th className="px-4 py-3">Date</th>
                          <th className="px-4 py-3">Invoiced</th>
                          <th className="px-4 py-3 text-right">Sum of Amount</th>
                          <th className="px-4 py-3 text-right">Sum of Invoiced</th>
                          <th className="px-4 py-3 text-right">
                            <span className="inline-flex items-center gap-1 font-bold">
                              Remaining Amount (Balance)
                            </span>
                          </th>
                          <th className="px-4 py-3">Linked Project</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-navy-900/5 text-navy-800">
                        {section.items.map((ord, idx) => {
                          const catStyle = getCategoryStyle(ord.category);
                          const isNegative = ord.balanceAmount < 0;
                          const isGroupOrder = (ord.classification || "non_group").toLowerCase() === "group";

                          return (
                            <tr
                              key={ord.id || idx}
                              className={cn(
                                "hover:bg-navy-50/40 transition-colors",
                                isNegative && "bg-red-50/20 hover:bg-red-50/40"
                              )}
                            >
                              {/* Classification Badge */}
                              <td className="px-4 py-3 whitespace-nowrap">
                                <span className={cn(
                                  "inline-flex items-center rounded-md px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide ring-1 ring-inset",
                                  isGroupOrder
                                    ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
                                    : "bg-orange-50 text-orange-700 ring-orange-600/20"
                                )}>
                                  {isGroupOrder ? "Group" : "Non-Group"}
                                </span>
                              </td>

                              {/* Category Badge */}
                              <td className="px-4 py-3 whitespace-nowrap">
                                <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10.5px] font-bold border", catStyle.badge)}>
                                  <span className={cn("w-1.5 h-1.5 rounded-full", catStyle.dot)} />
                                  {ord.category || "—"}
                                </span>
                              </td>

                              {/* Sales Order Number */}
                              <td className="px-4 py-3 font-mono font-bold text-navy-900 whitespace-nowrap">
                                {ord.salesOrderNumber}
                              </td>

                              {/* Customer & PO */}
                              <td className="px-4 py-3 max-w-xs">
                                <div className="font-semibold text-navy-900 leading-tight">
                                  {ord.customerName}
                                </div>
                                {ord.purchaseOrder && (
                                  <div className="mt-0.5 text-[11px] font-mono text-navy-500">
                                    PO: <span className="font-semibold text-navy-700">{ord.purchaseOrder}</span>
                                  </div>
                                )}
                              </td>

                              {/* Product Name / Material Info */}
                              <td className="px-4 py-3 max-w-sm">
                                {ord.productName && (
                                  <div className="font-semibold text-navy-900">{ord.productName}</div>
                                )}
                                <div className="text-[11.5px] text-navy-500 line-clamp-2" title={ord.materialInfo || ""}>
                                  {ord.materialInfo || ord.productName || "—"}
                                </div>
                              </td>

                              {/* Order Status */}
                              <td className="px-4 py-3 whitespace-nowrap">
                                <span className={cn(
                                  "inline-block px-2 py-0.5 rounded text-[11px] font-semibold capitalize",
                                  ord.orderStatus.toLowerCase() === "confirmed"
                                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                    : "bg-navy-50 text-navy-700 border border-navy-200"
                                )}>
                                  {ord.orderStatus}
                                </span>
                              </td>

                              {/* Date */}
                              <td className="px-4 py-3 whitespace-nowrap text-navy-500 font-mono text-[11.5px]">
                                {ord.orderDate || "—"}
                              </td>

                              {/* Invoiced Status */}
                              <td className="px-4 py-3 whitespace-nowrap">
                                {ord.invoicedStatus ? (
                                  <span className={cn(
                                    "inline-block px-2 py-0.5 rounded-full text-[10.5px] font-semibold border",
                                    ord.invoicedStatus.toLowerCase() === "invoiced"
                                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                      : ord.invoicedStatus.toLowerCase().includes("partially")
                                      ? "bg-amber-50 text-amber-700 border-amber-200"
                                      : "bg-neutral-100 text-neutral-600 border-neutral-200"
                                  )}>
                                    {ord.invoicedStatus}
                                  </span>
                                ) : (
                                  <span className="text-navy-400">—</span>
                                )}
                              </td>

                              {/* Sum of Amount */}
                              <td className="px-4 py-3 text-right font-mono font-semibold text-navy-900 whitespace-nowrap">
                                {formatMoney(ord.amount, ord.currency)}
                              </td>

                              {/* Sum of Invoiced Amount */}
                              <td className="px-4 py-3 text-right font-mono font-medium text-emerald-700 whitespace-nowrap">
                                {formatMoney(ord.invoicedAmount, ord.currency)}
                              </td>

                              {/* ═════════════════════════════════════════════════ */}
                              {/* Remaining Amount (Balance) — CRITICAL USER RULE:  */}
                              {/* "also show remaining amount and if its negative make it red" */}
                              {/* ═════════════════════════════════════════════════ */}
                              <td className="px-4 py-3 text-right whitespace-nowrap">
                                {isNegative ? (
                                  <span
                                    title="Over-billed: Invoiced amount exceeds order amount"
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold text-red-600 bg-red-50 border border-red-200 shadow-2xs font-mono"
                                  >
                                    <svg className="h-3.5 w-3.5 text-red-600 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                    </svg>
                                    {formatMoney(ord.balanceAmount, ord.currency)}
                                  </span>
                                ) : (
                                  <span className="font-mono font-semibold text-emerald-700 text-xs">
                                    {formatMoney(ord.balanceAmount, ord.currency)}
                                  </span>
                                )}
                              </td>

                              {/* Linked PMT Project */}
                              <td className="px-4 py-3 whitespace-nowrap">
                                {ord.projectCode ? (
                                  <Link
                                    href={`/pmt/${ord.projectCode}`}
                                    className="inline-flex items-center gap-1 rounded bg-navy-900/5 px-2 py-1 font-mono text-[11px] font-bold text-navy-800 hover:bg-navy-900/15 hover:text-navy-950 transition-colors"
                                  >
                                    <span>{ord.projectCode}</span>
                                    <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                                      <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                                      <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
                                    </svg>
                                  </Link>
                                ) : (
                                  <span className="text-navy-400 text-[11px]">Unlinked</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Upload Modal ────────────────────────────────────────── */}
      <Modal
        isOpen={uploadModalOpen}
        onClose={() => {
          setUploadModalOpen(false);
          setFile(null);
          setImportResult(null);
          setUploadError("");
        }}
        title="Upload Sales Orders & Invoicing Workbook"
        size="xl"
      >
        <div className="space-y-5">
          <p className="text-xs text-navy-500 leading-relaxed">
            Upload your Excel workbook (.xlsx). The system automatically detects and maps columns like:
            <strong className="text-navy-800"> Row Labels/Group, Category, Currency, Sales Order#, Material Info, Product Name, Order Status, Date, Customer Name, Purchase Order, Invoiced, Sum of Amount, Sum of Invoiced Amount, Sum of Balance</strong>.
          </p>

          {/* File input area */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-navy-700">Choose Excel File (.xlsx)</label>
            <div
              className={cn(
                "flex h-16 items-center justify-between rounded-xl border border-dashed px-4 transition-colors",
                file ? "border-navy-900 bg-navy-50/30" : "border-navy-900/25 hover:border-navy-900/50 bg-surface"
              )}
            >
              <div className="flex items-center gap-3">
                <svg className="h-6 w-6 text-navy-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                <div>
                  <p className="text-xs font-semibold text-navy-800">
                    {file ? file.name : "Select or drag .xlsx file"}
                  </p>
                  <p className="text-[11px] text-navy-400">
                    {file ? `${(file.size / 1024).toFixed(1)} KB` : "Supports Excel (.xlsx) files up to 12 MB"}
                  </p>
                </div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx"
                onChange={(e) => chooseFile(e.target.files?.[0] ?? null)}
                className="hidden"
              />

              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="h-9 text-xs"
              >
                Browse File
              </Button>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3">
            <Button
              onClick={() => handleUpload(false)}
              loading={busy === "preview"}
              disabled={!file || busy !== ""}
              variant="secondary"
              className="h-10 text-xs font-semibold px-4"
            >
              Preview & Validate
            </Button>

            {importResult && (
              <Button
                onClick={() => handleUpload(true)}
                loading={busy === "commit"}
                disabled={busy !== "" || (importResult.summary.created === 0 && importResult.summary.updated === 0)}
                className="h-10 text-xs font-semibold px-5 bg-navy-900 text-white"
              >
                Confirm & Import {importResult.summary.total} Orders
              </Button>
            )}
          </div>

          {uploadError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-700">
              {uploadError}
            </div>
          )}

          {/* Preview Results Table */}
          {importResult && (
            <div className="space-y-4 pt-2 border-t border-navy-900/10">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard label="Total Rows" value={importResult.summary.total} hint="in workbook" />
                <StatCard
                  label="Will Create"
                  value={importResult.summary.created}
                  tone={importResult.summary.created > 0 ? "positive" : "default"}
                  hint="new projects (ACC-XXX)"
                />
                <StatCard
                  label="Will Update"
                  value={importResult.summary.updated}
                  tone="default"
                  hint="existing sales orders"
                />
                <StatCard
                  label="Negative Balances"
                  value={importResult.summary.negativeCount}
                  tone={importResult.summary.negativeCount > 0 ? "critical" : "default"}
                  hint="over-billed items"
                />
              </div>

              {/* Preview table snippet */}
              <div className="max-h-64 overflow-y-auto rounded-xl border border-navy-900/10">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-navy-50 border-b border-navy-900/10 text-[10.5px] uppercase font-bold text-navy-600">
                    <tr>
                      <th className="px-3 py-2">Row</th>
                      <th className="px-3 py-2">Outcome</th>
                      <th className="px-3 py-2">Classification</th>
                      <th className="px-3 py-2">Sales Order #</th>
                      <th className="px-3 py-2">Customer</th>
                      <th className="px-3 py-2">Category</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                      <th className="px-3 py-2 text-right">Invoiced</th>
                      <th className="px-3 py-2 text-right">Remaining Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-navy-900/5 font-medium">
                    {importResult.rows.slice(0, 50).map((r, i) => {
                      const isNeg = (r.balanceAmount ?? 0) < 0;
                      return (
                        <tr key={i} className="hover:bg-navy-50/30">
                          <td className="px-3 py-2 font-mono text-navy-400">{r.rowNumber}</td>
                          <td className="px-3 py-2">
                            <span className={cn(
                              "inline-block px-1.5 py-0.5 rounded text-[10px] font-bold",
                              r.outcome === "created" ? "bg-emerald-100 text-emerald-800" :
                              r.outcome === "updated" ? "bg-blue-100 text-blue-800" :
                              "bg-red-100 text-red-800"
                            )}>
                              {r.outcome}
                            </span>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span className={cn(
                              "inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ring-1 ring-inset",
                              r.classification === "group"
                                ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
                                : "bg-orange-50 text-orange-700 ring-orange-600/20"
                            )}>
                              {r.classification === "group" ? "Group" : "Non-Group"}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-mono font-bold text-navy-900">{r.salesOrderNumber}</td>
                          <td className="px-3 py-2 truncate max-w-[140px]">{r.customerName}</td>
                          <td className="px-3 py-2">{r.category || "—"}</td>
                          <td className="px-3 py-2 text-right font-mono">{formatMoney(r.amount, r.currency)}</td>
                          <td className="px-3 py-2 text-right font-mono text-emerald-700">{formatMoney(r.invoicedAmount, r.currency)}</td>
                          <td className={cn(
                            "px-3 py-2 text-right font-mono font-bold",
                            isNeg ? "text-red-600 bg-red-50" : "text-emerald-700"
                          )}>
                            {formatMoney(r.balanceAmount, r.currency)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* ── Clear Import Data Modal ──────────────────────────── */}
      <Modal
        isOpen={clearModalOpen}
        onClose={() => { setClearModalOpen(false); setClearResult(null); setClearConfirmMode(""); }}
        title="Clear Import Data"
        size="lg"
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 leading-relaxed">
            <strong className="font-bold">⚠️ Destructive Operations</strong> — These actions permanently delete data from the database and cannot be undone. Review each option carefully before confirming.
          </div>

          {/* Result banner */}
          {clearResult && (
            <div className={cn(
              "rounded-xl border px-4 py-3 text-xs font-medium",
              clearResult.message.toLowerCase().includes("fail") || clearResult.message.toLowerCase().includes("error")
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-800"
            )}>
              ✅ {clearResult.message}
            </div>
          )}

          {/* Option 1 ── Sales orders only */}
          <div className="rounded-xl border border-navy-900/10 bg-surface p-4 space-y-3">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="9" y1="13" x2="15" y2="13" />
                </svg>
              </span>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-bold text-navy-900">Option 1 — Clear Sales Orders Only</h4>
                <p className="mt-0.5 text-xs text-navy-500 leading-relaxed">
                  Deletes all rows from the <code className="font-mono bg-navy-900/5 px-1 rounded">sales_orders</code> table.
                  All linked PMT projects are <strong>kept intact</strong>.
                  Use this when you want to re-import fresh order data without touching projects.
                </p>
              </div>
            </div>
            {clearConfirmMode === "clear_orders" ? (
              <div className="flex items-center gap-2 pt-1">
                <span className="text-xs font-semibold text-red-600">Confirm delete all sales orders?</span>
                <Button
                  size="sm"
                  onClick={() => handleClear("clear_orders")}
                  loading={clearBusy === "clear_orders"}
                  disabled={clearBusy !== ""}
                  className="h-8 px-3 text-xs font-bold bg-red-600 hover:bg-red-700 text-white"
                >
                  Yes, Delete Orders
                </Button>
                <button onClick={() => setClearConfirmMode("")} className="text-xs text-navy-500 hover:text-navy-800 underline">
                  Cancel
                </button>
              </div>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setClearConfirmMode("clear_orders")}
                disabled={clearBusy !== ""}
                className="h-8 px-3 text-xs font-semibold text-orange-700 border-orange-200 hover:bg-orange-50"
              >
                Clear Sales Orders Only
              </Button>
            )}
          </div>

          {/* Option 2 ── Sales orders + auto-created projects */}
          <div className="rounded-xl border border-navy-900/10 bg-surface p-4 space-y-3">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                  <path d="M10 11v6M14 11v6" />
                  <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
                </svg>
              </span>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-bold text-navy-900">Option 2 — Clear Orders + Auto-Created Projects</h4>
                <p className="mt-0.5 text-xs text-navy-500 leading-relaxed">
                  Deletes all <code className="font-mono bg-navy-900/5 px-1 rounded">sales_orders</code> rows <strong>and</strong> any PMT projects that were
                  auto-created by the importer (those with a Zoho Sales Order reference set).
                  Pre-existing manually created projects are <strong>not affected</strong>.
                </p>
              </div>
            </div>
            {clearConfirmMode === "clear_with_projects" ? (
              <div className="flex items-center gap-2 pt-1">
                <span className="text-xs font-semibold text-red-600">Confirm? This will delete orders + import-linked projects.</span>
                <Button
                  size="sm"
                  onClick={() => handleClear("clear_with_projects")}
                  loading={clearBusy === "clear_with_projects"}
                  disabled={clearBusy !== ""}
                  className="h-8 px-3 text-xs font-bold bg-red-600 hover:bg-red-700 text-white"
                >
                  Yes, Delete Both
                </Button>
                <button onClick={() => setClearConfirmMode("")} className="text-xs text-navy-500 hover:text-navy-800 underline">
                  Cancel
                </button>
              </div>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setClearConfirmMode("clear_with_projects")}
                disabled={clearBusy !== ""}
                className="h-8 px-3 text-xs font-semibold text-red-700 border-red-200 hover:bg-red-50"
              >
                Clear Orders &amp; Auto-Created Projects
              </Button>
            )}
          </div>

          {/* Option 3 ── Full reset (nuclear) */}
          <div className="rounded-xl border-2 border-red-300 bg-red-50/30 p-4 space-y-3">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-700">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-bold text-red-800">Option 3 — Full Reset (Nuclear)</h4>
                  <span className="rounded px-1.5 py-0.5 text-[10px] font-bold bg-red-200 text-red-800 uppercase tracking-wide">Destructive</span>
                </div>
                <p className="mt-0.5 text-xs text-red-700/80 leading-relaxed">
                  Runs <code className="font-mono bg-red-100 px-1 rounded">TRUNCATE TABLE sales_orders RESTART IDENTITY CASCADE</code> for a full table wipe,
                  then removes <strong>all</strong> projects linked to any Zoho Sales Order reference, regardless of when they were created.
                  Use only to start completely fresh.
                </p>
              </div>
            </div>
            {clearConfirmMode === "full_reset" ? (
              <div className="flex items-center gap-2 pt-1">
                <span className="text-xs font-bold text-red-700">⚠️ This cannot be undone. Confirm full reset?</span>
                <Button
                  size="sm"
                  onClick={() => handleClear("full_reset")}
                  loading={clearBusy === "full_reset"}
                  disabled={clearBusy !== ""}
                  className="h-8 px-3 text-xs font-bold bg-red-700 hover:bg-red-800 text-white shadow-sm"
                >
                  🔴 Yes, Full Reset
                </Button>
                <button onClick={() => setClearConfirmMode("")} className="text-xs text-navy-500 hover:text-navy-800 underline">
                  Cancel
                </button>
              </div>
            ) : (
              <Button
                size="sm"
                onClick={() => setClearConfirmMode("full_reset")}
                disabled={clearBusy !== ""}
                className="h-8 px-3 text-xs font-bold bg-red-700 hover:bg-red-800 text-white"
              >
                Full Reset (Truncate All)
              </Button>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
