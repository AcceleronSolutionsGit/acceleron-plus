"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Avatar } from "@/components/ui/Avatar";
import { ColorBadge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { parseSalaryPasteText } from "@/lib/salary-parser";
import { withBase } from "@/lib/base-path";

interface SalaryEmployee {
  empCode: string;
  name: string;
  designation: string;
  department: string;
  jobLevel: string;
  officeLocation: string;
  isActive: boolean;
  costOfEmployee: number | null;
  updatedAt: string | null;
  updatedBy: string | null;
  isNewJoiner: boolean;
}

interface SalariesSummary {
  totalEmployees: number;
  configuredCount: number;
  missingCount: number;
}

export function SalariesManagerClient({ currentUserEmail }: { currentUserEmail: string }) {
  const [employees, setEmployees] = useState<SalaryEmployee[]>([]);
  const [summary, setSummary] = useState<SalariesSummary>({
    totalEmployees: 0,
    configuredCount: 0,
    missingCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [downloadingFormat, setDownloadingFormat] = useState<"xlsx" | "csv" | null>(null);

  // Search & Filter state
  const [search, setSearch] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "configured" | "missing" | "joiners">("all");

  // Bulk import panel
  const [showBulkPanel, setShowBulkPanel] = useState(false);
  const [bulkMode, setBulkMode] = useState<"paste" | "file">("paste");
  const [pasteContent, setPasteContent] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSubmittingBulk, setIsSubmittingBulk] = useState(false);
  const [bulkResult, setBulkResult] = useState<{
    message: string;
    affectedAllocations: number;
    affectedProjects: number;
  } | null>(null);

  // Single employee edit modal
  const [editingEmployee, setEditingEmployee] = useState<SalaryEmployee | null>(null);
  const [editCostInput, setEditCostInput] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editModalError, setEditModalError] = useState("");

  // Add new joiner modal
  const [showAddJoinerModal, setShowAddJoinerModal] = useState(false);
  const [newJoinerEmpCode, setNewJoinerEmpCode] = useState("");
  const [newJoinerName, setNewJoinerName] = useState("");
  const [newJoinerCost, setNewJoinerCost] = useState("");
  const [isSavingJoiner, setIsSavingJoiner] = useState(false);
  const [joinerModalError, setJoinerModalError] = useState("");

  // Load salaries
  const loadSalaries = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/salaries");
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to load salaries directory.");
      }
      setEmployees(data.employees || []);
      setSummary(data.summary || {
        totalEmployees: (data.employees || []).length,
        configuredCount: 0,
        missingCount: 0,
      });
    } catch (err: any) {
      setError(err.message || "Failed to load employee salaries.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSalaries();
  }, [loadSalaries]);

  // Live validation preview for pasted text
  const pastePreview = useMemo(() => {
    if (!pasteContent.trim()) return null;
    return parseSalaryPasteText(pasteContent);
  }, [pasteContent]);

  // Filtered employees list
  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter((emp) => {
      if (filterMode === "configured" && (emp.costOfEmployee === null || emp.costOfEmployee <= 0)) {
        return false;
      }
      if (filterMode === "missing" && emp.costOfEmployee !== null && emp.costOfEmployee > 0) {
        return false;
      }
      if (filterMode === "joiners" && !emp.isNewJoiner) {
        return false;
      }
      if (!q) return true;
      return (
        emp.empCode.toLowerCase().includes(q) ||
        emp.name.toLowerCase().includes(q) ||
        emp.designation.toLowerCase().includes(q) ||
        emp.department.toLowerCase().includes(q) ||
        emp.jobLevel.toLowerCase().includes(q)
      );
    });
  }, [employees, search, filterMode]);

  // Handle template download (Excel or CSV/TSV)
  const handleDownloadTemplate = async (format: "xlsx" | "csv" = "xlsx") => {
    try {
      setDownloadingFormat(format);
      setError("");
      setNotice(`Preparing ${format === "csv" ? "TSV/CSV" : "Excel"} template...`);
      const targetUrl = withBase(`/api/admin/salaries/template?format=${format}`);
      const res = await fetch(targetUrl);
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Download failed with HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download =
        format === "csv"
          ? "employee_salaries_template.tsv"
          : "employee_salaries_template.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(blobUrl);
      setNotice(`${format === "csv" ? "TSV/CSV" : "Excel"} template downloaded successfully.`);
      setTimeout(() => setNotice(""), 3500);
    } catch (err: any) {
      console.error("Template download error:", err);
      // Fallback: direct window.location with withBase
      try {
        window.location.href = withBase(`/api/admin/salaries/template?format=${format}`);
      } catch {
        setError(err?.message || "Failed to download salary template.");
      }
    } finally {
      setDownloadingFormat(null);
    }
  };

  // Handle copy sample template to clipboard
  const handleCopyTemplate = async () => {
    try {
      const sample = [
        "emp code\tname\tcost of employee",
        "411015\tArindam Hari\t15000",
        "411001\tSample Employee\t8500",
      ].join("\n");
      await navigator.clipboard.writeText(sample);
      setNotice("Copied 3-column template (emp code, name, cost of employee) to clipboard!");
      setTimeout(() => setNotice(""), 4000);
    } catch {
      setError("Failed to copy template to clipboard.");
    }
  };

  // Handle bulk submission
  const handleSubmitBulk = async () => {
    setError("");
    setNotice("");
    setBulkResult(null);

    if (bulkMode === "paste") {
      if (!pasteContent.trim()) {
        setError("Please paste table data from Excel first.");
        return;
      }
      if (!pastePreview || pastePreview.rows.length === 0) {
        setError("No valid rows could be found in the pasted data. Please check the 3-column format.");
        return;
      }
    } else {
      if (!selectedFile) {
        setError("Please select an Excel (.xlsx) file to upload.");
        return;
      }
    }

    setIsSubmittingBulk(true);
    try {
      let res: Response;
      if (bulkMode === "file" && selectedFile) {
        const formData = new FormData();
        formData.append("file", selectedFile);
        res = await fetch("/api/admin/salaries", {
          method: "POST",
          body: formData,
        });
      } else {
        res = await fetch("/api/admin/salaries", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pasteText: pasteContent }),
        });
      }

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to update salaries.");
      }

      const outcome = data.outcome || {};
      setBulkResult({
        message: data.message || "Salaries updated successfully.",
        affectedAllocations: outcome.affectedAllocationsCount || 0,
        affectedProjects: outcome.affectedProjectsCount || 0,
      });

      setNotice(data.message || "Salaries updated successfully and propagated to projects!");
      setPasteContent("");
      setSelectedFile(null);
      await loadSalaries();
    } catch (err: any) {
      setError(err.message || "Failed to submit salaries.");
    } finally {
      setIsSubmittingBulk(false);
    }
  };

  // Open single edit modal
  const handleOpenEdit = (emp: SalaryEmployee) => {
    setEditingEmployee(emp);
    setEditCostInput(emp.costOfEmployee !== null ? String(emp.costOfEmployee) : "");
    setEditModalError("");
  };

  // Save single edit
  const handleSaveEdit = async () => {
    if (!editingEmployee) return;
    setEditModalError("");

    const costNum = parseFloat(editCostInput.replace(/[₹,\s]/g, ""));
    if (isNaN(costNum) || costNum < 0) {
      setEditModalError("Please enter a valid positive number for cost of employee.");
      return;
    }

    setIsSavingEdit(true);
    try {
      const res = await fetch(`/api/admin/salaries/${encodeURIComponent(editingEmployee.empCode)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          costOfEmployee: costNum,
          name: editingEmployee.name,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to save salary.");
      }

      setNotice(
        `Updated cost for ${editingEmployee.name} to ₹${costNum.toLocaleString("en-IN")}/day. ${
          data.employee?.allocationsUpdated ?? 0
        } project allocation(s) updated.`
      );
      setTimeout(() => setNotice(""), 5000);
      setEditingEmployee(null);
      await loadSalaries();
    } catch (err: any) {
      setEditModalError(err.message || "Failed to save employee salary.");
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Save new joiner
  const handleSaveNewJoiner = async () => {
    setJoinerModalError("");
    const empCode = newJoinerEmpCode.trim();
    const name = newJoinerName.trim();
    const costNum = parseFloat(newJoinerCost.replace(/[₹,\s]/g, ""));

    if (!empCode) {
      setJoinerModalError("Employee code is required.");
      return;
    }
    if (!name) {
      setJoinerModalError("Employee name is required.");
      return;
    }
    if (isNaN(costNum) || costNum < 0) {
      setJoinerModalError("Cost of employee must be a valid non-negative number.");
      return;
    }

    setIsSavingJoiner(true);
    try {
      const res = await fetch(`/api/admin/salaries/${encodeURIComponent(empCode)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          costOfEmployee: costNum,
          name,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to create new joiner salary.");
      }

      setNotice(`Added salary for new joiner ${name} (${empCode}) at ₹${costNum.toLocaleString("en-IN")}/day.`);
      setTimeout(() => setNotice(""), 5000);
      setShowAddJoinerModal(false);
      setNewJoinerEmpCode("");
      setNewJoinerName("");
      setNewJoinerCost("");
      await loadSalaries();
    } catch (err: any) {
      setJoinerModalError(err.message || "Failed to add new joiner salary.");
    } finally {
      setIsSavingJoiner(false);
    }
  };

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      {/* ─── Top Header & Restricted Access Pill ─────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-navy-900">
              Employee Salary & Cost Management
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-600/10 px-2.5 py-0.5 text-xs font-semibold text-red-700">
              <span className="h-1.5 w-1.5 rounded-full bg-red-600 animate-pulse" />
              Restricted to Arindam Hari
            </span>
          </div>
          <p className="mt-1 text-sm text-navy-600">
            Configure individual daily costs for employees (<strong>Daily Rate in ₹/day</strong>, i.e. Monthly CTC ÷ 22 days). Once set, these individual daily rates override grade-band averages across all project allocations and timesheets.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            loading={downloadingFormat === "xlsx"}
            onClick={() => handleDownloadTemplate("xlsx")}
            title="Download Excel spreadsheet with active employees and 3 columns"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download Excel Template
          </Button>

          <Button
            variant="secondary"
            size="sm"
            loading={downloadingFormat === "csv"}
            onClick={() => handleDownloadTemplate("csv")}
            title="Download tab-separated template for quick Excel copy-paste"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Download TSV/CSV
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={handleCopyTemplate}
            title="Copy 3-column format for direct Excel paste"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Copy Paste Template
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowAddJoinerModal(true)}
            title="Set salary for a new joiner"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            Add New Joiner
          </Button>

          <Button
            variant={showBulkPanel ? "subtle" : "primary"}
            size="sm"
            onClick={() => setShowBulkPanel((prev) => !prev)}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {showBulkPanel ? "Hide Bulk Import" : "Upload / Paste Excel"}
          </Button>
        </div>
      </div>

      {/* ─── Feedback Alerts ─────────────────────────────────────── */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 flex items-start gap-3">
          <svg className="h-5 w-5 text-red-500 shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          <div className="flex-1">
            <p className="font-semibold">Error</p>
            <p className="mt-0.5">{error}</p>
          </div>
          <button onClick={() => setError("")} className="text-red-400 hover:text-red-600">×</button>
        </div>
      )}

      {notice && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 flex items-start gap-3">
          <svg className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          <div className="flex-1">
            <p className="font-semibold">Success</p>
            <p className="mt-0.5">{notice}</p>
          </div>
          <button onClick={() => setNotice("")} className="text-emerald-400 hover:text-emerald-600">×</button>
        </div>
      )}

      {/* ─── Metric Cards ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-4 border border-navy-900/10">
          <div className="text-xs font-semibold uppercase tracking-wider text-navy-500">
            Total Employee Records
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-navy-900">{summary.totalEmployees}</span>
            <span className="text-xs text-navy-500">in master directory</span>
          </div>
        </Card>

        <Card className="p-4 border border-emerald-500/20 bg-emerald-50/30">
          <div className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
            Individual Cost Configured
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-700">{summary.configuredCount}</span>
            <span className="text-xs text-emerald-600">
              ({summary.totalEmployees > 0 ? Math.round((summary.configuredCount / summary.totalEmployees) * 100) : 0}%)
            </span>
          </div>
          <p className="mt-1 text-xs text-emerald-600">Exact individual rate applied</p>
        </Card>

        <Card className="p-4 border border-amber-500/20 bg-amber-50/30">
          <div className="text-xs font-semibold uppercase tracking-wider text-amber-700">
            Using Grade-Band Average
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-amber-700">{summary.missingCount}</span>
            <span className="text-xs text-amber-600">
              ({summary.totalEmployees > 0 ? Math.round((summary.missingCount / summary.totalEmployees) * 100) : 0}%)
            </span>
          </div>
          <p className="mt-1 text-xs text-amber-600">Fallback to M2–G5 band avg</p>
        </Card>
      </div>

      {/* ─── Bulk Import & Paste Section ─────────────────────────── */}
      {showBulkPanel && (
        <Card className="p-6 border border-navy-900/15 shadow-sm space-y-5 bg-navy-900/[0.015]">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-navy-900/10 pb-4">
            <div>
              <h2 className="text-lg font-bold text-navy-900">
                Bulk Add / Update Salaries from Excel
              </h2>
              <p className="text-sm text-navy-600 mt-0.5">
                Keep exact three columns: <strong className="text-navy-900">emp code</strong>,{" "}
                <strong className="text-navy-900">name</strong>, and{" "}
                <strong className="text-navy-900">cost of employee</strong>.
              </p>
              <div className="mt-2 inline-flex items-center gap-2 rounded-md bg-blue-50 border border-blue-200 px-3 py-1.5 text-xs text-blue-800">
                <span className="font-bold uppercase tracking-wider text-[10px] bg-blue-200/90 text-blue-900 px-1.5 py-0.5 rounded">Daily Rate</span>
                <span>The cost must be entered as <strong>Daily Cost in INR (₹/day)</strong>. If you have monthly salary, divide by 22 working days (e.g. ₹1,10,000 / month = ₹5,000 / day).</span>
              </div>
            </div>

            <div className="flex items-center gap-1 rounded-lg border border-navy-900/15 bg-surface p-1">
              <button
                type="button"
                onClick={() => setBulkMode("paste")}
                className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                  bulkMode === "paste"
                    ? "bg-navy-900 text-white shadow-xs"
                    : "text-navy-600 hover:text-navy-900"
                }`}
              >
                Copy & Paste
              </button>
              <button
                type="button"
                onClick={() => setBulkMode("file")}
                className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                  bulkMode === "file"
                    ? "bg-navy-900 text-white shadow-xs"
                    : "text-navy-600 hover:text-navy-900"
                }`}
              >
                Upload .xlsx File
              </button>
            </div>
          </div>

          {bulkMode === "paste" ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold uppercase tracking-wider text-navy-700">
                  Paste from Excel / Google Sheets (Tab or Comma-separated)
                </label>
                <div className="flex items-center gap-3 text-xs">
                  <button
                    type="button"
                    onClick={() => handleDownloadTemplate("csv")}
                    className="text-navy-600 hover:text-navy-900 underline"
                  >
                    Download TSV Template
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyTemplate}
                    className="text-navy-600 hover:text-navy-900 underline"
                  >
                    Copy Template
                  </button>
                </div>
              </div>
              <textarea
                rows={8}
                value={pasteContent}
                onChange={(e) => setPasteContent(e.target.value)}
                placeholder={`emp code\tname\tcost of employee\n411015\tArindam Hari\t15000\n411002\tSneha Sharma\t12000`}
                className="w-full font-mono text-xs rounded-lg border border-navy-900/15 p-3 text-navy-900 focus:border-navy-700 focus:outline-none focus:ring-2 focus:ring-navy-900/10 bg-surface shadow-xs"
              />

              {pastePreview && (
                <div className="rounded-lg bg-navy-50 border border-navy-100 p-3 text-xs flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-navy-800">
                      Detected: <strong>{pastePreview.rows.length}</strong> valid employee row(s)
                    </span>
                    {pastePreview.errors.length > 0 && (
                      <span className="text-amber-700 font-medium">
                        ⚠️ {pastePreview.errors.length} parsing warning(s)
                      </span>
                    )}
                  </div>
                  {pastePreview.rows.length > 0 && (
                    <span className="text-navy-500">
                      Sample: {pastePreview.rows[0].empCode} — {pastePreview.rows[0].name} (₹{pastePreview.rows[0].cost.toLocaleString("en-IN")})
                    </span>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold uppercase tracking-wider text-navy-700">
                  Upload Excel Spreadsheet (.xlsx)
                </label>
                <button
                  type="button"
                  onClick={() => handleDownloadTemplate("xlsx")}
                  className="text-xs text-navy-600 hover:text-navy-900 underline"
                >
                  Download .xlsx Template
                </button>
              </div>
              <div className="flex items-center gap-4">
                <input
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  className="text-xs text-navy-700 file:mr-3 file:rounded-md file:border-0 file:bg-navy-900 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-navy-800"
                />
                {selectedFile && (
                  <span className="text-xs font-medium text-emerald-700">
                    Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between border-t border-navy-900/10 pt-4">
            <p className="text-xs text-navy-500">
              ⚡ Updating salaries updates project team daily costs and planned costs immediately.
            </p>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowBulkPanel(false);
                  setPasteContent("");
                  setSelectedFile(null);
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                loading={isSubmittingBulk}
                onClick={handleSubmitBulk}
              >
                Apply Salaries & Propagate to Projects
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* ─── Search and Filters Bar ──────────────────────────────── */}
      <Card className="p-4 border border-navy-900/10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by emp code, name, designation, dept..."
              className="w-full rounded-lg border border-navy-900/15 py-1.5 pl-9 pr-3 text-sm text-navy-900 placeholder:text-navy-400 focus:border-navy-700 focus:outline-none focus:ring-2 focus:ring-navy-900/10"
            />
            <svg
              className="absolute left-2.5 top-2.5 h-4 w-4 text-navy-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-navy-500">Filter:</span>
            <div className="flex rounded-lg border border-navy-900/15 p-0.5 bg-surface text-xs">
              <button
                type="button"
                onClick={() => setFilterMode("all")}
                className={`rounded-md px-2.5 py-1 font-medium ${
                  filterMode === "all" ? "bg-navy-900 text-white" : "text-navy-600 hover:text-navy-900"
                }`}
              >
                All ({summary.totalEmployees})
              </button>
              <button
                type="button"
                onClick={() => setFilterMode("configured")}
                className={`rounded-md px-2.5 py-1 font-medium ${
                  filterMode === "configured" ? "bg-navy-900 text-white" : "text-navy-600 hover:text-navy-900"
                }`}
              >
                Configured ({summary.configuredCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterMode("missing")}
                className={`rounded-md px-2.5 py-1 font-medium ${
                  filterMode === "missing" ? "bg-navy-900 text-white" : "text-navy-600 hover:text-navy-900"
                }`}
              >
                Fallback ({summary.missingCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterMode("joiners")}
                className={`rounded-md px-2.5 py-1 font-medium ${
                  filterMode === "joiners" ? "bg-navy-900 text-white" : "text-navy-600 hover:text-navy-900"
                }`}
              >
                New Joiners
              </button>
            </div>
          </div>
        </div>
      </Card>

      {/* ─── Employees Directory Table ───────────────────────────── */}
      <Card className="overflow-hidden border border-navy-900/10">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-navy-900 text-white text-xs font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">emp code</th>
                <th className="py-3 px-4">name</th>
                <th className="py-3 px-4">designation / dept</th>
                <th className="py-3 px-4">grade band</th>
                <th className="py-3 px-4 text-right">cost of employee (₹/day)</th>
                <th className="py-3 px-4 text-center">cost status</th>
                <th className="py-3 px-4 text-right">actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-900/5 bg-surface text-navy-800">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-navy-500">
                    <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-navy-900 border-t-transparent" />
                    <p className="mt-2 text-xs">Loading employee salary records...</p>
                  </td>
                </tr>
              ) : filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-navy-500">
                    No employee records match the search filter.
                  </td>
                </tr>
              ) : (
                filteredEmployees.map((emp) => {
                  const hasIndividualCost = emp.costOfEmployee !== null && emp.costOfEmployee > 0;
                  return (
                    <tr
                      key={emp.empCode}
                      className="transition-colors hover:bg-navy-50/50"
                    >
                      <td className="py-3 px-4 font-mono font-medium text-navy-900">
                        {emp.empCode}
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={emp.name} size="sm" />
                          <div>
                            <span className="font-semibold text-navy-900">{emp.name}</span>
                            {emp.isNewJoiner && (
                              <span className="ml-2 inline-flex items-center rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                                New Joiner
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-xs text-navy-600">
                        <div className="font-medium text-navy-800">{emp.designation}</div>
                        <div className="text-[11px] text-navy-500">{emp.department}</div>
                      </td>

                      <td className="py-3 px-4 text-xs font-mono text-navy-700">
                        {emp.jobLevel || "—"}
                      </td>

                      <td className="py-3 px-4 text-right">
                        {hasIndividualCost ? (
                          <div className="font-mono font-bold text-emerald-700 text-sm">
                            ₹{emp.costOfEmployee!.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            <span className="text-[10px] font-normal text-navy-500"> /day</span>
                          </div>
                        ) : (
                          <div className="text-xs text-amber-700 italic">
                            Grade-band average
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4 text-center">
                        {hasIndividualCost ? (
                          <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 border border-emerald-200">
                            ● Individual Cost
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 border border-amber-200">
                            ○ Grade Band
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <Button
                          variant="secondary"
                          size="xs"
                          onClick={() => handleOpenEdit(emp)}
                        >
                          {hasIndividualCost ? "Edit Cost" : "Set Cost"}
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ─── Single Employee Edit Cost Modal ────────────────────── */}
      <Modal
        isOpen={!!editingEmployee}
        onClose={() => setEditingEmployee(null)}
        title="Edit Individual Employee Salary"
        description="Update cost rate for this employee. Project allocations and timesheets will automatically recalculate with this exact rate."
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setEditingEmployee(null)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={isSavingEdit}
              onClick={handleSaveEdit}
            >
              Save & Propagate
            </Button>
          </div>
        }
      >
        {editingEmployee && (
          <div className="space-y-4">
            {editModalError && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700">
                {editModalError}
              </div>
            )}

            <div className="rounded-lg bg-navy-50/50 p-3 border border-navy-100 flex items-center justify-between">
              <div>
                <p className="text-xs text-navy-500 uppercase tracking-wider font-semibold">Employee</p>
                <p className="text-sm font-bold text-navy-900 mt-0.5">{editingEmployee.name}</p>
                <p className="text-xs text-navy-600 font-mono">Code: {editingEmployee.empCode}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-navy-500 uppercase tracking-wider font-semibold">Designation</p>
                <p className="text-xs font-medium text-navy-800 mt-0.5">{editingEmployee.designation}</p>
                <p className="text-xs text-navy-500">Band: {editingEmployee.jobLevel || "—"}</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-navy-700">
                Cost of Employee (₹ per day - Daily Rate)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-sm text-navy-500">₹</span>
                <input
                  type="text"
                  value={editCostInput}
                  onChange={(e) => setEditCostInput(e.target.value)}
                  placeholder="e.g. 15000"
                  className="w-full rounded-lg border border-navy-900/15 pl-8 pr-3 py-1.5 text-sm text-navy-900 focus:border-navy-700 focus:outline-none focus:ring-2 focus:ring-navy-900/10"
                />
              </div>
              <p className="text-[11px] text-navy-500">
                <strong>Note:</strong> Enter <strong>Daily Cost in INR (₹/day)</strong>. If you have Monthly Salary, divide by 22 working days (e.g. ₹1,10,000 / month ÷ 22 = ₹5,000 / day). This rate overrides grade averages in all active projects.
              </p>
            </div>
          </div>
        )}
      </Modal>

      {/* ─── Add New Joiner Modal ────────────────────────────────── */}
      <Modal
        isOpen={showAddJoinerModal}
        onClose={() => setShowAddJoinerModal(false)}
        title="Add Salary for New Joiner"
        description="Set individual salary for an employee joining the organization before or during Darwinbox sync."
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowAddJoinerModal(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={isSavingJoiner}
              onClick={handleSaveNewJoiner}
            >
              Add Joiner Salary
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {joinerModalError && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700">
              {joinerModalError}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-navy-700">
              emp code (Employee Code / ID)
            </label>
            <input
              type="text"
              value={newJoinerEmpCode}
              onChange={(e) => setNewJoinerEmpCode(e.target.value)}
              placeholder="e.g. 411099"
              className="w-full rounded-lg border border-navy-900/15 px-3 py-1.5 text-sm text-navy-900 focus:border-navy-700 focus:outline-none focus:ring-2 focus:ring-navy-900/10"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-navy-700">
              name (Full Name)
            </label>
            <input
              type="text"
              value={newJoinerName}
              onChange={(e) => setNewJoinerName(e.target.value)}
              placeholder="e.g. Priya Mukherjee"
              className="w-full rounded-lg border border-navy-900/15 px-3 py-1.5 text-sm text-navy-900 focus:border-navy-700 focus:outline-none focus:ring-2 focus:ring-navy-900/10"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-navy-700">
              cost of employee (₹ per day - Daily Rate)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-sm text-navy-500">₹</span>
              <input
                type="text"
                value={newJoinerCost}
                onChange={(e) => setNewJoinerCost(e.target.value)}
                placeholder="e.g. 12500"
                className="w-full rounded-lg border border-navy-900/15 pl-8 pr-3 py-1.5 text-sm text-navy-900 focus:border-navy-700 focus:outline-none focus:ring-2 focus:ring-navy-900/10"
              />
            </div>
            <p className="text-[11px] text-navy-500">
              <strong>Note:</strong> Enter <strong>Daily Cost in INR (₹/day)</strong>. (Monthly CTC ÷ 22 working days).
            </p>
          </div>
        </div>
      </Modal>
    </div>
  );
}

