"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { Avatar } from "@/components/ui/Avatar";
import { ColorBadge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { formatCurrency } from "@/lib/utils";
import { formatISODate } from "@/lib/dates";

interface Allocation {
  id: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  projectStatus: string;
  projectCategory?: string | null;
  projectType?: string | null;
  roleInProject: string;
  memberType: "employee" | "intern" | "consultant";
  allocationPercent: number;
  customDailyCostInr: number | null;
  dailyBillableRateInr: number | null;
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
}

interface ExternalUser {
  id: string;
  email: string;
  fullName: string;
  mobilePhone: string | null;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  roleCodes: string[];
  roleNames: string[];
  primaryRoleCode: string;
  primaryRoleName: string;
  allocations: Allocation[];
  allocationCount: number;
  totalAllocationPercent: number;
}

interface RoleOption {
  id: string;
  code: string;
  name: string;
  description: string | null;
}

interface ProjectOption {
  id: string;
  code: string;
  name: string;
  status: string;
  category?: string | null;
  projectType?: string | null;
}

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-red-50 text-red-700 ring-red-600/20",
  project_manager: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
  member: "bg-blue-50 text-blue-700 ring-blue-600/20",
  consultant: "bg-purple-50 text-purple-700 ring-purple-600/20",
  agent: "bg-cyan-50 text-cyan-700 ring-cyan-600/20",
  sales: "bg-pink-50 text-pink-700 ring-pink-600/20",
  client: "bg-slate-50 text-slate-700 ring-slate-600/20",
};

