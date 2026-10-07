"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { ChangeRequest, User, Project } from "@/lib/types";
import { DataTable, type Column } from "@/components/ui/Table";
import { ColorBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Combobox } from "@/components/ui/Combobox";
import { formatDate, formatStatus, priorityColor, impactColor } from "@/lib/utils";

const changeStatusColor = (status: string) => {
  switch (status) {
    case "draft": return "bg-navy-500/10 text-navy-700 border border-navy-500/20";
    case "submitted": return "bg-blue-500 text-white";
    case "approved": return "bg-emerald-600 text-white";
    case "rejected": return "bg-red-600 text-white";
    case "in_progress": return "bg-navy-800 text-white";
    case "completed": return "bg-emerald-600 text-white";
    case "closed": return "bg-neutral-100 text-neutral-700 border border-neutral-300";
    default: return "bg-neutral-100 text-neutral-800";
  }
};

export function ChangesClient({ changes: initialChanges }: { changes: ChangeRequest[] }) {
  const router = useRouter();

  const [changes, setChanges] = useState<ChangeRequest[]>(initialChanges);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [agents, setAgents] = useState<User[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  const [newChange, setNewChange] = useState({
    subject: "",
    description: "",
    changeType: "standard",
    priority: "medium",
    impact: "medium",
    risk: "low",
    projectCode: "",
    agentUserId: "",
  });

  useEffect(() => {
    async function loadData() {
      try {
        const [agRes, prjRes] = await Promise.all([
          fetch("/api/itsm/agents"),
          fetch("/api/pmt/projects"),
        ]);
        if (agRes.ok) {
          const d = await agRes.json();
          if (d.success && d.data) setAgents(d.data);
        }
        if (prjRes.ok) {
          const d = await prjRes.json();
          if (d.projects) setProjects(d.projects);
        }
      } catch (err) {
        console.error("Failed to load options:", err);
      }
    }
    loadData();
  }, []);

  const handleCreateChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChange.subject) return;

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/itsm/changes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newChange),
      });

      if (res.ok) {
        setIsModalOpen(false);
        setNewChange({
          subject: "",
          description: "",
          changeType: "standard",
          priority: "medium",
          impact: "medium",
          risk: "low",
          projectCode: "",
          agentUserId: "",
        });

        // Refresh list
        const refreshRes = await fetch("/api/itsm/changes");
        if (refreshRes.ok) {
          const d = await refreshRes.json();
          if (d.changes) setChanges(d.changes);
        } else {
          router.refresh();
        }
      } else {
        const err = await res.json();
        alert(`Failed to create change: ${err.error || res.statusText}`);
      }
    } catch (err) {
      console.error(err);
      alert("Failed to create change request due to network error.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const filtered = useMemo(() => {
    return changes.filter((c) => {
      const matchesStatus = statusFilter === "all" || c.status === statusFilter;
      const matchesSearch =
        !searchTerm.trim() ||
        c.changeNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.projectCode && c.projectCode.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (c.agent?.fullName && c.agent.fullName.toLowerCase().includes(searchTerm.toLowerCase()));

      return matchesStatus && matchesSearch;
    });
  }, [changes, statusFilter, searchTerm]);

  const columns: Column<ChangeRequest>[] = [
    {
      key: "changeNumber",
      header: "Change #",
      render: (c) => (
        <span className="font-mono text-xs font-bold text-navy-800 bg-neutral-100 px-2 py-0.5 rounded border border-neutral-200">
          {c.changeNumber}
        </span>
      ),
      className: "whitespace-nowrap w-28",
    },
    {
      key: "subject",
      header: "Subject & Description",
      render: (c) => (
        <div className="max-w-md">
          <p className="font-semibold text-navy-900">{c.subject}</p>
          {c.description && <p className="text-xs text-navy-500 line-clamp-1 mt-0.5">{c.description}</p>}
        </div>
      ),
    },
    {
      key: "projectCode",
      header: "Project",
      render: (c) =>
        c.projectCode ? (
          <span className="font-mono text-xs font-bold text-blue-600">{c.projectCode}</span>
        ) : (
          <span className="text-xs text-neutral-400 italic">—</span>
        ),
      className: "w-28",
    },
    {
      key: "changeType",
      header: "Type",
      render: (c) => (
        <span className="text-xs uppercase font-semibold text-neutral-600 bg-neutral-100 px-2 py-0.5 rounded">
          {formatStatus(c.changeType || "standard")}
        </span>
      ),
      className: "w-28",
    },
    {
      key: "status",
      header: "Status",
      render: (c) => (
        <ColorBadge colorClass={changeStatusColor(c.status)}>
          {formatStatus(c.status)}
        </ColorBadge>
      ),
      className: "w-28",
    },
    {
      key: "priority",
      header: "Priority",
      render: (c) =>
        c.priority ? (
          <ColorBadge colorClass={priorityColor(c.priority)}>
            {formatStatus(c.priority)}
          </ColorBadge>
        ) : (
          <span className="text-navy-500">—</span>
        ),
      className: "w-24",
    },
    {
      key: "impact",
      header: "Impact / Risk",
      render: (c) => (
        <div className="flex items-center gap-1.5 text-xs">
          <ColorBadge colorClass={impactColor(c.impact || "medium")}>
            {formatStatus(c.impact || "medium")}
          </ColorBadge>
          <span className="text-neutral-400">/</span>
          <ColorBadge colorClass={impactColor(c.risk || "low")}>
            {formatStatus(c.risk || "low")}
          </ColorBadge>
        </div>
      ),
      className: "w-36",
    },
    {
      key: "agent",
      header: "Agent",
      render: (c) => (
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-800 font-bold text-[10px] flex items-center justify-center">
            {c.agent?.fullName
              ? c.agent.fullName
                  .split(" ")
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join("")
              : "—"}
          </div>
          <div>
            <p className="text-xs font-medium text-navy-900 leading-tight">
              {c.agent?.fullName || "Unassigned"}
            </p>
            {c.agent?.jobLevel && (
              <p className="text-[10px] text-navy-400">{c.agent.jobLevel}</p>
            )}
          </div>
        </div>
      ),
      className: "w-40",
    },
    {
      key: "createdAt",
      header: "Created",
      render: (c) => (
        <span className="text-navy-500 tabular-nums text-xs whitespace-nowrap">
          {formatDate(c.createdAt)}
        </span>
      ),
      className: "w-28",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy-900 font-[family-name:var(--font-league-spartan)]">
            Change Management
          </h1>
          <p className="text-sm text-navy-500 mt-1">
            Evaluate, schedule, and approve changes to production systems and delivery scopes
          </p>
        </div>
        <Button onClick={() => setIsModalOpen(true)}>
          <svg className="w-4 h-4 mr-1.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
          New Change Request
        </Button>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-80">
          <svg className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search change #, subject, agent..."
            className="w-full text-sm pl-9 pr-8 py-2 rounded-lg border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 text-xs">
              ✕
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 bg-neutral-100 p-1 rounded-lg text-xs overflow-x-auto">
          {["all", "draft", "approved", "in_progress", "completed", "closed"].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1 rounded-md font-medium transition-colors whitespace-nowrap ${
                statusFilter === st
                  ? "bg-white text-navy-900 shadow-sm font-bold"
                  : "text-neutral-600 hover:text-navy-900"
              }`}
            >
              {st === "all" ? "All" : formatStatus(st)}
            </button>
          ))}
        </div>
      </div>

      <DataTable columns={columns} data={filtered} emptyMessage="No change requests found" />

      {/* New Change Request Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Create Change Request"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="create-change-form" disabled={isSubmitting || !newChange.subject}>
              {isSubmitting ? "Submitting..." : "Submit Change"}
            </Button>
          </>
        }
      >
        <form id="create-change-form" onSubmit={handleCreateChange} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-navy-700 mb-1">
              Subject *
            </label>
            <Input
              value={newChange.subject}
              onChange={(e) => setNewChange({ ...newChange, subject: e.target.value })}
              placeholder="e.g. Database connection pool increase"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-navy-700 mb-1">Description</label>
            <textarea
              value={newChange.description}
              onChange={(e) => setNewChange({ ...newChange, description: e.target.value })}
              placeholder="Reason for change, impact analysis, and rollout plan..."
              className="w-full text-sm rounded-lg border border-neutral-200 px-3 py-2 text-navy-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Combobox
                label="Change Type"
                value={newChange.changeType}
                onChange={(val) => setNewChange({ ...newChange, changeType: val })}
                options={[
                  { value: "standard", label: "Standard" },
                  { value: "normal", label: "Normal" },
                  { value: "emergency", label: "Emergency" },
                  { value: "major", label: "Major" },
                ]}
              />
            </div>
            <div>
              <Combobox
                label="Priority"
                value={newChange.priority}
                onChange={(val) => setNewChange({ ...newChange, priority: val })}
                options={[
                  { value: "low", label: "Low" },
                  { value: "medium", label: "Medium" },
                  { value: "high", label: "High" },
                  { value: "urgent", label: "Urgent" },
                ]}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Combobox
                label="Impact"
                value={newChange.impact}
                onChange={(val) => setNewChange({ ...newChange, impact: val })}
                options={[
                  { value: "low", label: "Low" },
                  { value: "medium", label: "Medium" },
                  { value: "high", label: "High" },
                ]}
              />
            </div>
            <div>
              <Combobox
                label="Risk"
                value={newChange.risk}
                onChange={(val) => setNewChange({ ...newChange, risk: val })}
                options={[
                  { value: "low", label: "Low" },
                  { value: "medium", label: "Medium" },
                  { value: "high", label: "High" },
                ]}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Combobox
                label="Linked Project"
                value={newChange.projectCode}
                onChange={(val) => setNewChange({ ...newChange, projectCode: val })}
                options={[
                  { value: "", label: "No Project (Infrastructure/Platform)" },
                  ...projects.map((p) => ({
                    value: p.code,
                    label: `${p.code} — ${p.name}`,
                  })),
                ]}
                searchThreshold={0}
              />
            </div>
            <div>
              <Combobox
                label="Assigned Agent"
                value={newChange.agentUserId}
                onChange={(val) => setNewChange({ ...newChange, agentUserId: val })}
                options={[
                  { value: "", label: "Select Agent..." },
                  ...agents.map((ag) => ({
                    value: ag.id,
                    label: ag.fullName,
                    detail: ag.jobLevel || undefined,
                  })),
                ]}
                searchThreshold={0}
              />
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
