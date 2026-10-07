"use client";

import { withBase } from "@/lib/base-path";
import React, { useState, useEffect, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Combobox } from "@/components/ui/Combobox";
import { DarwinboxAutosync } from "./DarwinboxAutosync";

interface Employee {
  employee_id: string;
  company_email_id: string | null;
  full_name: string | null;
  job_level: string | null;
  designation: string | null;
  department: string | null;
  internal_department: string | null;
  office_location: string | null;
  group_company_code: string | null;
  date_of_joining: string | null;
  employee_type: string | null;
  direct_manager_employee_id: string | null;
  direct_manager_name?: string | null;
  last_synced_at: string | null;
  created_at?: string;
  updated_at?: string;
}

/** Canonical internal departments */
export const INTERNAL_DEPARTMENTS = [
  "SAP",
  "Non-SAP",
  "Director",
  "Account",
  "HR",
  "Operations",
  "IT Infra",
  "Sales",
  "Zoho",
  "Software Development",
] as const;

const DEPT_BADGE: Record<string, string> = {
  SAP: "bg-blue-100 text-blue-800 border border-blue-200",
  "Non-SAP": "bg-indigo-100 text-indigo-800 border border-indigo-200",
  Director: "bg-amber-100 text-amber-800 border border-amber-200",
  Account: "bg-emerald-100 text-emerald-800 border border-emerald-200",
  HR: "bg-rose-100 text-rose-800 border border-rose-200",
  Operations: "bg-orange-100 text-orange-800 border border-orange-200",
  "IT Infra": "bg-cyan-100 text-cyan-800 border border-cyan-200",
  Sales: "bg-violet-100 text-violet-800 border border-violet-200",
  Zoho: "bg-teal-100 text-teal-800 border border-teal-200",
  "Software Development": "bg-fuchsia-100 text-fuchsia-800 border border-fuchsia-200",
};

interface RateBand {
  id: string;
  tenant_id: string;
  band_name: string;
  level_code: string;
  daily_cost_inr: string | number;
  daily_billable_rate_inr: string | number;
  currency: string;
  effective_from: string | null;
  effective_to: string | null;
  is_active: boolean;
}

interface Company {
  id: string;
  tenant_id: string;
  name: string;
  domain: string | null;
  is_active: boolean;
  created_at: string;
}

export const DARWINBOX_GRADE_RANK: Record<string, number> = {
  M2: 1,
  G1: 2,
  SRG1: 3,
  G2: 4,
  SRG2: 5,
  G3: 6,
  SRG3: 7,
  G4: 8,
  SRG4: 9,
  G5: 10,
};

export const DARWINBOX_GRADE_SUGGESTIONS = [
  { code: "M2", label: "Tier 1: M2", defaultName: "Management Trainee / Associate", defaultCost: 2000, defaultRate: 4000 },
  { code: "G1", label: "Tier 2: G1", defaultName: "Analyst / Associate Consultant", defaultCost: 3200, defaultRate: 6400 },
  { code: "SRG1", label: "Tier 3: SRG1", defaultName: "Senior Analyst / Consultant", defaultCost: 4400, defaultRate: 8800 },
  { code: "G2", label: "Tier 4: G2", defaultName: "Senior Consultant", defaultCost: 5800, defaultRate: 11600 },
  { code: "SRG2", label: "Tier 5: SRG2", defaultName: "Associate Manager / Specialist", defaultCost: 7500, defaultRate: 15000 },
  { code: "G3", label: "Tier 6: G3", defaultName: "Manager", defaultCost: 9500, defaultRate: 19000 },
  { code: "SRG3", label: "Tier 7: SRG3", defaultName: "Senior Manager / Principal Consultant", defaultCost: 12500, defaultRate: 25000 },
  { code: "G4", label: "Tier 8: G4", defaultName: "Associate Director", defaultCost: 16500, defaultRate: 33000 },
  { code: "SRG4", label: "Tier 9: SRG4", defaultName: "Director / Practice Lead", defaultCost: 22000, defaultRate: 44000 },
  { code: "G5", label: "Tier 10: G5", defaultName: "Senior Director / Partner", defaultCost: 30000, defaultRate: 60000 },
];

interface AdminMastersClientProps {
  initialData: {
    employees: Employee[];
    totalEmployees: number;
    locations: string[];
    jobLevels: string[];
    employeeTypes: string[];
    rateBands: RateBand[];
    companies: Company[];
    stats: {
      totalEmployees: number;
      totalRateBands: number;
      totalCompanies: number;
      locationsCount: number;
      lastSyncedAt: string | null;
    };
  };
}

