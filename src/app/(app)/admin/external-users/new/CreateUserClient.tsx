"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";

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
}

export function CreateUserClient() {
  const router = useRouter();

  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(true);

  // Form state
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [mobilePhone, setMobilePhone] = useState("");
  const [userType, setUserType] = useState<"consultant" | "intern" | "client" | "contractor" | "member">("consultant");
  const [selectedRoleCodes, setSelectedRoleCodes] = useState<string[]>(["member"]);

  // Project allocation toggle
  const [allocateNow, setAllocateNow] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [roleInProject, setRoleInProject] = useState("Consultant");
  const [memberType, setMemberType] = useState<"consultant" | "intern" | "employee">("consultant");
  const [customDailyCostInr, setCustomDailyCostInr] = useState("");
  const [allocationPercent, setAllocationPercent] = useState("100");
  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState("");

  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/admin/external-users")
      .then((res) => res.json())
      .then((data) => {
        if (data?.roles) setRoles(data.roles);
        if (data?.projects) {
          setProjects(data.projects);
          if (data.projects.length > 0) setProjectId(data.projects[0].id);
        }
      })
      .catch(() => null)
      .finally(() => setLoadingInitial(false));
  }, []);

  // When userType changes, suggest default roles & allocation memberType
  const handleUserTypeChange = (type: "consultant" | "intern" | "client" | "contractor" | "member") => {
    setUserType(type);
    if (type === "consultant") {
      setRoleInProject("Consultant");
      setMemberType("consultant");
      if (!selectedRoleCodes.includes("consultant")) {
        setSelectedRoleCodes(["member", "consultant"]);
      }
    } else if (type === "intern") {
      setRoleInProject("Intern");
      setMemberType("intern");
      setSelectedRoleCodes(["member"]);
    } else if (type === "client") {
      setRoleInProject("Client Stakeholder");
      setMemberType("consultant");
      setSelectedRoleCodes(["client"]);
    } else {
      setRoleInProject("Team Member");
      setMemberType("employee");
      setSelectedRoleCodes(["member"]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim()) {
      setError("Full name and email address are required.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      // 1. Create user
      const userRes = await fetch("/api/admin/external-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: email.trim().toLowerCase(),
          mobilePhone: mobilePhone.trim() || null,
          roleCodes: selectedRoleCodes.length > 0 ? selectedRoleCodes : ["member"],
        }),
      });

      const userData = await userRes.json().catch(() => ({}));
      if (!userRes.ok) {
        setError(userData.error || "Could not create user account.");
        setSubmitting(false);
        return;
      }

      const createdUserId = userData.user?.id;

      // 2. Optionally allocate to project
      if (allocateNow && createdUserId && projectId) {
        const allocRes = await fetch(`/api/admin/external-users/${createdUserId}/allocations`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            roleInProject,
            memberType,
            customDailyCostInr: customDailyCostInr !== "" ? Number(customDailyCostInr) : null,
            allocationPercent: Number(allocationPercent) || 100,
            startDate,
            endDate: endDate || null,
          }),
        });

        if (!allocRes.ok) {
          const allocData = await allocRes.json().catch(() => ({}));
          console.warn("User created, but allocation failed:", allocData.error);
        }
      }

      router.push("/admin/external-users");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
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
      <div>
        <h1 className="text-display text-2xl font-bold tracking-tight text-navy-900">
          Create Non-Darwinbox User
        </h1>
        <p className="mt-1 text-sm text-navy-500">
          Add an intern, consultant, client contact, or direct team member. Their email address will serve as their login ID to sign in via OTP.
        </p>
      </div>

      {/* Error alert */}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3.5 text-sm font-medium text-red-800">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Card 1: User Profile & Login Credentials */}
        <Card className="p-6 border border-navy-900/10 space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-navy-800 border-b border-navy-900/8 pb-2">
            1. Account & Login Credentials
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Full Name *"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Suman Sen"
            />

            <div>
              <Input
                label="Email Address (Login ID) *"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. suman.sen@example.com"
              />
              <p className="mt-1 text-[11px] text-navy-400">
                🔑 User will enter this email on the login screen to receive their OTP sign-in code.
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

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-navy-700 mb-1.5">
                User Classification
              </label>
              <select
                value={userType}
                onChange={(e) => handleUserTypeChange(e.target.value as any)}
                className="w-full h-10 rounded-lg border border-navy-900/15 bg-surface px-3 text-sm text-navy-900 focus:border-navy-700 focus:outline-none"
              >
                <option value="consultant">Consultant (External / CTC-based)</option>
                <option value="intern">Intern</option>
                <option value="client">Client Contact / Stakeholder</option>
                <option value="contractor">Subcontractor / Vendor Staff</option>
                <option value="member">Direct Team Member</option>
              </select>
            </div>
          </div>
        </Card>

        {/* Card 2: System Roles & Permissions */}
        <Card className="p-6 border border-navy-900/10 space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-navy-800 border-b border-navy-900/8 pb-2">
            2. System Roles & Access
          </h2>

          <div>
            <p className="text-xs text-navy-500 mb-3">
              Assign roles to control module access (Projects, Timesheets, ITSM, or Portal).
            </p>
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
                        {r.description || `Grants ${r.name} permissions across permitted modules.`}
                      </span>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        </Card>

        {/* Card 3: Project Allocation (Optional) */}
        <Card className="p-6 border border-navy-900/10 space-y-4">
          <div className="flex items-center justify-between border-b border-navy-900/8 pb-3">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-navy-800">
                3. Project Allocation
              </h2>
              <p className="text-xs text-navy-500">
                Optionally staff this user on an active project immediately.
              </p>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={allocateNow}
                onChange={(e) => setAllocateNow(e.target.checked)}
                className="rounded border-navy-300 text-navy-900 focus:ring-0 h-4 w-4"
              />
              <span className="text-xs font-bold text-navy-800">Allocate to project now</span>
            </label>
          </div>

          {allocateNow && (
            <div className="space-y-4 pt-2">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-navy-700 mb-1.5">
                  Select Project *
                </label>
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  required={allocateNow}
                  className="w-full h-10 rounded-lg border border-navy-900/15 bg-surface px-3 text-sm text-navy-900 focus:border-navy-700 focus:outline-none"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} — {p.name} {p.projectType ? `(${p.projectType})` : p.category ? `(${p.category})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-navy-700 mb-1.5">
                    Role in Project *
                  </label>
                  <input
                    type="text"
                    required={allocateNow}
                    value={roleInProject}
                    onChange={(e) => setRoleInProject(e.target.value)}
                    placeholder="e.g. Lead Consultant, Developer, QA"
                    className="w-full h-10 rounded-lg border border-navy-900/15 bg-surface px-3 text-sm text-navy-900 focus:border-navy-700 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-navy-700 mb-1.5">
                    Resource Type *
                  </label>
                  <select
                    value={memberType}
                    onChange={(e) => setMemberType(e.target.value as any)}
                    className="w-full h-10 rounded-lg border border-navy-900/15 bg-surface px-3 text-sm text-navy-900 focus:border-navy-700 focus:outline-none"
                  >
                    <option value="consultant">Consultant</option>
                    <option value="intern">Intern</option>
                    <option value="employee">Employee</option>
                  </select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-navy-700 mb-1.5">
                    Actual Daily Cost (₹ CTC)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={customDailyCostInr}
                    onChange={(e) => setCustomDailyCostInr(e.target.value)}
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
                      required={allocateNow}
                      value={allocationPercent}
                      onChange={(e) => setAllocationPercent(e.target.value)}
                      className="w-full h-10 rounded-lg border border-navy-900/15 bg-surface px-3 text-sm text-navy-900 focus:border-navy-700 focus:outline-none"
                    />
                    <span className="text-sm font-bold text-navy-600">%</span>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-navy-700 mb-1.5">
                    Start Date *
                  </label>
                  <input
                    type="date"
                    required={allocateNow}
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full h-10 rounded-lg border border-navy-900/15 bg-surface px-3 text-sm text-navy-900 focus:border-navy-700 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-navy-700 mb-1.5">
                    End Date (Optional)
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full h-10 rounded-lg border border-navy-900/15 bg-surface px-3 text-sm text-navy-900 focus:border-navy-700 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* Action bar */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-navy-900/10">
          <Button
            type="button"
            variant="ghost"
            onClick={() => router.push("/admin/external-users")}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Creating User..." : "Create Non-Darwinbox User"}
          </Button>
        </div>
      </form>
    </div>
  );
}