export function ExternalUsersClient({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<ExternalUser[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Filters
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [allocFilter, setAllocFilter] = useState<"all" | "allocated" | "unallocated">("all");
  const [includeInactive, setIncludeInactive] = useState(false);

  // Modals state
  const [allocatingUser, setAllocatingUser] = useState<ExternalUser | null>(null);
  const [managingAllocationsUser, setManagingAllocationsUser] = useState<ExternalUser | null>(null);

  // Allocation form state
  const [allocForm, setAllocForm] = useState({
    projectId: "",
    roleInProject: "Consultant",
    memberType: "consultant" as "consultant" | "intern" | "employee",
    customDailyCostInr: "",
    allocationPercent: "100",
    startDate: new Date().toISOString().split("T")[0],
    endDate: "",
    notes: "",
  });
  const [allocError, setAllocError] = useState("");
  const [submittingAlloc, setSubmittingAlloc] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (includeInactive) params.set("includeInactive", "1");
      const res = await fetch(`/api/admin/external-users?${params}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not load non-Darwinbox users.");
        return;
      }
      setUsers(data.users || []);
      setRoles(data.roles || []);
      setProjects(data.projects || []);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, [includeInactive]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filtering
  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== "all" && !u.roleCodes.includes(roleFilter)) return false;
      if (allocFilter === "allocated" && u.allocationCount === 0) return false;
      if (allocFilter === "unallocated" && u.allocationCount > 0) return false;
      if (!q) return true;
      return (
        u.fullName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.mobilePhone && u.mobilePhone.toLowerCase().includes(q)) ||
        u.allocations.some(
          (a) =>
            a.projectCode.toLowerCase().includes(q) ||
            a.projectName.toLowerCase().includes(q) ||
            a.roleInProject.toLowerCase().includes(q)
        )
      );
    });
  }, [users, search, roleFilter, allocFilter]);

  // Stats
  const stats = useMemo(() => {
    const totalUsers = users.length;
    const totalAllocations = users.reduce((acc, u) => acc + u.allocationCount, 0);
    const allocatedUsers = users.filter((u) => u.allocationCount > 0).length;
    const uniqueProjects = new Set<string>();
    for (const u of users) {
      for (const a of u.allocations) {
        uniqueProjects.add(a.projectId);
      }
    }
    return {
      totalUsers,
      totalAllocations,
      allocatedUsers,
      staffedProjects: uniqueProjects.size,
    };
  }, [users]);

  // Handle Delete User
  const handleDeleteUser = async (user: ExternalUser) => {
    if (
      !confirm(
        `Are you sure you want to PERMANENTLY DELETE user "${user.fullName}" (${user.email})?\n\nThis will revoke their login access, remove their system roles, and delete their project allocations.`
      )
    ) {
      return;
    }
    setError("");
    setNotice("");
    try {
      const res = await fetch(`/api/admin/external-users/${user.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not delete user.");
        return;
      }
      setNotice(`User ${user.fullName} deleted successfully.`);
      await loadData();
    } catch {
      setError("Network error deleting user.");
    }
  };

  // Handle Allocate to Project
  const handleOpenAllocate = (user: ExternalUser) => {
    setAllocatingUser(user);
    setAllocForm({
      projectId: projects[0]?.id || "",
      roleInProject: "Consultant",
      memberType: "consultant",
      customDailyCostInr: "",
      allocationPercent: "100",
      startDate: new Date().toISOString().split("T")[0],
      endDate: "",
      notes: "",
    });
    setAllocError("");
  };

  const handleSaveAllocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allocatingUser) return;
    if (!allocForm.projectId) {
      setAllocError("Please select a project.");
      return;
    }
    setSubmittingAlloc(true);
    setAllocError("");
    try {
      const res = await fetch(`/api/admin/external-users/${allocatingUser.id}/allocations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(allocForm),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAllocError(data.error || "Could not allocate user.");
        return;
      }
      setAllocatingUser(null);
      setNotice(data.message || `${allocatingUser.fullName} allocated successfully.`);
      await loadData();
    } catch {
      setAllocError("Network error. Please try again.");
    } finally {
      setSubmittingAlloc(false);
    }
  };

  // Handle Remove Allocation
  const handleRemoveAllocation = async (user: ExternalUser, allocationId: string, projectName: string) => {
    if (!confirm(`Are you sure you want to remove the allocation for ${user.fullName} from ${projectName}?`)) {
      return;
    }
    try {
      const res = await fetch(`/api/admin/external-users/${user.id}/allocations/${allocationId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Could not remove allocation.");
        return;
      }
      setNotice(`Allocation removed successfully.`);
      await loadData();
      if (managingAllocationsUser && managingAllocationsUser.id === user.id) {
        setManagingAllocationsUser((prev) =>
          prev ? { ...prev, allocations: prev.allocations.filter((a) => a.id !== allocationId) } : null
        );
      }
    } catch {
      setError("Network error.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-display text-2xl font-bold tracking-tight text-navy-900">
            Non-Darwinbox Users
          </h1>
          <p className="mt-1 text-sm text-navy-500">
            Manage interns, consultants, clients, and team members maintained outside Darwinbox. Their email address serves as their login ID to sign in via OTP.
          </p>
        </div>
        <Link href="/admin/external-users/new">
          <Button className="shrink-0">
            <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Non-Darwinbox User
          </Button>
        </Link>
      </div>

      {/* Notice Banner */}
      {notice && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3.5 text-sm font-medium text-emerald-800 flex items-center justify-between">
          <span>{notice}</span>
          <button onClick={() => setNotice("")} className="text-emerald-600 hover:text-emerald-900 ml-3">✕</button>
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3.5 text-sm font-medium text-red-800 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError("")} className="text-red-600 hover:text-red-900 ml-3">✕</button>
        </div>
      )}

      {/* KPI Tiles */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="p-4 border border-navy-900/8 bg-surface">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-navy-400">Total External Users</span>
          <p className="mt-2 text-2xl font-bold text-navy-900">{stats.totalUsers}</p>
          <span className="text-xs text-navy-400">Maintained outside Darwinbox</span>
        </Card>
        <Card className="p-4 border border-navy-900/8 bg-surface">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-navy-400">Total Allocations</span>
          <p className="mt-2 text-2xl font-bold text-navy-900">{stats.totalAllocations}</p>
          <span className="text-xs text-navy-400">Active project seats</span>
        </Card>
        <Card className="p-4 border border-navy-900/8 bg-surface">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-navy-400">Allocated Staff</span>
          <p className="mt-2 text-2xl font-bold text-navy-900">{stats.allocatedUsers}</p>
          <span className="text-xs text-navy-400">{stats.totalUsers - stats.allocatedUsers} unallocated</span>
        </Card>
        <Card className="p-4 border border-navy-900/8 bg-surface">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-navy-400">Staffed Projects</span>
          <p className="mt-2 text-2xl font-bold text-navy-900">{stats.staffedProjects}</p>
          <span className="text-xs text-navy-400">With non-Darwinbox staff</span>
        </Card>
      </div>

      {/* Toolbar / Search & Filters */}
      <div className="flex flex-col gap-3 rounded-xl border border-navy-900/8 bg-surface p-3 shadow-xs sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, project or role..."
            className="h-9 w-full rounded-lg border border-navy-900/12 bg-surface-2 px-3 text-[13px] text-navy-900 placeholder:text-navy-300 focus:border-navy-700 focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="h-9 rounded-lg border border-navy-900/12 bg-surface px-3 text-[13px] text-navy-700 focus:border-navy-700 focus:outline-none"
          >
            <option value="all">All Roles</option>
            {roles.map((r) => (
              <option key={r.code} value={r.code}>
                {r.name}
              </option>
            ))}
          </select>

          <select
            value={allocFilter}
            onChange={(e) => setAllocFilter(e.target.value as any)}
            className="h-9 rounded-lg border border-navy-900/12 bg-surface px-3 text-[13px] text-navy-700 focus:border-navy-700 focus:outline-none"
          >
            <option value="all">All Allocations</option>
            <option value="allocated">Allocated to Projects</option>
            <option value="unallocated">Unallocated (Bench)</option>
          </select>

          <label className="flex items-center gap-1.5 text-xs text-navy-600 cursor-pointer ml-1">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
              className="rounded border-navy-300 text-navy-900 focus:ring-0"
            />
            Include inactive
          </label>
        </div>
      </div>

      {/* Users Table */}
      {loading ? (
        <div className="flex items-center justify-center p-12 text-sm text-navy-400">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-navy-900/20 border-t-navy-600 mr-2" />
          Loading non-Darwinbox users...
        </div>
      ) : filteredUsers.length === 0 ? (
        <Card className="p-8 text-center border-dashed border-2 border-navy-900/10">
          <p className="text-sm font-medium text-navy-700">No non-Darwinbox users found.</p>
          <p className="mt-1 text-xs text-navy-400">Create interns, consultants, clients, or standalone team members to allocate them to projects.</p>
          <Link href="/admin/external-users/new" className="inline-block mt-4">
            <Button variant="secondary" size="sm">
              Add First User
            </Button>
          </Link>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-navy-900/8 bg-surface shadow-xs">
          <table className="w-full table-fixed min-w-[1000px] border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="bg-surface-2 text-left text-[11px] font-semibold uppercase tracking-wider text-navy-500">
                <th className="px-4 py-3 border-b border-navy-900/10 w-[240px]">User</th>
                <th className="px-4 py-3 border-b border-navy-900/10 w-[180px]">System Roles</th>
                <th className="px-4 py-3 border-b border-navy-900/10 w-[300px]">Project Allocations</th>
                <th className="px-4 py-3 border-b border-navy-900/10 w-[120px]">Allocation</th>
                <th className="px-4 py-3 border-b border-navy-900/10 w-[90px]">Status</th>
                <th className="px-4 py-3 border-b border-navy-900/10 w-[180px] text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-900/6">
              {filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-navy-50/50 transition-colors">
                  {/* User info */}
                  <td className="px-4 py-3 align-top">
                    <div className="flex items-start gap-2.5">
                      <Avatar name={user.fullName} className="h-8 w-8 text-xs shrink-0" />
                      <div className="min-w-0">
                        <span className="block font-semibold text-navy-900 truncate">{user.fullName}</span>
                        <span className="block text-xs text-navy-500 truncate">{user.email}</span>
                        {user.mobilePhone && (
                          <span className="block text-[11px] text-navy-400">{user.mobilePhone}</span>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* System Roles */}
                  <td className="px-4 py-3 align-top">
                    <div className="flex flex-wrap gap-1">
                      {user.roleCodes.map((code) => {
                        const matched = roles.find((r) => r.code === code);
                        const label = matched?.name || code;
                        const colorClass = ROLE_COLORS[code] || "bg-gray-50 text-gray-700 ring-gray-600/20";
                        return (
                          <span
                            key={code}
                            className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${colorClass}`}
                          >
                            {label}
                          </span>
                        );
                      })}
                    </div>
                  </td>

                  {/* Project Allocations */}
                  <td className="px-4 py-3 align-top">
                    {user.allocations.length === 0 ? (
                      <span className="text-xs text-navy-400 italic">Not allocated to any project</span>
                    ) : (
                      <div className="space-y-1.5">
                        {user.allocations.map((alloc) => (
                          <div
                            key={alloc.id}
                            className="flex items-center justify-between gap-2 rounded-lg bg-navy-50/70 border border-navy-200/50 px-2 py-1 text-xs"
                          >
                            <div className="min-w-0">
                              <span className="font-semibold text-navy-800">{alloc.projectCode}</span>
                              <span className="text-navy-500 ml-1 truncate" title={alloc.projectName}>
                                {alloc.projectName}
                              </span>
                              <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-navy-400">
                                <span>{alloc.roleInProject}</span>
                                <span>•</span>
                                <span className="capitalize">{alloc.memberType}</span>
                                {alloc.customDailyCostInr !== null && (
                                  <>
                                    <span>•</span>
                                    <span className="font-medium text-navy-700">
                                      ₹{alloc.customDailyCostInr.toLocaleString()}/d
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                            <span className="shrink-0 font-bold text-navy-700 bg-white px-1.5 py-0.5 rounded border border-navy-200/40 text-[10.5px]">
                              {alloc.allocationPercent}%
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </td>

                  {/* Allocation % Total */}
                  <td className="px-4 py-3 align-top">
                    {user.allocationCount === 0 ? (
                      <span className="inline-flex items-center rounded-md bg-gray-50 px-2 py-1 text-xs font-medium text-gray-600 ring-1 ring-inset ring-gray-500/10">
                        Bench
                      </span>
                    ) : (
                      <div>
                        <span
                          className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-bold ring-1 ring-inset ${
                            user.totalAllocationPercent > 100
                              ? "bg-rose-50 text-rose-700 ring-rose-600/20"
                              : user.totalAllocationPercent === 100
                                ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
                                : "bg-amber-50 text-amber-700 ring-amber-600/20"
                          }`}
                        >
                          {user.totalAllocationPercent}%
                        </span>
                        <span className="block mt-0.5 text-[11px] text-navy-400">
                          {user.allocationCount} project{user.allocationCount > 1 ? "s" : ""}
                        </span>
                      </div>
                    )}
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3 align-top">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        user.isActive
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-red-50 text-red-600"
                      }`}
                    >
                      {user.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3 align-top text-right space-x-1 whitespace-nowrap">
                    <Link href={`/admin/external-users/${user.id}/allocate`}>
                      <Button
                        size="sm"
                        variant="primary"
                        className="text-xs py-1 px-2.5"
                      >
                        + Allocate
                      </Button>
                    </Link>
                    {user.allocationCount > 0 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setManagingAllocationsUser(user)}
                        className="text-xs py-1 px-2 text-navy-600"
                        title="Manage current allocations"
                      >
                        Allocations ({user.allocationCount})
                      </Button>
                    )}
                    <Link href={`/admin/external-users/${user.id}/edit`}>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-xs py-1 px-2 text-navy-600"
                      >
                        Edit
                      </Button>
                    </Link>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDeleteUser(user)}
                      className="text-xs py-1 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}


      {/* ── MODAL: Allocate User to Project ── */}
      <Modal
        isOpen={Boolean(allocatingUser)}
        onClose={() => setAllocatingUser(null)}
        title={`Allocate ${allocatingUser?.fullName || ""} to Project`}
        description="Directly staff this user onto a project with their member type, CTC/actual cost, and allocation %."
      >
        <form onSubmit={handleSaveAllocation} className="space-y-4 pt-2">
          {allocError && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-2.5 text-xs font-medium text-red-700">
              {allocError}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-navy-700 mb-1.5">
              Select Project *
            </label>
            <select
              value={allocForm.projectId}
              onChange={(e) => setAllocForm((f) => ({ ...f, projectId: e.target.value }))}
              required
              className="w-full h-10 rounded-lg border border-navy-900/15 bg-surface px-3 text-sm text-navy-900 focus:border-navy-700 focus:outline-none"
            >
              <option value="">Select project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.name} {p.projectType ? `(${p.projectType})` : p.category ? `(${p.category})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-navy-700 mb-1.5">
                Role in Project *
              </label>
              <input
                type="text"
                required
                value={allocForm.roleInProject}
                onChange={(e) => setAllocForm((f) => ({ ...f, roleInProject: e.target.value }))}
                placeholder="e.g. Lead Consultant, Developer"
                className="w-full h-10 rounded-lg border border-navy-900/15 bg-surface px-3 text-sm text-navy-900 focus:border-navy-700 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-navy-700 mb-1.5">
                Resource Type *
              </label>
              <select
                value={allocForm.memberType}
                onChange={(e) => setAllocForm((f) => ({ ...f, memberType: e.target.value as any }))}
                className="w-full h-10 rounded-lg border border-navy-900/15 bg-surface px-3 text-sm text-navy-900 focus:border-navy-700 focus:outline-none"
              >
                <option value="consultant">Consultant</option>
                <option value="intern">Intern</option>
                <option value="employee">Employee</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-navy-700 mb-1.5">
                Actual Daily Cost (₹ CTC)
              </label>
              <input
                type="number"
                min="0"
                step="100"
                value={allocForm.customDailyCostInr}
                onChange={(e) => setAllocForm((f) => ({ ...f, customDailyCostInr: e.target.value }))}
                placeholder="e.g. 15000"
                className="w-full h-10 rounded-lg border border-navy-900/15 bg-surface px-3 text-sm text-navy-900 focus:border-navy-700 focus:outline-none"
              />
              <span className="block mt-1 text-[11px] text-navy-400">Actual cost as per consultant CTC</span>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-navy-700 mb-1.5">
                Allocation % *
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="100"
                  required
                  value={allocForm.allocationPercent}
                  onChange={(e) => setAllocForm((f) => ({ ...f, allocationPercent: e.target.value }))}
                  className="w-full h-10 rounded-lg border border-navy-900/15 bg-surface px-3 text-sm text-navy-900 focus:border-navy-700 focus:outline-none"
                />
                <span className="text-sm font-bold text-navy-600">%</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-navy-700 mb-1.5">
                Start Date *
              </label>
              <input
                type="date"
                required
                value={allocForm.startDate}
                onChange={(e) => setAllocForm((f) => ({ ...f, startDate: e.target.value }))}
                className="w-full h-10 rounded-lg border border-navy-900/15 bg-surface px-3 text-sm text-navy-900 focus:border-navy-700 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-navy-700 mb-1.5">
                End Date (Optional)
              </label>
              <input
                type="date"
                value={allocForm.endDate}
                onChange={(e) => setAllocForm((f) => ({ ...f, endDate: e.target.value }))}
                className="w-full h-10 rounded-lg border border-navy-900/15 bg-surface px-3 text-sm text-navy-900 focus:border-navy-700 focus:outline-none"
              />
            </div>
          </div>

          <Textarea
            label="Notes"
            value={allocForm.notes}
            onChange={(e) => setAllocForm((f) => ({ ...f, notes: e.target.value }))}
            placeholder="Commercial terms, deliverables, or notes..."
            rows={2}
          />

          <div className="flex justify-end gap-2 pt-3 border-t border-navy-900/8">
            <Button type="button" variant="ghost" onClick={() => setAllocatingUser(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submittingAlloc}>
              {submittingAlloc ? "Allocating..." : "Confirm Allocation"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ── MODAL: Manage Current Allocations ── */}
      <Modal
        isOpen={Boolean(managingAllocationsUser)}
        onClose={() => setManagingAllocationsUser(null)}
        title={`Project Allocations — ${managingAllocationsUser?.fullName || ""}`}
        description="View and manage projects this user is currently assigned to."
      >
        <div className="space-y-4 pt-2">
          {managingAllocationsUser && managingAllocationsUser.allocations.length === 0 ? (
            <p className="text-sm text-navy-500 py-4 text-center">No active allocations.</p>
          ) : (
            <div className="divide-y divide-navy-900/8">
              {managingAllocationsUser?.allocations.map((a) => (
                <div key={a.id} className="py-3 flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-navy-900 text-sm">{a.projectCode}</span>
                      <span className="text-sm text-navy-700 font-medium">{a.projectName}</span>
                      <span className="rounded bg-navy-100 px-1.5 py-0.5 text-[10.5px] font-semibold text-navy-700 capitalize">
                        {a.memberType}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-navy-500 space-x-2">
                      <span>Role: <strong>{a.roleInProject}</strong></span>
                      <span>•</span>
                      <span>Allocation: <strong>{a.allocationPercent}%</strong></span>
                      {a.customDailyCostInr !== null && (
                        <>
                          <span>•</span>
                          <span>Cost: <strong>₹{a.customDailyCostInr.toLocaleString()}/d</strong></span>
                        </>
                      )}
                    </div>
                    <div className="mt-1 text-[11.5px] text-navy-400">
                      <span>Dates: {formatISODate(a.startDate) || "Started"} → {formatISODate(a.endDate) || "Ongoing"}</span>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleRemoveAllocation(managingAllocationsUser, a.id, a.projectName)}
                    className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-between items-center pt-3 border-t border-navy-900/8">
            {managingAllocationsUser && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  const u = managingAllocationsUser;
                  setManagingAllocationsUser(null);
                  handleOpenAllocate(u);
                }}
              >
                + Add Another Project
              </Button>
            )}
            <Button variant="ghost" onClick={() => setManagingAllocationsUser(null)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
