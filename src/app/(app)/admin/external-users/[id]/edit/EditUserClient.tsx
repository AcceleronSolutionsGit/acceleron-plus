"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
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
  startDate: string | null;
  endDate: string | null;
  notes?: string | null;
  isActive: boolean;
}

interface UserDetail {
  id: string;
  email: string;
  fullName: string;
  mobilePhone: string | null;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  roleCodes: string[];
  roleNames: string[];
  allocations: Allocation[];
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
  category?: string | null;
  projectType?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  currency?: string;
}

export function EditUserClient({
  userId,
  currentUserId,
}: {
  userId: string;
  currentUserId: string;
}) {
  const router = useRouter();

  const [user, setUser] = useState<UserDetail | null>(null);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [mobilePhone, setMobilePhone] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [selectedRoleCodes, setSelectedRoleCodes] = useState<string[]>([]);

  // Inline new allocation form state
  const [showAddAlloc, setShowAddAlloc] = useState(false);
  const [allocProjectId, setAllocProjectId] = useState("");
  const [allocRole, setAllocRole] = useState("Consultant");
  const [allocType, setAllocType] = useState<"consultant" | "intern" | "employee">("consultant");
  const [allocCost, setAllocCost] = useState("");
  const [allocPercent, setAllocPercent] = useState("100");
  const [allocStart, setAllocStart] = useState(new Date().toISOString().split("T")[0]);
  const [allocEnd, setAllocEnd] = useState("");
  const [submittingAlloc, setSubmittingAlloc] = useState(false);
  const [allocError, setAllocError] = useState("");

  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadUser = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/external-users/${userId}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not load user.");
        return;
      }
      setUser(data.user);
      setFullName(data.user.fullName);
      setEmail(data.user.email);
      setMobilePhone(data.user.mobilePhone || "");
      setIsActive(data.user.isActive);
      setSelectedRoleCodes(data.user.roleCodes || []);
      setRoles(data.roles || []);
      setProjects(data.projects || []);
      if (data.projects?.length > 0) {
        const firstP = data.projects[0];
        setAllocProjectId(firstP.id);
        if (firstP.startDate) setAllocStart(firstP.startDate);
        if (firstP.endDate) setAllocEnd(firstP.endDate);
      }
    } catch {
      setError("Network error loading user details.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim()) {
      setError("Full name and email address are required.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const res = await fetch("/api/admin/external-users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          fullName: fullName.trim(),
          email: email.trim().toLowerCase(),
          mobilePhone: mobilePhone.trim() || null,
          roleCodes: selectedRoleCodes.length > 0 ? selectedRoleCodes : ["member"],
          isActive,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not update user.");
        setSaving(false);
        return;
      }

      setNotice("User updated successfully.");
      await loadUser();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!user) return;
    const confirmed = confirm(
      `Are you sure you want to PERMANENTLY DELETE user "${user.fullName}" (${user.email})?\n\nThis will remove their account, login permissions, and all project allocations.`
    );
    if (!confirmed) return;

    setDeleting(true);
    setError("");

    try {
      const res = await fetch(`/api/admin/external-users/${userId}`, {
        method: "DELETE",
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not delete user.");
        setDeleting(false);
        return;
      }

      router.push("/admin/external-users");
      router.refresh();
    } catch {
      setError("Network error deleting user.");
      setDeleting(false);
    }
  };

  const handleAddAllocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allocProjectId) {
      setAllocError("Please select a project.");
      return;
    }

    setSubmittingAlloc(true);
    setAllocError("");

    try {
      const res = await fetch(`/api/admin/external-users/${userId}/allocations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: allocProjectId,
          roleInProject: allocRole,
          memberType: allocType,
          customDailyCostInr: allocCost !== "" ? Number(allocCost) : null,
          allocationPercent: Number(allocPercent) || 100,
          startDate: allocStart,
          endDate: allocEnd || null,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAllocError(data.error || "Could not allocate user.");
        setSubmittingAlloc(false);
        return;
      }

      setShowAddAlloc(false);
      setNotice(data.message || "Project allocation created.");
      await loadUser();
    } catch {
      setAllocError("Network error.");
    } finally {
      setSubmittingAlloc(false);
    }
  };

  const handleRemoveAllocation = async (allocId: string, projectName: string) => {
    if (!confirm(`Are you sure you want to remove the allocation for project "${projectName}"?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/external-users/${userId}/allocations/${allocId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Could not remove allocation.");
        return;
      }

      setNotice("Allocation removed.");
      await loadUser();
    } catch {
      setError("Network error.");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-16 text-sm text-navy-400">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-navy-900/20 border-t-navy-600 mr-2" />
        Loading user details...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-8 text-center space-y-3">
        <p className="text-sm font-semibold text-red-600">{error || "User not found."}</p>
        <Link href="/admin/external-users" className="text-xs font-bold text-navy-700 underline">
          ← Return to Non-Darwinbox Users
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-16">
      {/* Back button */}
      <div>
        <Link
          href="/admin/external-users"
          className="inline-flex items-center text-xs font-semibold text-navy-600 hover:text-navy-900 transition-colors"
        >
          <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Non-Darwinbox Users
        </Link>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-display text-2xl font-bold tracking-tight text-navy-900">
            Edit User: {user.fullName}
          </h1>
          <p className="mt-1 text-sm text-navy-500">
            Manage credentials, role assignments, and project allocations.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
              isActive ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
            }`}
          >
            {isActive ? "Active Account" : "Inactive Account"}
          </span>
        </div>
      </div>

      {/* Banners */}
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

      <form onSubmit={handleSave} className="space-y-6">
        {/* Card 1: Account Info */}
        <Card className="p-6 border border-navy-900/10 space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-navy-800 border-b border-navy-900/8 pb-2">
            1. Account & Login
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Full Name *"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />

            <div>
              <Input
                label="Email Address (Login ID) *"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <p className="mt-1 text-[11px] text-navy-400">
                🔑 User enters this email at /login to sign in via OTP.
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Mobile Phone"
              value={mobilePhone}
              onChange={(e) => setMobilePhone(e.target.value)}
              placeholder="e.g. +91 98300 12345"
            />

            <div className="flex items-center justify-between rounded-lg border border-navy-900/10 p-3 bg-surface-2">
              <div>
                <span className="text-xs font-semibold text-navy-800 block">Account Status</span>
                <span className="text-[11px] text-navy-500">
                  {isActive ? "Account is active and can sign in." : "Account is disabled."}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsActive((prev) => !prev)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  isActive ? "bg-emerald-600" : "bg-neutral-300"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    isActive ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>
        </Card>

        {/* Card 2: System Roles */}
        <Card className="p-6 border border-navy-900/10 space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-navy-800 border-b border-navy-900/8 pb-2">
            2. System Roles
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {roles.map((r) => {
              const checked = selectedRoleCodes.includes(r.code);
              return (
                <label
                  key={r.code}
                  className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                    checked
                      ? "bg-navy-50/70 border-navy-400 text-navy-900"
                      : "bg-surface border-navy-900/10 text-navy-700 hover:bg-neutral-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      setSelectedRoleCodes((prev) =>
                        checked ? prev.filter((c) => c !== r.code) : [...prev, r.code]
                      );
                    }}
                    className="mt-0.5 rounded border-navy-300 text-navy-900 focus:ring-0"
                  />
                  <div>
                    <span className="block text-xs font-bold">{r.name}</span>
                    <span className="block text-[11px] text-navy-400">
                      {r.description || `Grants ${r.name} permissions.`}
                    </span>
                  </div>
                </label>
              );
            })}
          </div>
        </Card>

        {/* Action bar for main details */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => router.push("/admin/external-users")}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving Changes..." : "Save Changes"}
          </Button>
        </div>
      </form>

      {/* Card 3: Project Allocations */}
      <Card className="p-6 border border-navy-900/10 space-y-4 mt-8">
        <div className="flex items-center justify-between border-b border-navy-900/8 pb-3">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-navy-800">
              3. Project Allocations ({user.allocations.length})
            </h2>
            <p className="text-xs text-navy-500">
              Projects staffed by this user with their member type, CTC cost, and allocation %.
            </p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setShowAddAlloc((prev) => !prev)}
          >
            {showAddAlloc ? "Hide Form" : "+ Add Project Allocation"}
          </Button>
        </div>

        {/* Add allocation form on page */}
        {showAddAlloc && (
          <form onSubmit={handleAddAllocation} className="rounded-xl border border-navy-900/12 bg-navy-50/40 p-4 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-navy-900">
              Allocate to a New Project
            </h3>

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
                value={allocProjectId}
                onChange={(e) => {
                  const pId = e.target.value;
                  setAllocProjectId(pId);
                  const p = projects.find((proj) => proj.id === pId);
                  if (p) {
                    if (p.startDate) setAllocStart(p.startDate);
                    if (p.endDate) setAllocEnd(p.endDate);
                  }
                }}
                required
                className="w-full h-10 rounded-lg border border-navy-900/15 bg-white px-3 text-sm text-navy-900 focus:border-navy-700 focus:outline-none"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} — {p.name} {p.projectType ? `(${p.projectType})` : p.category ? `(${p.category})` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-navy-700 mb-1.5">
                  Role in Project *
                </label>
                <input
                  type="text"
                  required
                  value={allocRole}
                  onChange={(e) => setAllocRole(e.target.value)}
                  placeholder="e.g. Lead Consultant, Developer"
                  className="w-full h-10 rounded-lg border border-navy-900/15 bg-white px-3 text-sm text-navy-900 focus:border-navy-700 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-navy-700 mb-1.5">
                  Resource Type *
                </label>
                <select
                  value={allocType}
                  onChange={(e) => setAllocType(e.target.value as any)}
                  className="w-full h-10 rounded-lg border border-navy-900/15 bg-white px-3 text-sm text-navy-900 focus:border-navy-700 focus:outline-none"
                >
                  <option value="consultant">Consultant</option>
                  <option value="intern">Intern</option>
                  <option value="employee">Employee</option>
                </select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-navy-700 mb-1.5">
                  Actual Daily Cost (₹ CTC)
                </label>
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={allocCost}
                  onChange={(e) => setAllocCost(e.target.value)}
                  placeholder="e.g. 15000"
                  className="w-full h-10 rounded-lg border border-navy-900/15 bg-white px-3 text-sm text-navy-900 focus:border-navy-700 focus:outline-none"
                />
                <span className="block mt-1 text-[11px] text-navy-400">Actual cost as per consultant CTC</span>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-navy-700 mb-1.5">
                  Allocation % *
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  required
                  value={allocPercent}
                  onChange={(e) => setAllocPercent(e.target.value)}
                  className="w-full h-10 rounded-lg border border-navy-900/15 bg-white px-3 text-sm text-navy-900 focus:border-navy-700 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-navy-700 mb-1.5">
                  Start Date *
                </label>
                <input
                  type="date"
                  required
                  value={allocStart}
                  onChange={(e) => setAllocStart(e.target.value)}
                  className="w-full h-10 rounded-lg border border-navy-900/15 bg-white px-3 text-sm text-navy-900 focus:border-navy-700 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-navy-700 mb-1.5">
                  End Date
                </label>
                <input
                  type="date"
                  value={allocEnd}
                  onChange={(e) => setAllocEnd(e.target.value)}
                  className="w-full h-10 rounded-lg border border-navy-900/15 bg-white px-3 text-sm text-navy-900 focus:border-navy-700 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowAddAlloc(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={submittingAlloc}>
                {submittingAlloc ? "Allocating..." : "Confirm Allocation"}
              </Button>
            </div>
          </form>
        )}

        {/* Existing allocations list */}
        {user.allocations.length === 0 ? (
          <p className="text-xs text-navy-400 italic py-3 text-center">
            This user is not currently allocated to any project.
          </p>
        ) : (
          <div className="divide-y divide-navy-900/8 border rounded-lg overflow-hidden bg-white">
            {user.allocations.map((a) => (
              <div key={a.id} className="p-4 flex items-center justify-between gap-4 hover:bg-neutral-50/50 transition-colors">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-navy-900 text-sm">{a.projectCode}</span>
                    <span className="text-sm font-semibold text-navy-700">{a.projectName}</span>
                    <span className="rounded bg-navy-100 px-1.5 py-0.5 text-[10.5px] font-semibold text-navy-700 capitalize">
                      {a.memberType}
                    </span>
                    <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10.5px] font-bold text-emerald-700 border border-emerald-200">
                      {a.allocationPercent}%
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-navy-500">
                    <span>Role: <strong>{a.roleInProject}</strong></span>
                    {a.customDailyCostInr !== null && (
                      <>
                        <span>•</span>
                        <span>Daily Cost: <strong>₹{a.customDailyCostInr.toLocaleString()}/d</strong></span>
                      </>
                    )}
                    <span>•</span>
                    <span>
                      {formatISODate(a.startDate) || "Started"} → {formatISODate(a.endDate) || "Ongoing"}
                    </span>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleRemoveAllocation(a.id, a.projectName)}
                  className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Card 4: Danger Zone - Delete User */}
      <Card className="p-6 border border-red-200 bg-red-50/20 space-y-3 mt-8">
        <h2 className="text-sm font-bold uppercase tracking-wider text-red-800">
          Danger Zone
        </h2>
        <p className="text-xs text-navy-600">
          Permanently delete this user account. This will revoke all login access, delete their system roles, and remove their project allocations.
        </p>
        <div className="pt-2">
          <Button
            type="button"
            variant="destructive"
            onClick={handleDeleteUser}
            disabled={deleting}
          >
            {deleting ? "Deleting Account..." : `Delete User (${user.fullName})`}
          </Button>
        </div>
      </Card>
    </div>
  );
}
