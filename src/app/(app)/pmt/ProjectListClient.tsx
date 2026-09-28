"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AppRole, Project, User } from "@/lib/types";
import { StatCard } from "@/components/ui/Card";
import { DataTable, type Column } from "@/components/ui/Table";
import { ColorBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { formatDate, formatStatus, projectStatusColor, formatCurrency } from "@/lib/utils";
import { PmtHeaderTabs } from "@/components/layout/PmtHeaderTabs";
import { Combobox } from "@/components/ui/Combobox";

const PHASES = [
  "Discovery",
  "Design",
  "Build",
  "Execution",
  "Testing",
  "UAT",
  "Go-Live",
  "Closure",
];

export function phaseColorClass(phase?: string) {
  switch (phase?.toLowerCase()) {
    case "discovery":
      return "bg-sky-50 text-sky-700 border-sky-200";
    case "design":
      return "bg-purple-50 text-purple-700 border-purple-200";
    case "build":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "execution":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "testing":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "uat":
      return "bg-orange-50 text-orange-700 border-orange-200";
    case "go-live":
      return "bg-teal-50 text-teal-700 border-teal-200";
    case "closure":
      return "bg-neutral-100 text-neutral-700 border-neutral-200";
    default:
      return "bg-neutral-50 text-neutral-600 border-neutral-200";
  }
}

export function ProjectListClient({
  projects: initialProjects,
  userRole = "member",
}: {
  projects: Project[];
  userRole?: AppRole;
}) {
  const router = useRouter();

  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [phaseFilter, setPhaseFilter] = useState<string>("all");
  const [employees, setEmployees] = useState<User[]>([]);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newProject, setNewProject] = useState({
    name: "",
    description: "",
    clientCompanyName: "",
    projectManagerUserId: "",
    currentPhase: "Discovery",
    startDate: "",
    plannedEndDate: "",
    budgetInr: "",
  });

  // Fetch employees for PM dropdown
  useEffect(() => {
    async function loadEmployees() {
      try {
        const res = await fetch("/api/itsm/agents");
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.data) {
            setEmployees(data.data);
          }
        }
      } catch (err) {
        console.error("Failed to load employees for PM select:", err);
      }
    }
    loadEmployees();
  }, []);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProject.name) return;

    setIsSubmitting(true);
    try {
      const payload = {
        name: newProject.name,
        description: newProject.description || null,
        clientCompanyName: newProject.clientCompanyName || null,
        projectManagerUserId: newProject.projectManagerUserId || null,
        currentPhase: newProject.currentPhase || "Discovery",
        startDate: newProject.startDate || null,
        plannedEndDate: newProject.plannedEndDate || null,
        budgetInr: newProject.budgetInr ? Number(newProject.budgetInr) : null,
      };

      const res = await fetch("/api/pmt/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setIsModalOpen(false);
        setNewProject({
          name: "",
          description: "",
          clientCompanyName: "",
          projectManagerUserId: "",
          currentPhase: "Discovery",
          startDate: "",
          plannedEndDate: "",
          budgetInr: "",
        });
        // Fetch refreshed list
        const refreshRes = await fetch("/api/pmt/projects");
        if (refreshRes.ok) {
          const refData = await refreshRes.json();
          if (refData.projects) setProjects(refData.projects);
        } else {
          router.refresh();
        }
      } else {
        const errorData = await res.json();
        alert(`Failed to create project: ${errorData.error || res.statusText}`);
      }
    } catch (err) {
      console.error(err);
      alert("Failed to create project due to network error.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtered projects
  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      const matchesSearch =
        !searchTerm.trim() ||
        p.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.clientCompanyName && p.clientCompanyName.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (p.projectManager?.fullName && p.projectManager.fullName.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesStatus = statusFilter === "all" || p.status === statusFilter;
      const matchesPhase = phaseFilter === "all" || p.currentPhase === phaseFilter;

      return matchesSearch && matchesStatus && matchesPhase;
    });
  }, [projects, searchTerm, statusFilter, phaseFilter]);

  const activeCount = projects.filter((p) => p.status === "active").length;
  const planningCount = projects.filter((p) => p.status === "planning" || p.status === "initiated").length;
  const onHoldCount = projects.filter((p) => p.status === "on_hold").length;
  const closedCount = projects.filter((p) => p.status === "closed").length;

  const columns: Column<Project>[] = [
    {
      key: "code",
      header: "Project #",
      render: (p) => (
        <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-neutral-100 text-navy-800 border border-neutral-200">
          {p.code}
        </span>
      ),
      className: "whitespace-nowrap w-28",
    },
    {
      key: "name",
      header: "Name & Description",
      render: (p) => (
        <div className="max-w-md">
          <p className="font-semibold text-navy-900 hover:text-blue-600 transition-colors">{p.name}</p>
          {p.description && (
            <p className="text-xs text-navy-500 mt-0.5 line-clamp-1">{p.description}</p>
          )}
        </div>
      ),
    },
    {
      key: "clientCompanyName",
      header: "Client Company",
      render: (p) => (
        <span className="text-sm font-medium text-navy-700">
          {p.clientCompanyName || "Internal Project"}
        </span>
      ),
    },
    {
      key: "currentPhase",
      header: "Current Phase",
      render: (p) => (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full border ${phaseColorClass(p.currentPhase)}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-current" />
          {p.currentPhase || "Discovery"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (p) => (
        <ColorBadge colorClass={projectStatusColor(p.status)}>
          {formatStatus(p.status)}
        </ColorBadge>
      ),
    },
    {
      key: "projectManager",
      header: "Project Manager",
      render: (p) => (
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-navy-100 text-navy-800 font-bold text-xs flex items-center justify-center">
            {p.projectManager?.fullName
              ? p.projectManager.fullName
                  .split(" ")
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join("")
              : "—"}
          </div>
          <div>
            <p className="text-xs font-medium text-navy-900 leading-tight">
              {p.projectManager?.fullName || "Unassigned"}
            </p>
            {p.projectManager?.jobLevel && (
              <p className="text-[10px] text-navy-500">{p.projectManager.jobLevel}</p>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "budgetInr",
      header: "Budget (INR)",
      numeric: true,
      render: (p) => (
        <span className="text-xs font-semibold text-navy-800 tabular-nums">
          {p.budgetInr ? formatCurrency(Number(p.budgetInr)) : "—"}
        </span>
      ),
    },
    {
      key: "timeline",
      header: "Timeline",
      render: (p) => (
        <div className="text-xs text-navy-600 tabular-nums whitespace-nowrap">
          {p.startDate ? formatDate(p.startDate) : "TBD"}
          {" → "}
          {p.plannedEndDate ? formatDate(p.plannedEndDate) : "TBD"}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* PMT High-Level Tabs */}
      <PmtHeaderTabs
        title="Project Management Center"
        subtitle="Manage and track delivery, WBS execution, financials, and client milestones"
        action={
          <div className="flex items-center gap-2">
            {userRole === "admin" && (
              <Link href="/pmt/scrapped">
                <Button variant="secondary" size="md">
                  Scrapped
                </Button>
              </Link>
            )}
          <Button data-guide="project:new" onClick={() => setIsModalOpen(true)}>
            <svg className="w-4 h-4 mr-1.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            New Project
          </Button>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Projects"
          value={projects.length}
          icon={
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
            </svg>
          }
        />
        <StatCard
          label="Active Delivery"
          value={activeCount}
          icon={
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          }
        />
        <StatCard
          label="In Pipeline / Planning"
          value={planningCount}
          icon={
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
            </svg>
          }
        />
        <StatCard
          label="On Hold / Closed"
          value={onHoldCount + closedCount}
          icon={
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          }
        />
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        {/* Search */}
        <div className="relative w-full md:w-80">
          <svg className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search code, name, client, PM..."
            className="w-full text-sm pl-9 pr-8 py-2 rounded-lg border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 text-xs"
            >
              ✕
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 w-full md:w-auto flex-wrap">
          {/* Status Filter */}
          <div className="flex items-center gap-1 bg-neutral-100 p-1 rounded-lg text-xs">
            {["all", "active", "planning", "on_hold", "closed"].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1 rounded-md font-medium transition-colors ${
                  statusFilter === st
                    ? "bg-white text-navy-900 shadow-sm"
                    : "text-neutral-600 hover:text-navy-900"
                }`}
              >
                {st === "all" ? "All" : formatStatus(st)}
              </button>
            ))}
          </div>

          <Combobox
            className="min-w-[180px]"
            value={phaseFilter}
            onChange={setPhaseFilter}
            placeholder="All Phases"
            searchPlaceholder="Search phases…"
            options={[
              { value: "all", label: "All Phases", hint: String(projects.length) },
              ...PHASES.map((ph) => ({
                value: ph,
                label: ph,
                hint: String(projects.filter((pr) => pr.currentPhase === ph).length),
              })),
            ]}
          />
        </div>
      </div>

      {/* Project Table */}
      <DataTable
        columns={columns}
        data={filteredProjects}
        onRowClick={(p) => router.push(`/pmt/${p.code || p.id}`)}
        emptyMessage={
          searchTerm || statusFilter !== "all" || phaseFilter !== "all"
            ? "No projects match your search and filter criteria."
            : "No projects found"
        }
      />

      {/* New Project Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Create New Project"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateProject} disabled={isSubmitting || !newProject.name}>
              {isSubmitting ? "Creating..." : "Create Project"}
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreateProject} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-navy-700 mb-1">
              Project Name *
            </label>
            <Input
              value={newProject.name}
              onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
              placeholder="e.g. Cloud ERP Transformation"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-navy-700 mb-1">Description</label>
            <textarea
              value={newProject.description}
              onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
              placeholder="Briefly describe the project goals and business value..."
              className="w-full text-sm rounded-lg border border-neutral-200 px-3 py-2 text-navy-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-navy-700 mb-1">Client Company</label>
              <Input
                value={newProject.clientCompanyName}
                onChange={(e) => setNewProject({ ...newProject, clientCompanyName: e.target.value })}
                placeholder="e.g. Tata Consultancy Services"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-navy-700 mb-1">Initial Phase</label>
              <select
                value={newProject.currentPhase}
                onChange={(e) => setNewProject({ ...newProject, currentPhase: e.target.value })}
                className="w-full text-sm rounded-lg border border-neutral-200 px-3 py-2 text-navy-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {PHASES.map((ph) => (
                  <option key={ph} value={ph}>
                    {ph}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-navy-700 mb-1">Project Manager</label>
              <select
                value={newProject.projectManagerUserId}
                onChange={(e) => setNewProject({ ...newProject, projectManagerUserId: e.target.value })}
                className="w-full text-sm rounded-lg border border-neutral-200 px-3 py-2 text-navy-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">Select Project Manager...</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.fullName} {emp.jobLevel ? `(${emp.jobLevel})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-navy-700 mb-1">Budget (INR)</label>
              <Input
                type="number"
                value={newProject.budgetInr}
                onChange={(e) => setNewProject({ ...newProject, budgetInr: e.target.value })}
                placeholder="e.g. 5000000"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-navy-700 mb-1">Start Date</label>
              <Input
                type="date"
                value={newProject.startDate}
                onChange={(e) => setNewProject({ ...newProject, startDate: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-navy-700 mb-1">Planned End Date</label>
              <Input
                type="date"
                value={newProject.plannedEndDate}
                onChange={(e) => setNewProject({ ...newProject, plannedEndDate: e.target.value })}
              />
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