export function AdminMastersClient({ initialData }: AdminMastersClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"employees" | "rates" | "companies">("employees");
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Stats
  const [stats, setStats] = useState(initialData.stats);

  // Sync state
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  // Bumped after a manual sync so the Auto-sync button's history refreshes.
  const [syncRunCount, setSyncRunCount] = useState(0);

  // Employees tab state
  const [employees, setEmployees] = useState<Employee[]>(initialData.employees);
  const [totalEmployees, setTotalEmployees] = useState(initialData.totalEmployees);
  const [locations, setLocations] = useState<string[]>(initialData.locations);
  const [jobLevels, setJobLevels] = useState<string[]>(initialData.jobLevels);
  const [employeeTypes, setEmployeeTypes] = useState<string[]>(initialData.employeeTypes);

  // Employee Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLocation, setSelectedLocation] = useState("all");
  const [selectedLevel, setSelectedLevel] = useState("all");
  const [selectedType, setSelectedType] = useState("all");
  const [selectedDepartment, setSelectedDepartment] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(25);
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(false);

  // Modals for Employee
  const [isAddEmpModalOpen, setIsAddEmpModalOpen] = useState(false);
  const [isSavingEmp, setIsSavingEmp] = useState(false);
  const [empFormData, setEmpFormData] = useState<Partial<Employee>>({});

  // Rate Bands tab state
  const [rateBands, setRateBands] = useState<RateBand[]>(initialData.rateBands);
  const [editingRateBand, setEditingRateBand] = useState<RateBand | null>(null);
  const [rateBandToDelete, setRateBandToDelete] = useState<RateBand | null>(null);
  const [isEditRateModalOpen, setIsEditRateModalOpen] = useState(false);
  const [isAddRateModalOpen, setIsAddRateModalOpen] = useState(false);
  const [isSavingRate, setIsSavingRate] = useState(false);
  const [isDeletingRate, setIsDeletingRate] = useState(false);
  const [rateFormData, setRateFormData] = useState<Partial<RateBand>>({});

  // Companies tab state
  const [companies, setCompanies] = useState<Company[]>(initialData.companies);
  const [companySearch, setCompanySearch] = useState("");
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [companyToDelete, setCompanyToDelete] = useState<Company | null>(null);
  const [isEditCompanyModalOpen, setIsEditCompanyModalOpen] = useState(false);
  const [isAddCompanyModalOpen, setIsAddCompanyModalOpen] = useState(false);
  const [isSavingCompany, setIsSavingCompany] = useState(false);
  const [isDeletingCompany, setIsDeletingCompany] = useState(false);
  const [companyFormData, setCompanyFormData] = useState<Partial<Company>>({});

  // Toast / notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Fetch Employees when filters change
  const fetchEmployees = async (page = currentPage) => {
    setIsLoadingEmployees(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set("search", searchQuery);
      if (selectedLocation !== "all") params.set("location", selectedLocation);
      if (selectedLevel !== "all") params.set("job_level", selectedLevel);
      if (selectedType !== "all") params.set("employee_type", selectedType);
      if (selectedDepartment !== "all") params.set("department", selectedDepartment);
      params.set("page", String(page));
      params.set("limit", String(pageSize));

      const res = await fetch(`/api/admin/masters/employees?${params.toString()}`);
      const result = await res.json();

      if (result.success) {
        setEmployees(result.data);
        setTotalEmployees(result.meta.total);
        if (result.meta.locations) setLocations(result.meta.locations);
        if (result.meta.jobLevels) setJobLevels(result.meta.jobLevels);
        if (result.meta.employeeTypes) setEmployeeTypes(result.meta.employeeTypes);
      }
    } catch (err) {
      console.error("Failed to load employees:", err);
    } finally {
      setIsLoadingEmployees(false);
    }
  };

  // Debounced search on employee search query
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchEmployees(1);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, selectedLocation, selectedLevel, selectedType, selectedDepartment]);

  // Handle Darwinbox Sync trigger
  const handleDarwinboxSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setSyncFeedback(null);

    try {
      const res = await fetch("/api/admin/sync-employees", { method: "POST" });
      const data = await res.json();

      if (data.success) {
        setSyncFeedback({
          type: "success",
          message: data.message || "Employees synchronized successfully from Darwinbox!",
        });
        showToast("Darwinbox sync completed successfully!");
        // Refresh employees and stats
        await fetchEmployees(1);
        setCurrentPage(1);
        const statsRes = await fetch("/api/admin/masters/stats").then((r) => r.json());
        if (statsRes.success) setStats(statsRes.data);
      } else {
        setSyncFeedback({
          type: "error",
          message: data.message || data.error || "Darwinbox sync failed",
        });
      }
    } catch (err: any) {
      setSyncFeedback({
        type: "error",
        message: err.message || "Failed to trigger sync",
      });
    } finally {
      setIsSyncing(false);
      setSyncRunCount((n) => n + 1);
    }
  };



  // Create new employee
  const handleCreateEmployee = async () => {
    if (!empFormData.employee_id || !empFormData.full_name) {
      alert("Employee ID and Full Name are required");
      return;
    }
    setIsSavingEmp(true);
    try {
      const res = await fetch("/api/admin/masters/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(empFormData),
      });
      const data = await res.json();

      if (data.success) {
        setIsAddEmpModalOpen(false);
        setEmpFormData({});
        showToast(`Employee ${data.data.employee_id} created successfully!`);
        fetchEmployees(1);
        setCurrentPage(1);
      } else {
        alert(data.error || "Failed to create employee");
      }
    } catch (err: any) {
      alert("Error creating employee: " + err.message);
    } finally {
      setIsSavingEmp(false);
    }
  };

  // Save edited rate band
  const handleSaveRateBand = async () => {
    if (!editingRateBand) return;
    setIsSavingRate(true);
    try {
      const res = await fetch(`/api/admin/masters/rate-bands/${editingRateBand.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rateFormData),
      });
      const data = await res.json();

      if (data.success) {
        setRateBands((prev) =>
          prev.map((rb) => (rb.id === editingRateBand.id ? { ...rb, ...data.data } : rb))
        );
        setIsEditRateModalOpen(false);
        showToast(`Rate Band ${editingRateBand.level_code} updated successfully!`);
      } else {
        alert(data.error || "Failed to update rate band");
      }
    } catch (err: any) {
      alert("Error updating rate band: " + err.message);
    } finally {
      setIsSavingRate(false);
    }
  };

  // Create rate band
  const handleCreateRateBand = async () => {
    if (!rateFormData.band_name || !rateFormData.level_code || rateFormData.daily_cost_inr === undefined) {
      alert("Please enter Band Name, Level Code, and Daily Cost.");
      return;
    }
    setIsSavingRate(true);
    try {
      const res = await fetch("/api/admin/masters/rate-bands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...rateFormData,
          currency: rateFormData.currency || "INR",
          is_active: rateFormData.is_active !== undefined ? rateFormData.is_active : true,
        }),
      });
      const data = await res.json();

      if (data.success) {
        setRateBands((prev) => {
          const next = [...prev, data.data];
          return next.sort((a, b) => (DARWINBOX_GRADE_RANK[a.level_code] || 99) - (DARWINBOX_GRADE_RANK[b.level_code] || 99));
        });
        setIsAddRateModalOpen(false);
        setRateFormData({});
        showToast(`Rate Band ${data.data.level_code} created successfully!`);
        const statsRes = await fetch("/api/admin/masters/stats").then((r) => r.json());
        if (statsRes.success) setStats(statsRes.data);
      } else {
        alert(data.error || "Failed to create rate band");
      }
    } catch (err: any) {
      alert("Error creating rate band: " + err.message);
    } finally {
      setIsSavingRate(false);
    }
  };

  // Delete rate band trigger (opens confirmation modal)
  const handleDeleteRateBand = (rb: RateBand) => {
    setRateBandToDelete(rb);
  };

  // Perform confirmed deletion of rate band
  const handleConfirmDeleteRateBand = async () => {
    if (!rateBandToDelete) return;
    setIsDeletingRate(true);
    try {
      const res = await fetch(`/api/admin/masters/rate-bands/${rateBandToDelete.id}`, {
        method: "DELETE",
      });
      const data = await res.json();

      if (data.success) {
        if (data.deactivated) {
          setRateBands((prev) =>
            prev.map((item) => (item.id === rateBandToDelete.id ? { ...item, is_active: false } : item))
          );
        } else {
          setRateBands((prev) => prev.filter((item) => item.id !== rateBandToDelete.id));
        }
        setIsEditRateModalOpen(false);
        setRateBandToDelete(null);
        showToast(data.message || `Rate band ${rateBandToDelete.level_code} deleted successfully`);
        // Refresh stats
        const statsRes = await fetch("/api/admin/masters/stats").then((r) => r.json());
        if (statsRes.success) setStats(statsRes.data);
      } else {
        alert(data.error || "Failed to delete rate band");
      }
    } catch (err: any) {
      alert("Error deleting rate band: " + err.message);
    } finally {
      setIsDeletingRate(false);
    }
  };

  // Save edited company
  const handleSaveCompany = async () => {
    if (!editingCompany) return;
    setIsSavingCompany(true);
    try {
      const res = await fetch(`/api/admin/masters/companies/${editingCompany.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(companyFormData),
      });
      const data = await res.json();

      if (data.success) {
        setCompanies((prev) =>
          prev.map((c) => (c.id === editingCompany.id ? { ...c, ...data.data } : c))
        );
        setIsEditCompanyModalOpen(false);
        showToast(`Company ${editingCompany.name} updated successfully!`);
      } else {
        alert(data.error || "Failed to update company");
      }
    } catch (err: any) {
      alert("Error updating company: " + err.message);
    } finally {
      setIsSavingCompany(false);
    }
  };

  // Create company
  const handleCreateCompany = async () => {
    if (!companyFormData.name || !companyFormData.name.trim()) {
      alert("Please provide a Company Name.");
      return;
    }
    setIsSavingCompany(true);
    try {
      const res = await fetch("/api/admin/masters/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: companyFormData.name.trim(),
          domain: companyFormData.domain ? companyFormData.domain.trim().replace(/^@/, "") : null,
          is_active: companyFormData.is_active !== undefined ? companyFormData.is_active : true,
        }),
      });
      const data = await res.json();

      if (data.success) {
        setCompanies((prev) => [data.data, ...prev].sort((a, b) => a.name.localeCompare(b.name)));
        setIsAddCompanyModalOpen(false);
        setCompanyFormData({});
        showToast(`Company "${data.data.name}" created successfully!`);
        const statsRes = await fetch("/api/admin/masters/stats").then((r) => r.json());
        if (statsRes.success) setStats(statsRes.data);
      } else {
        alert(data.error || "Failed to create company");
      }
    } catch (err: any) {
      alert("Error creating company: " + err.message);
    } finally {
      setIsSavingCompany(false);
    }
  };

  // Delete company trigger (opens confirmation modal)
  const handleDeleteCompany = (c: Company) => {
    setCompanyToDelete(c);
  };

  // Perform confirmed deletion of company
  const handleConfirmDeleteCompany = async () => {
    if (!companyToDelete) return;
    setIsDeletingCompany(true);
    try {
      const res = await fetch(`/api/admin/masters/companies/${companyToDelete.id}`, {
        method: "DELETE",
      });
      const data = await res.json();

      if (data.success) {
        if (data.deactivated) {
          setCompanies((prev) =>
            prev.map((c) => (c.id === companyToDelete.id ? { ...c, is_active: false } : c))
          );
        } else {
          setCompanies((prev) => prev.filter((c) => c.id !== companyToDelete.id));
        }
        setIsEditCompanyModalOpen(false);
        setCompanyToDelete(null);
        showToast(data.message || `Company "${companyToDelete.name}" removed successfully`);
        // Refresh stats
        const statsRes = await fetch("/api/admin/masters/stats").then((r) => r.json());
        if (statsRes.success) setStats(statsRes.data);
      } else {
        alert(data.error || "Failed to delete company");
      }
    } catch (err: any) {
      alert("Error deleting company: " + err.message);
    } finally {
      setIsDeletingCompany(false);
    }
  };

  // Filter companies
  const filteredCompanies = useMemo(() => {
    if (!companySearch.trim()) return companies;
    const q = companySearch.toLowerCase();
    return companies.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.domain && c.domain.toLowerCase().includes(q))
    );
  }, [companies, companySearch]);

  const totalPages = Math.ceil(totalEmployees / pageSize);

  // Helper format currency
  const formatINR = (val: string | number) => {
    const num = typeof val === "string" ? parseFloat(val) : val;
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(num);
  };

  // Helper level badge styling matching Darwinbox seniority hierarchy
  const getLevelBadgeClass = (lvl: string | null) => {
    if (!lvl) return "bg-gray-100 text-gray-700 border border-gray-200";
    const u = lvl.toUpperCase();
    if (u === "M2") return "bg-slate-100 text-slate-800 border border-slate-300";
    if (u === "G1") return "bg-emerald-100 text-emerald-800 border border-emerald-300";
    if (u === "SRG1") return "bg-teal-100 text-teal-800 border border-teal-300";
    if (u === "G2") return "bg-sky-100 text-sky-800 border border-sky-300";
    if (u === "SRG2") return "bg-blue-100 text-blue-800 border border-blue-300";
    if (u === "G3") return "bg-indigo-100 text-indigo-800 border border-indigo-300";
    if (u === "SRG3") return "bg-violet-100 text-violet-800 border border-violet-300";
    if (u === "G4") return "bg-purple-100 text-purple-800 border border-purple-300";
    if (u === "SRG4") return "bg-fuchsia-100 text-fuchsia-800 border border-fuchsia-300";
    if (u === "G5") return "bg-amber-100 text-amber-900 border border-amber-300 font-bold";
    return "bg-neutral-100 text-navy-800 border border-neutral-300";
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-navy-900 text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 border border-white/10 animate-fade-in">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
          <span className="text-sm font-medium">{toastMessage}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-white rounded-2xl border border-navy-500/10 p-6 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wide uppercase bg-navy-900 text-white">
              System Admin
            </span>
            <span className="text-xs text-navy-500 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
              Live Database Active
            </span>
          </div>
          <h1 className="text-2xl font-bold text-navy-900 tracking-tight font-[family-name:var(--font-league-spartan)]">
            Master Data Control Center
          </h1>
          <p className="text-sm text-navy-500 max-w-2xl">
            Inspect, maintain, and synchronize core enterprise masters across employees (Darwinbox ASPL), project rate cards, and client accounts.
          </p>
        </div>

        {/* Action Header: Darwinbox Sync */}
        <div className="flex items-center gap-3 flex-wrap">
          <DarwinboxAutosync refreshKey={syncRunCount} />
          <button
            onClick={handleDarwinboxSync}
            disabled={isSyncing}
            className="flex items-center gap-2.5 px-4 py-2.5 bg-gradient-to-r from-navy-900 to-navy-800 hover:from-navy-800 hover:to-navy-700 text-white text-sm font-medium rounded-xl shadow-sm transition-all duration-150 disabled:opacity-50 cursor-pointer active:scale-95"
          >
            <svg
              className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
            </svg>
            <span>{isSyncing ? "Syncing Darwinbox..." : "Sync with Darwinbox"}</span>
          </button>
        </div>
      </div>

      {/* Sync Status Banner (if recent action) */}
      {syncFeedback && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between text-sm ${
            syncFeedback.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-900"
              : "bg-red-50 border-red-200 text-red-900"
          }`}
        >
          <div className="flex items-center gap-2.5">
            {syncFeedback.type === "success" ? (
              <svg className="w-5 h-5 text-emerald-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-red-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
            )}
            <span className="font-medium">{syncFeedback.message}</span>
          </div>
          <button
            onClick={() => setSyncFeedback(null)}
            className="text-xs font-semibold underline hover:opacity-75"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* KPI Stats Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-navy-500/10 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-navy-500 uppercase tracking-wider">Employee Master</span>
            <span className="p-2 bg-blue-50 text-blue-700 rounded-lg text-xs font-bold">ASPL</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-navy-900 font-[family-name:var(--font-league-spartan)]">
              {stats.totalEmployees}
            </span>
            <span className="text-xs text-navy-500">synced staff</span>
          </div>
          <p suppressHydrationWarning className="mt-1 text-[11px] text-navy-500 truncate">
            {isMounted && stats.lastSyncedAt
              ? `Last synced: ${new Date(stats.lastSyncedAt).toLocaleDateString()} ${new Date(stats.lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
              : stats.lastSyncedAt ? "Synced via Darwinbox API" : "Never synced"}
          </p>
        </div>

        <div className="bg-white rounded-xl border border-navy-500/10 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-navy-500 uppercase tracking-wider">Office Hubs</span>
            <span className="p-2 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-bold">Centers</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-navy-900 font-[family-name:var(--font-league-spartan)]">
              {stats.locationsCount}
            </span>
            <span className="text-xs text-navy-500">work locations</span>
          </div>
          <p className="mt-1 text-[11px] text-navy-500 truncate">Kolkata, Panagarh, and regional hubs</p>
        </div>

        <div className="bg-white rounded-xl border border-navy-500/10 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-navy-500 uppercase tracking-wider">Rate Bands</span>
            <span className="p-2 bg-purple-50 text-purple-700 rounded-lg text-xs font-bold">L1-L5</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-navy-900 font-[family-name:var(--font-league-spartan)]">
              {stats.totalRateBands}
            </span>
            <span className="text-xs text-navy-500">financial tiers</span>
          </div>
          <p className="mt-1 text-[11px] text-navy-500 truncate">Controls PMT costing & timesheets</p>
        </div>

        <div className="bg-white rounded-xl border border-navy-500/10 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-navy-500 uppercase tracking-wider">Client Companies</span>
            <span className="p-2 bg-amber-50 text-amber-700 rounded-lg text-xs font-bold">Clients</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-navy-900 font-[family-name:var(--font-league-spartan)]">
              {stats.totalCompanies}
            </span>
            <span className="text-xs text-navy-500">organizations</span>
          </div>
          <p className="mt-1 text-[11px] text-navy-500 truncate">GCPL, GEPL & external tenants</p>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="bg-white rounded-2xl border border-navy-500/10 shadow-sm overflow-hidden">
        <div className="border-b border-navy-500/10 px-6 pt-3 flex items-center gap-6">
          <button
            onClick={() => setActiveTab("employees")}
            className={`pb-3.5 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
              activeTab === "employees"
                ? "border-navy-900 text-navy-900"
                : "border-transparent text-navy-500 hover:text-navy-700"
            }`}
          >
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
            </svg>
            <span>Employee Master</span>
            <span className="px-2 py-0.5 text-xs rounded-full bg-navy-100 text-navy-900 font-bold">
              {totalEmployees}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("rates")}
            className={`pb-3.5 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
              activeTab === "rates"
                ? "border-navy-900 text-navy-900"
                : "border-transparent text-navy-500 hover:text-navy-700"
            }`}
          >
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
              <path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd" />
            </svg>
            <span>Rate Bands Master</span>
            <span className="px-2 py-0.5 text-xs rounded-full bg-navy-100 text-navy-900 font-bold">
              {rateBands.length}
            </span>
          </button>

          <a
            href={withBase("/admin/skills")}
            className="pb-3.5 text-sm font-semibold flex items-center gap-2 border-b-2 border-transparent text-navy-500 hover:text-navy-700 transition-colors cursor-pointer"
            title="The skill catalogue, and who holds what"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2l2.6 6.3 6.8.5-5.2 4.4 1.6 6.6L12 16.3 6.2 19.8l1.6-6.6L2.6 8.8l6.8-.5z"
                strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>Skills &amp; Resource Mapping</span>
            <svg className="w-3 h-3 opacity-50" viewBox="0 0 20 20" fill="currentColor">
              <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
              <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
            </svg>
          </a>

          <button
            onClick={() => setActiveTab("companies")}
            className={`pb-3.5 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
              activeTab === "companies"
                ? "border-navy-900 text-navy-900"
                : "border-transparent text-navy-500 hover:text-navy-700"
            }`}
          >
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 110 2h-3a1 1 0 01-1-1v-2a1 1 0 00-1-1H9a1 1 0 00-1 1v2a1 1 0 01-1 1H4a1 1 0 110-2V4zm3 1h2v2H7V5zm2 4H7v2h2V9zm2-4h2v2h-2V5zm2 4h-2v2h2V9z" clipRule="evenodd" />
            </svg>
            <span>Client Companies</span>
            <span className="px-2 py-0.5 text-xs rounded-full bg-navy-100 text-navy-900 font-bold">
              {companies.length}
            </span>
          </button>
        </div>

        {/* ════════════════════════════════════════════════════════════════
            TAB 1: EMPLOYEE MASTER
            ════════════════════════════════════════════════════════════════ */}
        {activeTab === "employees" && (
          <div className="p-6 space-y-5">
            {/* Filter and Search Toolbar */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex-1 flex flex-wrap items-center gap-3">
                {/* Search input */}
                <div className="relative min-w-[260px] flex-1 max-w-md">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-navy-400">
                    <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                    </svg>
                  </span>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by name, ID, email, location..."
                    className="w-full pl-9 pr-4 py-2 bg-neutral-50 border border-navy-500/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-navy-900 focus:bg-white transition-all"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-navy-400 hover:text-navy-700"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                    </button>
                  )}
                </div>

                {/* Location Filter */}
                <Combobox
                  className="min-w-[200px]"
                  value={selectedLocation}
                  onChange={setSelectedLocation}
                  placeholder="All Locations"
                  searchPlaceholder="Search locations…"
                  options={[
                    { value: "all", label: "All Locations", hint: String(locations.length) },
                    ...locations.map((loc) => ({ value: loc, label: loc })),
                  ]}
                />

                {/* Job Level Filter */}
                <Combobox
                  className="min-w-[180px]"
                  value={selectedLevel}
                  onChange={setSelectedLevel}
                  placeholder="All Levels"
                  searchPlaceholder="Search grades…"
                  options={[
                    { value: "all", label: "All Levels", hint: String(jobLevels.length) },
                    ...jobLevels.map((lvl) => ({ value: lvl, label: lvl })),
                  ]}
                />

                {/* Employee Type Filter */}
                <Combobox
                  className="min-w-[190px]"
                  value={selectedType}
                  onChange={setSelectedType}
                  placeholder="All Types"
                  searchPlaceholder="Search types…"
                  options={[
                    { value: "all", label: "All Types" },
                    ...employeeTypes.map((t) => ({ value: t, label: t })),
                  ]}
                />

                {/* Department Filter */}
                <Combobox
                  className="min-w-[190px]"
                  value={selectedDepartment}
                  onChange={setSelectedDepartment}
                  placeholder="All Departments"
                  searchPlaceholder="Search departments…"
                  options={[
                    { value: "all", label: "All Departments", hint: String(INTERNAL_DEPARTMENTS.length) },
                    ...INTERNAL_DEPARTMENTS.map((d) => ({ value: d, label: d })),
                  ]}
                />

                {/* Reset button if filtered */}
                {(searchQuery || selectedLocation !== "all" || selectedLevel !== "all" || selectedType !== "all" || selectedDepartment !== "all") && (
                  <button
                    onClick={() => {
                      setSearchQuery("");
                      setSelectedLocation("all");
                      setSelectedLevel("all");
                      setSelectedType("all");
                      setSelectedDepartment("all");
                    }}
                    className="px-3 py-2 text-xs font-semibold text-navy-600 hover:text-navy-900 bg-neutral-100 hover:bg-neutral-200 rounded-xl transition-colors cursor-pointer"
                  >
                    Reset Filters
                  </button>
                )}
              </div>

              {/* Add Employee Button */}
              <button
                onClick={() => {
                  setEmpFormData({
                    group_company_code: "ASPL",
                    employee_type: "Full Time",
                  });
                  setIsAddEmpModalOpen(true);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-navy-900 text-white rounded-xl text-sm font-medium hover:bg-navy-800 transition-colors shadow-sm cursor-pointer whitespace-nowrap"
              >
                <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
                <span>Add Employee</span>
              </button>
            </div>

            {/* Employee Data Table */}
            <div className="border border-navy-500/10 rounded-xl overflow-hidden bg-white shadow-sm relative">
              {isLoadingEmployees && (
                <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] flex items-center justify-center z-10">
                  <div className="flex items-center gap-2 px-4 py-2 bg-navy-900 text-white text-xs font-medium rounded-lg shadow-lg">
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <circle cx="12" cy="12" r="10" strokeWidth="4" className="opacity-25" />
                      <path fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    <span>Loading employees...</span>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-neutral-50/80 border-b border-navy-500/10 text-xs font-semibold text-navy-500 uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Employee</th>
                      <th className="px-4 py-3">Emp ID</th>
                      <th className="px-4 py-3">Designation</th>
                      <th className="px-4 py-3">Department</th>
                      <th className="px-4 py-3">Job Level</th>
                      <th className="px-4 py-3">Office Location</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Joining Date</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-navy-500/10">
                    {employees.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="px-6 py-12 text-center text-navy-500">
                          <div className="flex flex-col items-center justify-center gap-2">
                            <svg className="w-8 h-8 text-navy-300" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                            </svg>
                            <p className="font-medium text-navy-700">No employees match your filter</p>
                            <p className="text-xs text-navy-400">Try adjusting your search query or reset filters.</p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      employees.map((emp) => (
                        <tr key={emp.employee_id} className="hover:bg-neutral-50/60 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-navy-900 text-white flex items-center justify-center font-bold text-xs flex-shrink-0">
                                {emp.full_name
                                  ? emp.full_name
                                      .split(" ")
                                      .map((n) => n[0])
                                      .join("")
                                      .slice(0, 2)
                                      .toUpperCase()
                                  : "EM"}
                              </div>
                              <div className="min-w-0">
                                <p className="font-semibold text-navy-900 truncate">
                                  {emp.full_name || "Unnamed"}
                                </p>
                                <p className="text-xs text-navy-500 truncate">
                                  {emp.company_email_id || "No email assigned"}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md font-mono text-xs font-semibold bg-neutral-100 text-navy-800 border border-neutral-200">
                              {emp.employee_id}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {emp.designation ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-navy-50 text-navy-700 border border-navy-200 max-w-[160px] truncate">
                                {emp.designation}
                              </span>
                            ) : (
                              <span className="text-xs text-navy-400">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {(emp.internal_department || emp.department) ? (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                                DEPT_BADGE[emp.internal_department ?? ""] ?? "bg-neutral-100 text-navy-600 border border-neutral-200"
                              }`}>
                                {emp.internal_department || emp.department}
                                {emp.internal_department && (
                                  <span className="ml-1 opacity-60 font-normal text-[10px]">↑</span>
                                )}
                              </span>
                            ) : (
                              <span className="text-xs text-navy-400">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${getLevelBadgeClass(emp.job_level)}`}>
                              {emp.job_level || "—"}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5 text-xs text-navy-700 max-w-[200px] truncate">
                              <svg className="w-3.5 h-3.5 text-navy-400 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                              </svg>
                              <span className="truncate">{emp.office_location || "—"}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs text-navy-600 bg-neutral-100 px-2 py-0.5 rounded">
                              {emp.employee_type || "Full Time"}
                            </span>
                          </td>
                          <td suppressHydrationWarning className="px-4 py-3 text-xs text-navy-600">
                            {emp.date_of_joining || "—"}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => {
                                router.push(`/admin/masters/employees/${emp.employee_id}`);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-navy-700 bg-neutral-100 hover:bg-navy-900 hover:text-white rounded-lg transition-colors cursor-pointer"
                            >
                              <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                              </svg>
                              <span>Edit</span>
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Table Footer / Pagination */}
              <div className="px-4 py-3 bg-neutral-50/50 border-t border-navy-500/10 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-navy-500">
                <span>
                  Showing {employees.length > 0 ? (currentPage - 1) * pageSize + 1 : 0} to{" "}
                  {Math.min(currentPage * pageSize, totalEmployees)} of {totalEmployees} employees
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const newPage = Math.max(1, currentPage - 1);
                      setCurrentPage(newPage);
                      fetchEmployees(newPage);
                    }}
                    disabled={currentPage <= 1 || isLoadingEmployees}
                    className="px-3 py-1.5 border border-navy-500/20 rounded-lg text-xs font-medium bg-white hover:bg-neutral-50 disabled:opacity-40 cursor-pointer"
                  >
                    Previous
                  </button>
                  <span className="font-semibold text-navy-900">
                    Page {currentPage} of {totalPages || 1}
                  </span>
                  <button
                    onClick={() => {
                      const newPage = Math.min(totalPages, currentPage + 1);
                      setCurrentPage(newPage);
                      fetchEmployees(newPage);
                    }}
                    disabled={currentPage >= totalPages || isLoadingEmployees}
                    className="px-3 py-1.5 border border-navy-500/20 rounded-lg text-xs font-medium bg-white hover:bg-neutral-50 disabled:opacity-40 cursor-pointer"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            TAB 2: RATE BANDS MASTER
            ════════════════════════════════════════════════════════════════ */}
        {activeTab === "rates" && (
          <div className="p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-navy-900">Consultant Rate Bands & Darwinbox Grade Mapping</h3>
                <p className="text-xs text-navy-500">
                  Directly maps Darwinbox employee grades (M2 to G5) to financial cost rate and billable cards for PMT effort estimation and timesheet costing.
                </p>
              </div>
              <button
                onClick={() => {
                  setRateFormData({
                    currency: "INR",
                    is_active: true,
                  });
                  setIsAddRateModalOpen(true);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-navy-900 text-white rounded-xl text-sm font-medium hover:bg-navy-800 transition-colors shadow-sm cursor-pointer whitespace-nowrap self-start"
              >
                <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
                <span>Add Rate Band</span>
              </button>
            </div>

            {/* Official Darwinbox Seniority Progression Banner */}
            <div className="bg-navy-900 text-white rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-2 text-xs shadow-sm">
              <span className="font-semibold text-white/80 uppercase text-[11px] tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                Official Darwinbox Seniority Progression (Lower → Higher):
              </span>
              <div className="flex flex-wrap items-center gap-1 font-mono text-[11px]">
                {["M2", "G1", "SRG1", "G2", "SRG2", "G3", "SRG3", "G4", "SRG4", "G5"].map((code, idx) => (
                  <React.Fragment key={code}>
                    <span className="px-2 py-0.5 rounded bg-white/10 font-bold hover:bg-white/20">
                      Tier {idx + 1}: {code}
                    </span>
                    {idx < 9 && <span className="text-blue-300 font-sans">→</span>}
                  </React.Fragment>
                ))}
              </div>
            </div>

            {/* Rate Bands Grid Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {rateBands.map((rb) => {
                const cost = typeof rb.daily_cost_inr === "string" ? parseFloat(rb.daily_cost_inr) : rb.daily_cost_inr;
                const rate = typeof rb.daily_billable_rate_inr === "string" ? parseFloat(rb.daily_billable_rate_inr) : rb.daily_billable_rate_inr;
                const margin = rate > 0 ? (((rate - cost) / rate) * 100).toFixed(1) : "0.0";
                const rank = DARWINBOX_GRADE_RANK[rb.level_code];

                return (
                  <div
                    key={rb.id}
                    className="bg-white rounded-xl border border-navy-500/15 p-5 shadow-sm hover:border-navy-900/30 transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-1.5">
                          <span className="px-2.5 py-1 rounded-lg text-xs font-bold font-mono bg-navy-900 text-white">
                            {rb.level_code}
                          </span>
                          {rank && (
                            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-purple-100 text-purple-900 border border-purple-200">
                              Tier {rank}
                            </span>
                          )}
                        </div>
                        <span
                          className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                            rb.is_active ? "bg-emerald-100 text-emerald-800" : "bg-neutral-100 text-neutral-500"
                          }`}
                        >
                          {rb.is_active ? "Active" : "Inactive"}
                        </span>
                      </div>
                      <h4 className="text-base font-bold text-navy-900 mb-4">{rb.band_name}</h4>

                      <div className="space-y-2 bg-neutral-50 p-3 rounded-lg border border-neutral-100">
                        <div className="flex justify-between text-xs items-center">
                          <span className="text-navy-500">Daily Internal Cost:</span>
                          <span className="font-bold text-navy-900 text-sm">{formatINR(cost)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-navy-500/10 flex justify-between items-center">
                      <button
                        onClick={() => handleDeleteRateBand(rb)}
                        disabled={isDeletingRate}
                        className="text-xs font-semibold text-red-600 hover:text-red-800 flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                        title={`Delete ${rb.level_code}`}
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        <span>Delete</span>
                      </button>

                      <button
                        onClick={() => {
                          setEditingRateBand(rb);
                          setRateFormData({
                            band_name: rb.band_name,
                            level_code: rb.level_code,
                            daily_cost_inr: cost,
                            daily_billable_rate_inr: rate,
                            is_active: rb.is_active,
                          });
                          setIsEditRateModalOpen(true);
                        }}
                        className="text-xs font-semibold text-navy-700 hover:text-navy-900 flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-neutral-100 transition-colors cursor-pointer"
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                        </svg>
                        <span>Edit Rates</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            TAB 3: CLIENT COMPANIES MASTER
            ════════════════════════════════════════════════════════════════ */}
        {activeTab === "companies" && (
          <div className="p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="relative min-w-[280px] max-w-md">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-navy-400">
                  <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                  </svg>
                </span>
                <input
                  type="text"
                  value={companySearch}
                  onChange={(e) => setCompanySearch(e.target.value)}
                  placeholder="Filter companies or domains..."
                  className="w-full pl-9 pr-4 py-2 bg-neutral-50 border border-navy-500/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-navy-900 focus:bg-white"
                />
              </div>

              <button
                onClick={() => {
                  setCompanyFormData({ is_active: true });
                  setIsAddCompanyModalOpen(true);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-navy-900 text-white rounded-xl text-sm font-medium hover:bg-navy-800 transition-colors shadow-sm cursor-pointer whitespace-nowrap self-start"
              >
                <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
                <span>Add Company</span>
              </button>
            </div>

            <div className="border border-navy-500/10 rounded-xl overflow-hidden bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-neutral-50/80 border-b border-navy-500/10 text-xs font-semibold text-navy-500 uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Company Name</th>
                      <th className="px-4 py-3">Domain</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Registered At</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-navy-500/10">
                    {filteredCompanies.map((c) => (
                      <tr key={c.id} className="hover:bg-neutral-50/60 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-navy-900">{c.name}</div>
                        </td>
                        <td className="px-4 py-3">
                          {c.domain ? (
                            <span className="inline-flex items-center gap-1 font-mono text-xs text-navy-700 bg-neutral-100 px-2 py-0.5 rounded">
                              @{c.domain.replace(/^@/, "")}
                            </span>
                          ) : (
                            <span className="text-xs text-navy-400">No domain bound</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                              c.is_active ? "bg-emerald-100 text-emerald-800" : "bg-neutral-100 text-neutral-500"
                            }`}
                          >
                            {c.is_active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td suppressHydrationWarning className="px-4 py-3 text-xs text-navy-500">
                          {isMounted && c.created_at ? new Date(c.created_at).toLocaleDateString() : "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-1.5 justify-end">
                            <button
                              onClick={() => {
                                setEditingCompany(c);
                                setCompanyFormData({
                                  name: c.name,
                                  domain: c.domain || "",
                                  is_active: c.is_active,
                                });
                                setIsEditCompanyModalOpen(true);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-navy-700 bg-neutral-100 hover:bg-navy-900 hover:text-white rounded-lg transition-colors cursor-pointer"
                            >
                              <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                              </svg>
                              <span>Edit</span>
                            </button>
                            <button
                              onClick={() => handleDeleteCompany(c)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                              title={`Delete ${c.name}`}
                            >
                              <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                              </svg>
                              <span>Delete</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════════


      {/* ════════════════════════════════════════════════════════════════
          MODAL: ADD EMPLOYEE
          ════════════════════════════════════════════════════════════════ */}
      <Modal
        isOpen={isAddEmpModalOpen}
        onClose={() => setIsAddEmpModalOpen(false)}
        title="Add Employee Master Record"
        footer={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsAddEmpModalOpen(false)}
              className="px-4 py-2 text-sm font-medium text-navy-600 hover:text-navy-900 bg-neutral-100 rounded-xl"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateEmployee}
              disabled={isSavingEmp}
              className="px-4 py-2 text-sm font-medium text-white bg-navy-900 hover:bg-navy-800 rounded-xl disabled:opacity-50 flex items-center gap-2"
            >
              {isSavingEmp && <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>}
              Create Employee
            </button>
          </div>
        }
      >
        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-navy-700 mb-1">Employee ID *</label>
              <input
                type="text"
                required
                value={empFormData.employee_id || ""}
                onChange={(e) => setEmpFormData({ ...empFormData, employee_id: e.target.value })}
                placeholder="e.g. 411200"
                className="w-full px-3 py-2 border border-navy-500/20 rounded-xl text-sm focus:ring-2 focus:ring-navy-900 focus:outline-none font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-navy-700 mb-1">Company Code</label>
              <input
                type="text"
                value={empFormData.group_company_code || "ASPL"}
                onChange={(e) => setEmpFormData({ ...empFormData, group_company_code: e.target.value })}
                className="w-full px-3 py-2 border border-navy-500/20 rounded-xl text-sm bg-neutral-100 text-navy-800 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-navy-700 mb-1">Full Name *</label>
            <input
              type="text"
              required
              value={empFormData.full_name || ""}
              onChange={(e) => setEmpFormData({ ...empFormData, full_name: e.target.value })}
              placeholder="e.g. Jane Doe"
              className="w-full px-3 py-2 border border-navy-500/20 rounded-xl text-sm focus:ring-2 focus:ring-navy-900 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-navy-700 mb-1">Company Email</label>
            <input
              type="email"
              value={empFormData.company_email_id || ""}
              onChange={(e) => setEmpFormData({ ...empFormData, company_email_id: e.target.value })}
              placeholder="jane.doe@acceleronsolutions.io"
              className="w-full px-3 py-2 border border-navy-500/20 rounded-xl text-sm focus:ring-2 focus:ring-navy-900 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-navy-700 mb-1 flex items-center gap-1.5">
              Designation
              <span className="text-[10px] font-normal text-navy-400 normal-case">(from Darwinbox)</span>
            </label>
            <input
              type="text"
              value={empFormData.designation || ""}
              onChange={(e) => setEmpFormData({ ...empFormData, designation: e.target.value })}
              placeholder="e.g. Senior Consultant"
              className="w-full px-3 py-2 border border-navy-500/20 rounded-xl text-sm focus:ring-2 focus:ring-navy-900 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-navy-700 mb-1 flex items-center gap-1.5">
              Internal Department
              <span className="text-[10px] font-normal text-navy-400 normal-case">(Acceleron team)</span>
            </label>
            <select
              value={empFormData.internal_department || ""}
              onChange={(e) => setEmpFormData({ ...empFormData, internal_department: e.target.value })}
              className="w-full px-3 py-2 border border-navy-500/20 rounded-xl text-sm focus:ring-2 focus:ring-navy-900 focus:outline-none bg-white"
            >
              <option value="">— Not assigned —</option>
              {INTERNAL_DEPARTMENTS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-navy-700 mb-1">Job Level</label>
              <input
                type="text"
                value={empFormData.job_level || ""}
                onChange={(e) => setEmpFormData({ ...empFormData, job_level: e.target.value })}
                placeholder="e.g. SRG2"
                className="w-full px-3 py-2 border border-navy-500/20 rounded-xl text-sm focus:ring-2 focus:ring-navy-900 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-navy-700 mb-1">Employee Type</label>
              <select
                value={empFormData.employee_type || "Full Time"}
                onChange={(e) => setEmpFormData({ ...empFormData, employee_type: e.target.value })}
                className="w-full px-3 py-2 border border-navy-500/20 rounded-xl text-sm focus:ring-2 focus:ring-navy-900 focus:outline-none bg-white"
              >
                <option value="Full Time">Full Time</option>
                <option value="Part Time">Part Time</option>
                <option value="Contract">Contract</option>
                <option value="Intern">Intern</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-navy-700 mb-1">Office Location</label>
            <input
              type="text"
              value={empFormData.office_location || ""}
              onChange={(e) => setEmpFormData({ ...empFormData, office_location: e.target.value })}
              placeholder="e.g. Kolkata, West Bengal"
              className="w-full px-3 py-2 border border-navy-500/20 rounded-xl text-sm focus:ring-2 focus:ring-navy-900 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-navy-700 mb-1">Reporting Manager</label>
            <input
              type="text"
              value={empFormData.direct_manager_name || ""}
              onChange={(e) => setEmpFormData({ ...empFormData, direct_manager_name: e.target.value })}
              placeholder="e.g. Anirban Dey Sarkar"
              className="w-full px-3 py-2 border border-navy-500/20 rounded-xl text-sm focus:ring-2 focus:ring-navy-900 focus:outline-none"
            />
          </div>
        </div>
      </Modal>

      {/* ════════════════════════════════════════════════════════════════
          MODAL: EDIT RATE BAND
          ════════════════════════════════════════════════════════════════ */}
      <Modal
        isOpen={isEditRateModalOpen}
        onClose={() => setIsEditRateModalOpen(false)}
        title={`Edit Rate Band ${editingRateBand?.level_code}`}
        footer={
          <div className="flex items-center justify-between w-full">
            {editingRateBand && (
              <button
                onClick={() => handleDeleteRateBand(editingRateBand)}
                disabled={isDeletingRate}
                className="px-3 py-2 text-xs font-semibold text-red-600 hover:text-red-800 hover:bg-red-50 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <span>Delete Band</span>
              </button>
            )}
            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={() => setIsEditRateModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-navy-600 hover:text-navy-900 bg-neutral-100 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveRateBand}
                disabled={isSavingRate}
                className="px-4 py-2 text-sm font-medium text-white bg-navy-900 hover:bg-navy-800 rounded-xl disabled:opacity-50 flex items-center gap-2 cursor-pointer"
              >
                {isSavingRate && <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>}
                Save Rates
              </button>
            </div>
          </div>
        }
      >
        <div className="space-y-4 text-sm">
          <div>
            <label className="block text-xs font-semibold text-navy-700 mb-1">Band Name</label>
            <input
              type="text"
              value={rateFormData.band_name || ""}
              onChange={(e) => setRateFormData({ ...rateFormData, band_name: e.target.value })}
              className="w-full px-3 py-2 border border-navy-500/20 rounded-xl text-sm focus:ring-2 focus:ring-navy-900 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="block text-xs font-semibold text-navy-700 mb-1">Daily Cost (INR)</label>
              <input
                type="number"
                value={rateFormData.daily_cost_inr !== undefined ? rateFormData.daily_cost_inr : ""}
                onChange={(e) => setRateFormData({ ...rateFormData, daily_cost_inr: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 border border-navy-500/20 rounded-xl text-sm focus:ring-2 focus:ring-navy-900 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="is_active_rate"
              checked={Boolean(rateFormData.is_active)}
              onChange={(e) => setRateFormData({ ...rateFormData, is_active: e.target.checked })}
              className="rounded border-navy-300 text-navy-900 focus:ring-navy-900"
            />
            <label htmlFor="is_active_rate" className="text-xs font-semibold text-navy-800 cursor-pointer">
              Band is Active for Project Solutioning & Timesheets
            </label>
          </div>
        </div>
      </Modal>

      {/* ════════════════════════════════════════════════════════════════
          MODAL: EDIT COMPANY
          ════════════════════════════════════════════════════════════════ */}
      <Modal
        isOpen={isEditCompanyModalOpen}
        onClose={() => setIsEditCompanyModalOpen(false)}
        title={`Edit Company: ${editingCompany?.name}`}
        footer={
          <div className="flex items-center justify-between w-full">
            {editingCompany && (
              <button
                onClick={() => {
                  handleDeleteCompany(editingCompany);
                }}
                disabled={isDeletingCompany}
                className="px-3 py-2 text-xs font-semibold text-red-600 hover:text-red-800 hover:bg-red-50 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <span>Delete Company</span>
              </button>
            )}
            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={() => setIsEditCompanyModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-navy-600 hover:text-navy-900 bg-neutral-100 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCompany}
                disabled={isSavingCompany}
                className="px-4 py-2 text-sm font-medium text-white bg-navy-900 hover:bg-navy-800 rounded-xl disabled:opacity-50 flex items-center gap-2 cursor-pointer"
              >
                {isSavingCompany && <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>}
                Save Changes
              </button>
            </div>
          </div>
        }
      >
        <div className="space-y-4 text-sm">
          <div>
            <label className="block text-xs font-semibold text-navy-700 mb-1">Company Name</label>
            <input
              type="text"
              value={companyFormData.name || ""}
              onChange={(e) => setCompanyFormData({ ...companyFormData, name: e.target.value })}
              className="w-full px-3 py-2 border border-navy-500/20 rounded-xl text-sm focus:ring-2 focus:ring-navy-900 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-navy-700 mb-1">Email Domain</label>
            <input
              type="text"
              value={companyFormData.domain || ""}
              onChange={(e) => setCompanyFormData({ ...companyFormData, domain: e.target.value.replace(/^@/, "") })}
              placeholder="e.g. gainwellindia.com"
              className="w-full px-3 py-2 border border-navy-500/20 rounded-xl text-sm focus:ring-2 focus:ring-navy-900 focus:outline-none font-mono"
            />
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="is_active_company"
              checked={Boolean(companyFormData.is_active)}
              onChange={(e) => setCompanyFormData({ ...companyFormData, is_active: e.target.checked })}
              className="rounded border-navy-300 text-navy-900 focus:ring-navy-900"
            />
            <label htmlFor="is_active_company" className="text-xs font-semibold text-navy-800 cursor-pointer">
              Active Client Company
            </label>
          </div>
        </div>
      </Modal>

      {/* ════════════════════════════════════════════════════════════════
          MODAL: ADD RATE BAND
          ════════════════════════════════════════════════════════════════ */}
      <Modal
        isOpen={isAddRateModalOpen}
        onClose={() => setIsAddRateModalOpen(false)}
        title="Add Consultant Rate Band"
        footer={
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => setIsAddRateModalOpen(false)}
              className="px-4 py-2 text-sm font-medium text-navy-600 hover:text-navy-900 bg-neutral-100 rounded-xl cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateRateBand}
              disabled={isSavingRate}
              className="px-4 py-2 text-sm font-medium text-white bg-navy-900 hover:bg-navy-800 rounded-xl disabled:opacity-50 flex items-center gap-2 cursor-pointer shadow-sm"
            >
              {isSavingRate && <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>}
              Create Rate Band
            </button>
          </div>
        }
      >
        <div className="space-y-4 text-sm">
          <div>
            <label className="block text-xs font-semibold text-navy-700 mb-1">
              Select Darwinbox Seniority Grade Tier
            </label>
            <select
              value={rateFormData.level_code || ""}
              onChange={(e) => {
                const selectedCode = e.target.value;
                const match = DARWINBOX_GRADE_SUGGESTIONS.find((s) => s.code === selectedCode);
                setRateFormData({
                  ...rateFormData,
                  level_code: selectedCode,
                  band_name: match ? match.defaultName : rateFormData.band_name || "",
                  daily_cost_inr: match ? match.defaultCost : rateFormData.daily_cost_inr,
                });
              }}
              className="w-full px-3 py-2 border border-navy-500/20 rounded-xl text-sm focus:ring-2 focus:ring-navy-900 focus:outline-none bg-white font-medium"
            >
              <option value="">-- Choose Grade Tier (M2 to G5) or Custom --</option>
              {DARWINBOX_GRADE_SUGGESTIONS.map((g) => (
                <option key={g.code} value={g.code}>
                  {g.label} ({g.defaultName})
                </option>
              ))}
              <option value="CUSTOM">Custom Grade Code...</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-navy-700 mb-1">Grade / Level Code *</label>
              <input
                type="text"
                required
                value={rateFormData.level_code === "CUSTOM" ? "" : rateFormData.level_code || ""}
                onChange={(e) => setRateFormData({ ...rateFormData, level_code: e.target.value.toUpperCase() })}
                placeholder="e.g. G2"
                className="w-full px-3 py-2 border border-navy-500/20 rounded-xl text-sm focus:ring-2 focus:ring-navy-900 focus:outline-none font-mono uppercase font-bold"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-navy-700 mb-1">Currency</label>
              <input
                type="text"
                value={rateFormData.currency || "INR"}
                disabled
                className="w-full px-3 py-2 border border-navy-500/20 rounded-xl text-sm bg-neutral-100 text-navy-800 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-navy-700 mb-1">Band Title / Designation *</label>
            <input
              type="text"
              required
              value={rateFormData.band_name || ""}
              onChange={(e) => setRateFormData({ ...rateFormData, band_name: e.target.value })}
              placeholder="e.g. Senior Consultant / Architect"
              className="w-full px-3 py-2 border border-navy-500/20 rounded-xl text-sm focus:ring-2 focus:ring-navy-900 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="block text-xs font-semibold text-navy-700 mb-1">Daily Internal Cost (INR) *</label>
              <input
                type="number"
                required
                min={0}
                value={rateFormData.daily_cost_inr !== undefined ? rateFormData.daily_cost_inr : ""}
                onChange={(e) => setRateFormData({ ...rateFormData, daily_cost_inr: parseFloat(e.target.value) || 0 })}
                placeholder="e.g. 5800"
                className="w-full px-3 py-2 border border-navy-500/20 rounded-xl text-sm focus:ring-2 focus:ring-navy-900 focus:outline-none"
              />
            </div>
          </div>

          {/* Margin Preview */}
          {rateFormData.daily_billable_rate_inr && rateFormData.daily_cost_inr ? (
            <div className="p-3 bg-purple-50/50 rounded-xl border border-purple-200/60 text-xs flex justify-between items-center">
              <span className="text-navy-600 font-medium">Target Gross Margin:</span>
              <span className="font-bold text-purple-900">
                {(
                  ((Number(rateFormData.daily_billable_rate_inr) - Number(rateFormData.daily_cost_inr)) /
                    Number(rateFormData.daily_billable_rate_inr)) *
                  100
                ).toFixed(1)}
                % (₹{Number(rateFormData.daily_billable_rate_inr) - Number(rateFormData.daily_cost_inr)}/day spread)
              </span>
            </div>
          ) : null}

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="is_active_new_rate"
              checked={rateFormData.is_active !== false}
              onChange={(e) => setRateFormData({ ...rateFormData, is_active: e.target.checked })}
              className="rounded border-navy-300 text-navy-900 focus:ring-navy-900"
            />
            <label htmlFor="is_active_new_rate" className="text-xs font-semibold text-navy-800 cursor-pointer">
              Active Band for PMT Solutioning & Timesheets
            </label>
          </div>
        </div>
      </Modal>

      {/* ════════════════════════════════════════════════════════════════
          MODAL: ADD CLIENT COMPANY
          ════════════════════════════════════════════════════════════════ */}
      <Modal
        isOpen={isAddCompanyModalOpen}
        onClose={() => setIsAddCompanyModalOpen(false)}
        title="Add Client Company"
        footer={
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => setIsAddCompanyModalOpen(false)}
              className="px-4 py-2 text-sm font-medium text-navy-600 hover:text-navy-900 bg-neutral-100 rounded-xl cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateCompany}
              disabled={isSavingCompany}
              className="px-4 py-2 text-sm font-medium text-white bg-navy-900 hover:bg-navy-800 rounded-xl disabled:opacity-50 flex items-center gap-2 cursor-pointer shadow-sm"
            >
              {isSavingCompany && <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>}
              Create Company
            </button>
          </div>
        }
      >
        <div className="space-y-4 text-sm">
          <div>
            <label className="block text-xs font-semibold text-navy-700 mb-1">Company / Client Name *</label>
            <input
              type="text"
              required
              value={companyFormData.name || ""}
              onChange={(e) => setCompanyFormData({ ...companyFormData, name: e.target.value })}
              placeholder="e.g. Gainwell Commosales Private Limited"
              className="w-full px-3 py-2 border border-navy-500/20 rounded-xl text-sm focus:ring-2 focus:ring-navy-900 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-navy-700 mb-1">Corporate Email Domain</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-navy-400 font-mono text-sm">
                @
              </span>
              <input
                type="text"
                value={companyFormData.domain || ""}
                onChange={(e) => setCompanyFormData({ ...companyFormData, domain: e.target.value.replace(/^@/, "") })}
                placeholder="gainwellindia.com"
                className="w-full pl-8 pr-3 py-2 border border-navy-500/20 rounded-xl text-sm focus:ring-2 focus:ring-navy-900 focus:outline-none font-mono"
              />
            </div>
            <p className="text-[11px] text-navy-400 mt-1">
              Users signing in with this email domain will automatically map to this company.
            </p>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="is_active_new_company"
              checked={companyFormData.is_active !== false}
              onChange={(e) => setCompanyFormData({ ...companyFormData, is_active: e.target.checked })}
              className="rounded border-navy-300 text-navy-900 focus:ring-navy-900"
            />
            <label htmlFor="is_active_new_company" className="text-xs font-semibold text-navy-800 cursor-pointer">
              Active Client Company (Enabled for Projects & ITSM Tickets)
            </label>
          </div>
        </div>
      </Modal>

      {/* ════════════════════════════════════════════════════════════════
          MODAL: CONFIRM DELETE RATE BAND
          ════════════════════════════════════════════════════════════════ */}
      <Modal
        isOpen={!!rateBandToDelete}
        onClose={() => setRateBandToDelete(null)}
        title={`Delete Rate Band: ${rateBandToDelete?.level_code}`}
        footer={
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => setRateBandToDelete(null)}
              className="px-4 py-2 text-sm font-medium text-navy-600 hover:text-navy-900 bg-neutral-100 rounded-xl cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmDeleteRateBand}
              disabled={isDeletingRate}
              className="px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl disabled:opacity-50 flex items-center gap-2 cursor-pointer shadow-sm"
            >
              {isDeletingRate && <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>}
              Delete Rate Band
            </button>
          </div>
        }
      >
        <div className="space-y-3 text-sm">
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
            <svg className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <div>
              <p className="font-semibold text-red-900">Are you sure you want to delete this rate band?</p>
              <p className="text-xs text-red-700 mt-1">
                You are about to remove <strong>{rateBandToDelete?.level_code} — {rateBandToDelete?.band_name}</strong> (Billable: {rateBandToDelete ? formatINR(rateBandToDelete.daily_billable_rate_inr) : ""}/day).
              </p>
            </div>
          </div>
          <p className="text-xs text-navy-500">
            <strong>Note:</strong> If this rate band is referenced in existing solution proposals or team assignments, it will be safely deactivated to protect historical billing records.
          </p>
        </div>
      </Modal>

      {/* ════════════════════════════════════════════════════════════════
          MODAL: CONFIRM DELETE COMPANY
          ════════════════════════════════════════════════════════════════ */}
      <Modal
        isOpen={!!companyToDelete}
        onClose={() => setCompanyToDelete(null)}
        title={`Delete Company: ${companyToDelete?.name}`}
        footer={
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => setCompanyToDelete(null)}
              className="px-4 py-2 text-sm font-medium text-navy-600 hover:text-navy-900 bg-neutral-100 rounded-xl cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmDeleteCompany}
              disabled={isDeletingCompany}
              className="px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl disabled:opacity-50 flex items-center gap-2 cursor-pointer shadow-sm"
            >
              {isDeletingCompany && <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>}
              Delete Company
            </button>
          </div>
        }
      >
        <div className="space-y-3 text-sm">
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
            <svg className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <div>
              <p className="font-semibold text-red-900">Are you sure you want to remove this client company?</p>
              <p className="text-xs text-red-700 mt-1">
                You are about to remove <strong>{companyToDelete?.name}</strong>{companyToDelete?.domain ? ` (@${companyToDelete.domain})` : ""}.
              </p>
            </div>
          </div>
          <p className="text-xs text-navy-500">
            <strong>Note:</strong> If this company has historical tickets or project contracts, it will be deactivated to ensure historical audit trails remain intact.
          </p>
        </div>
      </Modal>
    </div>
  );
}
