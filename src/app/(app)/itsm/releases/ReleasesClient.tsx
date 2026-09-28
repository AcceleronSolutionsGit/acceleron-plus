"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Release, User } from "@/lib/types";
import { DataTable, type Column } from "@/components/ui/Table";
import { ColorBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { formatDate, formatStatus, priorityColor } from "@/lib/utils";

const releaseStatusColor = (status: string) => {
  switch (status) {
    case "planned": return "bg-blue-500 text-white";
    case "in_progress": return "bg-navy-800 text-white";
    case "completed": return "bg-emerald-600 text-white";
    case "cancelled": return "bg-red-600 text-white";
    default: return "bg-neutral-100 text-neutral-800";
  }
};

export function ReleasesClient({ releases: initialReleases }: { releases: Release[] }) {
  const router = useRouter();

  const [releases, setReleases] = useState<Release[]>(initialReleases);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [agents, setAgents] = useState<User[]>([]);

  const [newRelease, setNewRelease] = useState({
    subject: "",
    description: "",
    releaseType: "minor",
    priority: "medium",
    plannedStart: "",
    plannedEnd: "",
    agentUserId: "",
  });

  useEffect(() => {
    async function loadAgents() {
      try {
        const res = await fetch("/api/itsm/agents");
        if (res.ok) {
          const d = await res.json();
          if (d.success && d.data) setAgents(d.data);
        }
      } catch (err) {
        console.error("Failed to load agents:", err);
      }
    }
    loadAgents();
  }, []);

  const handleCreateRelease = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRelease.subject) return;

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/itsm/releases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newRelease),
      });

      if (res.ok) {
        setIsModalOpen(false);
        setNewRelease({
          subject: "",
          description: "",
          releaseType: "minor",
          priority: "medium",
          plannedStart: "",
          plannedEnd: "",
          agentUserId: "",
        });

        // Refresh list
        const refreshRes = await fetch("/api/itsm/releases");
        if (refreshRes.ok) {
          const d = await refreshRes.json();
          if (d.releases) setReleases(d.releases);
        } else {
          router.refresh();
        }
      } else {
        const err = await res.json();
        alert(`Failed to create release: ${err.error || res.statusText}`);
      }
    } catch (err) {
      console.error(err);
      alert("Failed to create release due to network error.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const filtered = useMemo(() => {
    return releases.filter((r) => {
      const matchesStatus = statusFilter === "all" || r.status === statusFilter;
      const matchesSearch =
        !searchTerm.trim() ||
        r.releaseNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (r.agent?.fullName && r.agent.fullName.toLowerCase().includes(searchTerm.toLowerCase()));

      return matchesStatus && matchesSearch;
    });
  }, [releases, statusFilter, searchTerm]);

  const columns: Column<Release>[] = [
    {
      key: "releaseNumber",
      header: "Release #",
      render: (r) => (
        <span className="font-mono text-xs font-bold text-navy-800 bg-neutral-100 px-2 py-0.5 rounded border border-neutral-200">
          {r.releaseNumber}
        </span>
      ),
      className: "whitespace-nowrap w-28",
    },
    {
      key: "subject",
      header: "Subject & Description",
      render: (r) => (
        <div className="max-w-md">
          <p className="font-semibold text-navy-900">{r.subject}</p>
          {r.description && <p className="text-xs text-navy-500 line-clamp-1 mt-0.5">{r.description}</p>}
        </div>
      ),
    },
    {
      key: "releaseType",
      header: "Type",
      render: (r) => (
        <span className="text-xs uppercase font-semibold text-neutral-600 bg-neutral-100 px-2 py-0.5 rounded">
          {formatStatus(r.releaseType || "minor")}
        </span>
      ),
      className: "w-28",
    },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <ColorBadge colorClass={releaseStatusColor(r.status)}>
          {formatStatus(r.status)}
        </ColorBadge>
      ),
      className: "w-28",
    },
    {
      key: "priority",
      header: "Priority",
      render: (r) =>
        r.priority ? (
          <ColorBadge colorClass={priorityColor(r.priority)}>
            {formatStatus(r.priority)}
          </ColorBadge>
        ) : (
          <span className="text-navy-500">—</span>
        ),
      className: "w-24",
    },
    {
      key: "plannedStart",
      header: "Planned Start",
      render: (r) => (
        <span className="text-navy-500 tabular-nums text-xs whitespace-nowrap">
          {r.plannedStart ? formatDate(r.plannedStart) : "TBD"}
        </span>
      ),
      className: "w-28",
    },
    {
      key: "plannedEnd",
      header: "Planned End",
      render: (r) => (
        <span className="text-navy-500 tabular-nums text-xs whitespace-nowrap">
          {r.plannedEnd ? formatDate(r.plannedEnd) : "TBD"}
        </span>
      ),
      className: "w-28",
    },
    {
      key: "agent",
      header: "Lead Agent",
      render: (r) => (
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-800 font-bold text-[10px] flex items-center justify-center">
            {r.agent?.fullName
              ? r.agent.fullName
                  .split(" ")
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join("")
              : "—"}
          </div>
          <div>
            <p className="text-xs font-medium text-navy-900 leading-tight">
              {r.agent?.fullName || "Unassigned"}
            </p>
            {r.agent?.jobLevel && (
              <p className="text-[10px] text-navy-400">{r.agent.jobLevel}</p>
            )}
          </div>
        </div>
      ),
      className: "w-40",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy-900 font-[family-name:var(--font-league-spartan)]">
            Release Management
          </h1>
          <p className="text-sm text-navy-500 mt-1">
            Plan, coordinate, and track deployment releases and software versions
          </p>
        </div>
        <Button onClick={() => setIsModalOpen(true)}>
          <svg className="w-4 h-4 mr-1.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
          New Release
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
            placeholder="Search release #, subject, agent..."
            className="w-full text-sm pl-9 pr-8 py-2 rounded-lg border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 text-xs">
              ✕
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 bg-neutral-100 p-1 rounded-lg text-xs overflow-x-auto">
          {["all", "planned", "in_progress", "completed", "cancelled"].map((st) => (
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

      <DataTable columns={columns} data={filtered} emptyMessage="No releases found" />

      {/* New Release Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Create New Release"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateRelease} disabled={isSubmitting || !newRelease.subject}>
              {isSubmitting ? "Creating..." : "Create Release"}
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreateRelease} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-navy-700 mb-1">
              Release Subject *
            </label>
            <Input
              value={newRelease.subject}
              onChange={(e) => setNewRelease({ ...newRelease, subject: e.target.value })}
              placeholder="e.g. Platform v3.3.0 — September Maintenance"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-navy-700 mb-1">Description</label>
            <textarea
              value={newRelease.description}
              onChange={(e) => setNewRelease({ ...newRelease, description: e.target.value })}
              placeholder="Release notes, scope changes, and rollback contingencies..."
              className="w-full text-sm rounded-lg border border-neutral-200 px-3 py-2 text-navy-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-navy-700 mb-1">Release Type</label>
              <select
                value={newRelease.releaseType}
                onChange={(e) => setNewRelease({ ...newRelease, releaseType: e.target.value })}
                className="w-full text-sm rounded-lg border border-neutral-200 px-3 py-2 text-navy-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="minor">Minor</option>
                <option value="major">Major</option>
                <option value="hotfix">Hotfix</option>
                <option value="emergency">Emergency</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-navy-700 mb-1">Priority</label>
              <select
                value={newRelease.priority}
                onChange={(e) => setNewRelease({ ...newRelease, priority: e.target.value })}
                className="w-full text-sm rounded-lg border border-neutral-200 px-3 py-2 text-navy-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-navy-700 mb-1">Planned Start</label>
              <Input
                type="date"
                value={newRelease.plannedStart}
                onChange={(e) => setNewRelease({ ...newRelease, plannedStart: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-navy-700 mb-1">Planned End</label>
              <Input
                type="date"
                value={newRelease.plannedEnd}
                onChange={(e) => setNewRelease({ ...newRelease, plannedEnd: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-navy-700 mb-1">Lead Agent</label>
            <select
              value={newRelease.agentUserId}
              onChange={(e) => setNewRelease({ ...newRelease, agentUserId: e.target.value })}
              className="w-full text-sm rounded-lg border border-neutral-200 px-3 py-2 text-navy-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">Select Release Lead...</option>
              {agents.map((ag) => (
                <option key={ag.id} value={ag.id}>
                  {ag.fullName} {ag.jobLevel ? `(${ag.jobLevel})` : ""}
                </option>
              ))}
            </select>
          </div>
        </form>
      </Modal>
    </div>
  );
}
