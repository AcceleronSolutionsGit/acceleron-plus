"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { INTERNAL_DEPARTMENTS } from "../../AdminMastersClient";

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

export function EmployeeEditClient({ initialEmployee }: { initialEmployee: Employee }) {
  const router = useRouter();
  const [empFormData, setEmpFormData] = useState<Partial<Employee>>(initialEmployee);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/masters/employees/${initialEmployee.employee_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(empFormData),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update employee");
      }

      router.push("/admin/masters");
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this employee? This action cannot be undone.")) return;
    setIsDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/masters/employees/${initialEmployee.employee_id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete employee");
      }

      router.push("/admin/masters");
      router.refresh();
    } catch (err: any) {
      setError(err.message);
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col bg-surface-2 md:flex-row">
      <div className="flex-1 overflow-y-auto p-4 sm:p-8 md:p-12">
        <div className="mx-auto max-w-2xl bg-white rounded-2xl shadow-sm border border-navy-500/10 overflow-hidden">
          <div className="px-6 py-5 border-b border-navy-500/10 flex items-center justify-between bg-navy-50/30">
            <div>
              <button
                onClick={() => router.back()}
                className="group mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-navy-400 hover:text-navy-900 transition-colors"
              >
                <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 12L6 8l4-4" />
                </svg>
                Back to Masters
              </button>
              <h1 className="text-xl font-bold tracking-tight text-navy-900">
                Edit Employee Record #{initialEmployee.employee_id}
              </h1>
            </div>
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="px-3 py-1.5 text-xs font-semibold text-danger bg-danger/10 hover:bg-danger/20 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              {isDeleting ? "Deleting..." : "Delete Employee"}
            </button>
          </div>

          <div className="p-6 space-y-5">
            {error && (
              <div className="p-3 text-sm text-danger bg-danger/10 rounded-xl border border-danger/20">
                {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-navy-700 mb-1">Full Name</label>
              <input
                type="text"
                value={empFormData.full_name || ""}
                onChange={(e) => setEmpFormData({ ...empFormData, full_name: e.target.value })}
                className="w-full px-3 py-2 border border-navy-500/20 rounded-xl text-sm focus:ring-2 focus:ring-navy-900 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-navy-700 mb-1">Company Email</label>
              <input
                type="email"
                value={empFormData.company_email_id || ""}
                onChange={(e) => setEmpFormData({ ...empFormData, company_email_id: e.target.value })}
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
                className="w-full px-3 py-2 border border-navy-500/20 rounded-xl text-sm focus:ring-2 focus:ring-navy-900 focus:outline-none bg-navy-50/30"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-navy-700 mb-1 flex items-center gap-1.5">
                Internal Department
                <span className="text-[10px] font-normal text-navy-400 normal-case">(Acceleron team — won't be overwritten by sync)</span>
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
              {empFormData.department && !empFormData.internal_department && (
                <p className="mt-1 text-[11px] text-navy-400">
                  Darwinbox department: <span className="font-medium text-navy-600">{empFormData.department}</span>
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-navy-700 mb-1">Job Level</label>
                <input
                  type="text"
                  value={empFormData.job_level || ""}
                  onChange={(e) => setEmpFormData({ ...empFormData, job_level: e.target.value })}
                  placeholder="e.g. SRG2, G3"
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
                placeholder="e.g. Kolkata, Panagarh"
                className="w-full px-3 py-2 border border-navy-500/20 rounded-xl text-sm focus:ring-2 focus:ring-navy-900 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-navy-700 mb-1">
                Reporting Manager
              </label>
              <input
                type="text"
                value={empFormData.direct_manager_name || ""}
                onChange={(e) => setEmpFormData({ ...empFormData, direct_manager_name: e.target.value })}
                placeholder="e.g. Anirban Dey Sarkar"
                className="w-full px-3 py-2 border border-navy-500/20 rounded-xl text-sm focus:ring-2 focus:ring-navy-900 focus:outline-none"
              />
            </div>
          </div>

          <div className="px-6 py-4 border-t border-navy-500/10 bg-navy-50/30 flex items-center justify-end gap-3">
            <button
              onClick={() => router.back()}
              className="px-4 py-2 text-sm font-medium text-navy-600 hover:text-navy-900 bg-white border border-navy-500/20 rounded-xl shadow-sm"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-6 py-2 text-sm font-medium text-white bg-navy-900 hover:bg-navy-800 rounded-xl disabled:opacity-50 flex items-center gap-2 shadow-sm"
            >
              {isSaving && <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>}
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
