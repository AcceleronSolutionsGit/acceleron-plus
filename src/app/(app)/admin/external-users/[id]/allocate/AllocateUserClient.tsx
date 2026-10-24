"use client";

import React, { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Project } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CodeChip } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { Modal } from "@/components/ui/Modal";
import {
  ALL_CATEGORIES,
  getTypesForCategory,
} from "@/lib/project-types";
import { formatCurrency, formatStatus, projectStatusColor, cn } from "@/lib/utils";
import { phaseColorClass, PHASES } from "@/app/(app)/pmt/ProjectListClient";

interface UserAllocation {
  projectId: string;
  roleInProject: string;
  allocationPercent: number;
  memberType: string;
  startDate: string | null;
  endDate: string | null;
}

interface UserProfile {
  id: string;
  fullName: string;
  email: string;
  mobilePhone: string | null;
  isActive: boolean;
  roleNames: string[];
  allocations: UserAllocation[];
}

interface AllocationPeriodInput {
  startDate: string;
  endDate: string;
  allocationPercent: number;
}

export function AllocateUserClient({
  user: initialUser,
  initialProjects,
}: {
  user: UserProfile;
  initialProjects: Project[];
}) {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile>(initialUser);
  const [projects] = useState<Project[]>(initialProjects);

  // Filters state (matching /pmt)
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "pipeline" | "on_hold" | "closed">("active");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [phaseFilter, setPhaseFilter] = useState("all");
  const [classificationFilter, setClassificationFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState("all");
  const [sortKey, setSortKey] = useState<"recent" | "name" | "end" | "budget">("name");

  // Allocation Modal state
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [roleInProject, setRoleInProject] = useState("Consultant");
  const [memberType, setMemberType] = useState<"consultant" | "intern" | "employee">("consultant");
  const [customDailyCostInr, setCustomDailyCostInr] = useState("");
  const [allocationPercent, setAllocationPercent] = useState("100");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [customRoles, setCustomRoles] = useState<{ id: string; name: string }[]>([]);

  // Multi-period allocation breakdown
  const [usePeriods, setUsePeriods] = useState(false);
  const [periods, setPeriods] = useState<AllocationPeriodInput[]>([
    { startDate: "", endDate: "", allocationPercent: 100 },
  ]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Available project types based on selected category
  const availableTypes = useMemo(() => {
    if (categoryFilter === "all") return [];
    return getTypesForCategory(categoryFilter);
  }, [categoryFilter]);

  // Unique clients for filter dropdown
  const uniqueClients = useMemo(() => {
    const clients = new Set<string>();
    for (const p of projects) {
      if (p.clientCompanyName?.trim()) clients.add(p.clientCompanyName.trim());
    }
    return Array.from(clients).sort();
  }, [projects]);

  // Set of project IDs the user is currently allocated to
  const allocatedProjectIds = useMemo(() => {
    const map = new Map<string, UserAllocation>();
    for (const a of user.allocations) {
      map.set(a.projectId, a);
    }
    return map;
  }, [user.allocations]);

  // Status grouping helper
  const matchesStatusGroup = (status: string, group: string) => {
    if (group === "all") return true;
    if (group === "active") return status === "active";
    if (group === "pipeline") return status === "initiated" || status === "planning";
    if (group === "on_hold") return status === "on_hold";
    if (group === "closed") return status === "closed" || status === "cancelled";
    return true;
  };

  // Filtered & sorted projects
  const filteredProjects = useMemo(() => {
    let result = projects.filter((p) => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = p.name?.toLowerCase().includes(q);
        const matchCode = p.code?.toLowerCase().includes(q);
        const matchClient = p.clientCompanyName?.toLowerCase().includes(q);
        const matchPm = p.managers?.some((m) => m.fullName?.toLowerCase().includes(q)) || p.projectManager?.fullName?.toLowerCase().includes(q);
        if (!matchName && !matchCode && !matchClient && !matchPm) return false;
      }

      // Status
      if (!matchesStatusGroup(p.status, statusFilter)) return false;

      // Category
      if (categoryFilter !== "all" && p.category !== categoryFilter) return false;

      // Project Type
      if (typeFilter !== "all" && p.projectType !== typeFilter) return false;

      // Phase
      if (phaseFilter !== "all" && (p.currentPhase || "Discovery") !== phaseFilter) return false;

      // Classification
      if (classificationFilter !== "all" && p.classification !== classificationFilter) return false;

      // Client
      if (clientFilter !== "all" && p.clientCompanyName !== clientFilter) return false;

      return true;
    });

    // Sorting
    result.sort((a, b) => {
      if (sortKey === "name") return (a.name || "").localeCompare(b.name || "");
      if (sortKey === "recent") return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      if (sortKey === "budget") return (Number(b.budgetInr) || 0) - (Number(a.budgetInr) || 0);
      if (sortKey === "end") {
        const endA = a.plannedEndDate || a.actualEndDate || "9999";
        const endB = b.plannedEndDate || b.actualEndDate || "9999";
        return endA.localeCompare(endB);
      }
      return 0;
    });

    return result;
  }, [projects, searchQuery, statusFilter, categoryFilter, typeFilter, phaseFilter, classificationFilter, clientFilter, sortKey]);

  // Status counts
  const statusCounts = useMemo(() => {
    return {
      all: projects.length,
      active: projects.filter((p) => matchesStatusGroup(p.status, "active")).length,
      pipeline: projects.filter((p) => matchesStatusGroup(p.status, "pipeline")).length,
      on_hold: projects.filter((p) => matchesStatusGroup(p.status, "on_hold")).length,
      closed: projects.filter((p) => matchesStatusGroup(p.status, "closed")).length,
    };
  }, [projects]);

  // Open allocation modal for a project
  const handleOpenAllocateModal = async (project: Project) => {
    setSelectedProject(project);
    setError("");
    setRoleInProject("Consultant");
    setMemberType("consultant");
    setCustomDailyCostInr("");
    setAllocationPercent("100");
    setNotes("");

    // Prefill project start & planned end dates
    const pStart = project.startDate ? String(project.startDate).slice(0, 10) : new Date().toISOString().split("T")[0];
    const pEnd = project.plannedEndDate
      ? String(project.plannedEndDate).slice(0, 10)
      : project.actualEndDate
      ? String(project.actualEndDate).slice(0, 10)
      : "";
    setStartDate(pStart);
    setEndDate(pEnd);

    // Initial period row
    setPeriods([
      { startDate: pStart, endDate: pEnd, allocationPercent: 100 },
    ]);
    setUsePeriods(false);

    // Fetch custom roles for this project
    try {
      const res = await fetch(`/api/admin/masters/project-roles?projectId=${project.id}`);
      const data = await res.json().catch(() => ({}));
      if (data?.roles) {
        setCustomRoles(data.roles);
      }
    } catch {
      setCustomRoles([]);
    }

    setIsModalOpen(true);
  };

  // Submit allocation
  const handleSubmitAllocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject) return;

    setSubmitting(true);
    setError("");

    try {
      const payload: any = {
        projectId: selectedProject.id,
        roleInProject: roleInProject.trim() || "Consultant",
        memberType,
        customDailyCostInr: customDailyCostInr !== "" ? Number(customDailyCostInr) : null,
        allocationPercent: Math.min(100, Math.max(1, Number(allocationPercent) || 100)),
        startDate: startDate || null,
        endDate: endDate || null,
        notes: notes.trim() || null,
      };

      if (usePeriods && periods.length > 0) {
        payload.allocationPeriods = periods.filter((p) => p.startDate && p.endDate);
      }

      const res = await fetch(`/api/admin/external-users/${user.id}/allocations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error || "Could not allocate user to project.");
        setSubmitting(false);
        return;
      }

      // Success
      setSuccessToast(`Successfully allocated ${user.fullName} to ${selectedProject.name} (${selectedProject.code})!`);
      setTimeout(() => setSuccessToast(null), 5000);

      // Update local user allocations state
      setUser((prev) => ({
        ...prev,
        allocations: [
          ...prev.allocations,
          {
            projectId: selectedProject.id,
            roleInProject: payload.roleInProject,
            allocationPercent: payload.allocationPercent,
            memberType: payload.memberType,
            startDate: payload.startDate,
            endDate: payload.endDate,
          },
        ],
      }));

      setIsModalOpen(false);
    } catch {
      setError("Network error while submitting allocation.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 pb-24">
      {/* Toast Notification */}
      {successToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-900 text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 border border-emerald-500/20 animate-fade-in">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
          <span className="text-sm font-medium">{successToast}</span>
        </div>
      )}

      {/* Breadcrumbs */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <Link href="/admin/external-users" className="text-navy-500 hover:text-navy-700 transition-colors">
            Non-Darwinbox Users
          </Link>
          <span className="text-navy-500/40">›</span>
          <Link href={`/admin/external-users/${user.id}/edit`} className="text-navy-500 hover:text-navy-700 transition-colors">
            {user.fullName}
          </Link>
          <span className="text-navy-500/40">›</span>
          <span className="text-navy-900 font-semibold">Allocate to Projects</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/admin/external-users/${user.id}/edit`)}
          className="text-navy-600 hover:text-navy-900"
        >
          ← Back to User Profile
        </Button>
      </div>

      {/* User Header Profile Card */}
      <div className="bg-white rounded-2xl border border-navy-900/10 p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <Avatar name={user.fullName} size="lg" className="border-2 border-navy-900/10 shadow-sm" />
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-navy-900 font-[family-name:var(--font-league-spartan)]">
                  {user.fullName}
                </h1>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                  user.isActive ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-neutral-100 text-neutral-600"
                }`}>
                  {user.isActive ? "Active" : "Inactive"}
                </span>
                {user.roleNames.map((rn) => (
                  <span key={rn} className="px-2 py-0.5 rounded-md bg-navy-50 border border-navy-900/10 text-[11px] font-medium text-navy-700">
                    {rn}
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-3 text-xs text-navy-500 mt-1">
                <span>{user.email}</span>
                {user.mobilePhone && <span>• {user.mobilePhone}</span>}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="bg-navy-50/70 border border-navy-900/10 rounded-xl px-4 py-2 text-right">
              <span className="block text-[11px] font-bold uppercase tracking-wider text-navy-400">
                Current Staffing
              </span>
              <span className="block text-sm font-bold text-navy-900">
                {user.allocations.length} Active {user.allocations.length === 1 ? "Project" : "Projects"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Filters and Controls Card (identical to /pmt) */}
      <div className="bg-white rounded-2xl border border-navy-900/10 p-5 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-navy-900/8 pb-4">
          <div>
            <h2 className="text-base font-bold text-navy-900 font-[family-name:var(--font-league-spartan)]">
              Enterprise Project Portfolio ({filteredProjects.length})
            </h2>
            <p className="text-xs text-navy-500">
              Browse delivery projects by taxonomy, phase, or client and staff {user.fullName} directly.
            </p>
          </div>

          {/* Status Group Buttons */}
          <div className="inline-flex rounded-xl bg-neutral-100 p-1 text-xs font-semibold gap-1">
            {(
              [
                { id: "active", label: "Active", count: statusCounts.active },
                { id: "pipeline", label: "Pipeline", count: statusCounts.pipeline },
                { id: "all", label: "All Projects", count: statusCounts.all },
                { id: "on_hold", label: "On Hold", count: statusCounts.on_hold },
                { id: "closed", label: "Closed", count: statusCounts.closed },
              ] as const
            ).map((sg) => (
              <button
                key={sg.id}
                type="button"
                onClick={() => setStatusFilter(sg.id)}
                className={cn(
                  "px-3 py-1.5 rounded-lg transition-all cursor-pointer",
                  statusFilter === sg.id
                    ? "bg-white text-navy-900 font-bold shadow-xs"
                    : "text-navy-500 hover:text-navy-900"
                )}
              >
                {sg.label} <span className="opacity-60 text-[11px]">({sg.count})</span>
              </button>
            ))}
          </div>
        </div>

        {/* Filter inputs bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Search */}
          <div className="lg:col-span-2">
            <input
              type="text"
              placeholder="Search code, name, client, PM..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-9 rounded-lg border border-navy-900/15 bg-white px-3 text-xs text-navy-900 focus:border-navy-700 focus:outline-none"
            />
          </div>

          {/* Category */}
          <div>
            <select
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setTypeFilter("all");
              }}
              className="w-full h-9 rounded-lg border border-navy-900/15 bg-white px-2.5 text-xs text-navy-900 focus:border-navy-700 focus:outline-none"
            >
              <option value="all">All Categories</option>
              {ALL_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Project Type */}
          <div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              disabled={categoryFilter === "all" || availableTypes.length === 0}
              className="w-full h-9 rounded-lg border border-navy-900/15 bg-white px-2.5 text-xs text-navy-900 focus:border-navy-700 focus:outline-none disabled:opacity-50"
            >
              <option value="all">All Project Types</option>
              {availableTypes.map((pt) => (
                <option key={pt} value={pt}>
                  {pt}
                </option>
              ))}
            </select>
          </div>

          {/* Phase */}
          <div>
            <select
              value={phaseFilter}
              onChange={(e) => setPhaseFilter(e.target.value)}
              className="w-full h-9 rounded-lg border border-navy-900/15 bg-white px-2.5 text-xs text-navy-900 focus:border-navy-700 focus:outline-none"
            >
              <option value="all">All Phases</option>
              {PHASES.map((ph) => (
                <option key={ph} value={ph}>
                  {ph}
                </option>
              ))}
            </select>
          </div>

          {/* Sort By */}
          <div>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as any)}
              className="w-full h-9 rounded-lg border border-navy-900/15 bg-white px-2.5 text-xs text-navy-900 focus:border-navy-700 focus:outline-none"
            >
              <option value="name">Sort: Name (A-Z)</option>
              <option value="recent">Sort: Newest</option>
              <option value="budget">Sort: Budget</option>
              <option value="end">Sort: End Date</option>
            </select>
          </div>
        </div>
      </div>

      {/* Projects Table List View (matching /pmt) */}
      <div className="bg-white rounded-2xl border border-navy-900/10 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-navy-900 text-white font-semibold uppercase text-[11px] tracking-wider">
                <th className="px-4 py-3">Project</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Phase</th>
                <th className="px-4 py-3">Category &amp; Type</th>
                <th className="px-4 py-3">Classification</th>
                <th className="px-4 py-3">Timeline</th>
                <th className="px-4 py-3">Budget</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-900/8 text-navy-800">
              {filteredProjects.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-navy-400">
                    No projects found matching the selected filters.
                  </td>
                </tr>
              ) : (
                filteredProjects.map((p) => {
                  const isAllocated = allocatedProjectIds.has(p.id);
                  const alloc = allocatedProjectIds.get(p.id);
                  const phase = p.currentPhase || "Discovery";
                  const phaseIndex = Math.max(0, PHASES.indexOf(phase));

                  return (
                    <tr
                      key={p.id}
                      className={cn(
                        "transition-colors hover:bg-navy-50/60",
                        isAllocated && "bg-emerald-50/30"
                      )}
                    >
                      {/* Project */}
                      <td className="px-4 py-3.5 align-middle">
                        <div className="flex items-start gap-2.5">
                          <CodeChip className="shrink-0 mt-0.5">{p.code}</CodeChip>
                          <div>
                            <span className="font-bold text-navy-900 block text-xs">
                              {p.name}
                            </span>
                            {p.description && (
                              <p className="text-[11px] text-navy-400 line-clamp-1 mt-0.5">
                                {p.description}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Client */}
                      <td className="px-4 py-3.5 align-middle text-navy-700 font-medium">
                        {p.clientCompanyName || "Internal"}
                      </td>

                      {/* Phase */}
                      <td className="px-4 py-3.5 align-middle">
                        <div className="w-24">
                          <span className={cn("inline-block px-2 py-0.5 rounded text-[10.5px] font-bold border", phaseColorClass(phase))}>
                            {phase}
                          </span>
                          <div className="mt-1 flex gap-[2px]">
                            {PHASES.map((ph, i) => (
                              <span
                                key={ph}
                                className={cn(
                                  "h-1 flex-1 rounded-full",
                                  i <= phaseIndex ? "bg-navy-700" : "bg-navy-900/10"
                                )}
                              />
                            ))}
                          </div>
                        </div>
                      </td>

                      {/* Category & Type */}
                      <td className="px-4 py-3.5 align-middle">
                        <div className="flex flex-col gap-1 items-start">
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-navy-100 text-navy-800">
                            {p.category || "General"}
                          </span>
                          {p.projectType && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-neutral-100 text-navy-600">
                              {p.projectType}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Classification */}
                      <td className="px-4 py-3.5 align-middle">
                        <span
                          className={cn(
                            "inline-flex items-center rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide border",
                            p.classification === "group"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-orange-50 text-orange-700 border-orange-200"
                          )}
                        >
                          {p.classification === "group" ? "Group" : "Non-Group"}
                        </span>
                      </td>

                      {/* Timeline */}
                      <td className="px-4 py-3.5 align-middle text-navy-600 font-mono text-[11px] whitespace-nowrap">
                        {p.startDate ? String(p.startDate).slice(0, 10) : "—"}
                        {" → "}
                        {p.plannedEndDate ? String(p.plannedEndDate).slice(0, 10) : "—"}
                      </td>

                      {/* Budget */}
                      <td className="px-4 py-3.5 align-middle font-semibold text-navy-900">
                        {p.budgetInr ? formatCurrency(Number(p.budgetInr), p.currency || "INR") : "—"}
                      </td>

                      {/* Action */}
                      <td className="px-4 py-3.5 align-middle text-right whitespace-nowrap">
                        {isAllocated ? (
                          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold border border-emerald-300">
                            <span>✓ Allocated</span>
                            <span className="text-[10px] opacity-80">({alloc?.allocationPercent}%)</span>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleOpenAllocateModal(p)}
                            className="bg-navy-900 hover:bg-navy-800 text-white text-xs px-3 py-1.5 h-8 font-semibold shadow-xs"
                          >
                            + Allocate Resource
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Allocation Modal */}
      {selectedProject && (
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={`Allocate ${user.fullName} to Project`}
        >
          <form onSubmit={handleSubmitAllocation} className="space-y-4">
            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs font-semibold text-red-700">
                {error}
              </div>
            )}

            {/* Project Header in modal */}
            <div className="rounded-xl bg-navy-50/80 border border-navy-900/10 p-3.5">
              <div className="flex items-center gap-2">
                <CodeChip>{selectedProject.code}</CodeChip>
                <span className="font-bold text-sm text-navy-900">{selectedProject.name}</span>
              </div>
              <div className="flex items-center gap-4 text-xs text-navy-500 mt-1.5">
                <span>Client: <strong className="text-navy-700">{selectedProject.clientCompanyName || "Internal"}</strong></span>
                <span>Category: <strong className="text-navy-700">{selectedProject.category || "General"}</strong></span>
                <span>Currency: <strong className="text-navy-700">{selectedProject.currency || "INR"}</strong></span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-navy-700 mb-1.5">
                  Role in Project *
                </label>
                <input
                  type="text"
                  required
                  value={roleInProject}
                  onChange={(e) => setRoleInProject(e.target.value)}
                  placeholder="e.g. Lead Consultant, Developer"
                  list="project-roles-list"
                  className="w-full h-10 rounded-lg border border-navy-900/15 bg-white px-3 text-sm text-navy-900 focus:border-navy-700 focus:outline-none"
                />
                <datalist id="project-roles-list">
                  {customRoles.map((r) => (
                    <option key={r.id} value={r.name} />
                  ))}
                  <option value="Consultant" />
                  <option value="Senior Consultant" />
                  <option value="Technical Architect" />
                  <option value="Lead Consultant" />
                  <option value="Developer" />
                  <option value="DevOps Engineer" />
                  <option value="QA Automation Engineer" />
                  <option value="Scrum Master" />
                </datalist>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-navy-700 mb-1.5">
                  Member Type *
                </label>
                <select
                  value={memberType}
                  onChange={(e) => setMemberType(e.target.value as any)}
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
                  value={customDailyCostInr}
                  onChange={(e) => setCustomDailyCostInr(e.target.value)}
                  placeholder="Daily CTC for labor costing"
                  className="w-full h-10 rounded-lg border border-navy-900/15 bg-white px-3 text-sm text-navy-900 focus:border-navy-700 focus:outline-none"
                />
                <p className="text-[11px] text-navy-400 mt-1">
                  CTC-derived daily rate for planned labor costing.
                </p>
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
                  value={allocationPercent}
                  onChange={(e) => setAllocationPercent(e.target.value)}
                  className="w-full h-10 rounded-lg border border-navy-900/15 bg-white px-3 text-sm text-navy-900 focus:border-navy-700 focus:outline-none"
                />
                <p className="text-[11px] text-navy-400 mt-1">
                  Committed bandwidth on this project.
                </p>
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
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full h-10 rounded-lg border border-navy-900/15 bg-white px-3 text-sm text-navy-900 focus:border-navy-700 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-navy-700 mb-1.5">
                  End Date *
                </label>
                <input
                  type="date"
                  required
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full h-10 rounded-lg border border-navy-900/15 bg-white px-3 text-sm text-navy-900 focus:border-navy-700 focus:outline-none"
                />
              </div>
            </div>

            {/* Multi-Period Toggle & Editor */}
            <div className="pt-2 border-t border-navy-900/8">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-navy-900">
                  Date-wise Multi-Period Allocation %
                </span>
                <button
                  type="button"
                  onClick={() => setUsePeriods(!usePeriods)}
                  className="text-xs text-blue-600 hover:underline font-semibold"
                >
                  {usePeriods ? "Disable Multi-Period" : "+ Configure Varying Allocation %"}
                </button>
              </div>

              {usePeriods && (
                <div className="space-y-2 bg-neutral-50 p-3 rounded-lg border border-navy-900/10">
                  <p className="text-[11px] text-navy-500 mb-2">
                    Specify custom periods if this resource’s allocation % changes over time.
                  </p>
                  {periods.map((p, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="date"
                        value={p.startDate}
                        onChange={(e) => {
                          const copy = [...periods];
                          copy[idx].startDate = e.target.value;
                          setPeriods(copy);
                        }}
                        className="h-8 rounded border border-navy-900/15 bg-white px-2 text-xs text-navy-900"
                      />
                      <span className="text-xs text-navy-400">to</span>
                      <input
                        type="date"
                        value={p.endDate}
                        onChange={(e) => {
                          const copy = [...periods];
                          copy[idx].endDate = e.target.value;
                          setPeriods(copy);
                        }}
                        className="h-8 rounded border border-navy-900/15 bg-white px-2 text-xs text-navy-900"
                      />
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={p.allocationPercent}
                        onChange={(e) => {
                          const copy = [...periods];
                          copy[idx].allocationPercent = Number(e.target.value) || 0;
                          setPeriods(copy);
                        }}
                        className="h-8 w-16 rounded border border-navy-900/15 bg-white px-2 text-xs text-navy-900"
                      />
                      <span className="text-xs text-navy-500">%</span>
                      {periods.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setPeriods(periods.filter((_, i) => i !== idx))}
                          className="text-red-500 hover:text-red-700 text-xs px-1"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      setPeriods([...periods, { startDate: "", endDate: "", allocationPercent: 100 }])
                    }
                    className="text-xs text-navy-700 hover:underline font-semibold pt-1"
                  >
                    + Add Another Period
                  </button>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-navy-700 mb-1.5">
                Staffing Notes
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional assignment notes, deliverables scope, etc."
                className="w-full rounded-lg border border-navy-900/15 bg-white p-2.5 text-xs text-navy-900 focus:border-navy-700 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-navy-900/8">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="bg-navy-900 hover:bg-navy-800 text-white font-semibold"
              >
                {submitting ? "Allocating..." : "Confirm & Allocate to Project"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
