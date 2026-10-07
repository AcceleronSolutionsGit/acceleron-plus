"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Ticket, TicketStatus, Priority, User, Project } from "@/lib/types";
import { StatCard } from "@/components/ui/Card";
import { DataTable, type Column } from "@/components/ui/Table";
import { ColorBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import {
  relativeTime, formatStatus,
  ticketStatusColor, priorityColor,
  ticketTypeColor, ticketTypeDotColor,
  cn,
} from "@/lib/utils";
import { phaseColorClass } from "../pmt/ProjectListClient";
import { Combobox } from "@/components/ui/Combobox";
import { AutoTicketModal } from "./AutoTicketModal";
import { ExportReportModal } from "./ExportReportModal";
import { KanbanBoard } from "./KanbanBoard";

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

const TICKET_TYPES = [
  { value: "incident", label: "Incident" },
  { value: "service_request", label: "Service Request" },
  { value: "problem", label: "Problem" },
  { value: "query", label: "Query" },
];

export function TicketQueueClient({
  tickets: initialTickets,
  currentUser,
}: {
  tickets: Ticket[];
  currentUser?: any;
}) {
  const router = useRouter();

  const [tickets, setTickets] = useState<Ticket[]>(initialTickets);
  const [viewMode, setViewMode] = useState<"table" | "phase_board" | "kanban">("table");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<TicketStatus | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<Priority | "all">("all");
  const [phaseFilter, setPhaseFilter] = useState<string>("all");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [showOnlyMine, setShowOnlyMine] = useState<boolean>(false);

  // Agents and Projects for New Ticket modal
  const [agents, setAgents] = useState<User[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  const [isAutoModalOpen, setIsAutoModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const [agentsRes, projectsRes] = await Promise.all([
          fetch("/api/itsm/agents"),
          fetch("/api/pmt/projects"),
        ]);
        if (agentsRes.ok) {
          const d = await agentsRes.json();
          if (d.success && d.data) setAgents(d.data);
        }
        if (projectsRes.ok) {
          const d = await projectsRes.json();
          if (d.projects) setProjects(d.projects);
        }
      } catch (err) {
        console.error("Failed to load agents/projects:", err);
      }
    }
    loadData();
  }, []);

  // Unique project codes from tickets + fetched projects
  const allProjectCodes = useMemo(() => {
    const codes = new Set<string>();
    tickets.forEach((t) => {
      if (t.projectCode) codes.add(t.projectCode);
    });
    projects.forEach((p) => codes.add(p.code));
    return Array.from(codes).sort();
  }, [tickets, projects]);

  // Apply Role Restrictions
  const visibleTickets = useMemo(() => {
    if (currentUser?.role === "ticket_handler") {
      return tickets.filter((t) => t.ticketType === "incident");
    }
    return tickets;
  }, [tickets, currentUser]);

  // Phase counts
  const phaseCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    PHASES.forEach((ph) => {
      counts[ph] = visibleTickets.filter((t) => t.projectPhase === ph).length;
    });
    return counts;
  }, [visibleTickets]);

  // Filtered tickets
  const filtered = useMemo(() => {
    return visibleTickets.filter((t) => {
      if (showOnlyMine) {
        if (t.agentUserId !== currentUser?.id && t.requesterId !== currentUser?.id) return false;
      }
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;
      if (phaseFilter !== "all" && t.projectPhase !== phaseFilter) return false;
      if (projectFilter !== "all" && t.projectCode !== projectFilter) return false;

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchNum = t.ticketNumber.toLowerCase().includes(q);
        const matchSub = t.subject.toLowerCase().includes(q);
        const matchDesc = t.description?.toLowerCase().includes(q);
        const matchPrj = t.projectCode?.toLowerCase().includes(q);
        const matchReq = `${t.requester?.firstName} ${t.requester?.lastName}`.toLowerCase().includes(q);
        const matchAgent = t.agent?.fullName?.toLowerCase().includes(q);
        if (!matchNum && !matchSub && !matchDesc && !matchPrj && !matchReq && !matchAgent) {
          return false;
        }
      }
      return true;
    });
  }, [visibleTickets, statusFilter, priorityFilter, phaseFilter, projectFilter, searchTerm, showOnlyMine, currentUser]);

  const newCount = visibleTickets.filter((t) => t.status === "new").length;
  const openCount = visibleTickets.filter((t) => t.status === "open").length;
  const inProgressCount = visibleTickets.filter((t) => t.status === "pending" || t.status === "on_hold").length;
  const overdueCount = visibleTickets.filter((t) => t.isOverdue).length;

  const myTickets = visibleTickets.filter(t => t.agentUserId === currentUser?.id || t.requesterId === currentUser?.id);
  const myActiveCount = myTickets.filter(t => t.status === "open").length;
  const myInProgressCount = myTickets.filter(t => t.status === "pending" || t.status === "on_hold").length;
  const myClosedCount = myTickets.filter(t => t.status === "closed" || t.status === "resolved").length;


  const handleUpdateStatus = async (ticketId: string, newStatus: TicketStatus) => {
    try {
      const res = await fetch(`/api/itsm/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setTickets((prev) =>
          prev.map((t) => (t.id === ticketId ? { ...t, status: newStatus } : t))
        );
      } else {
        throw new Error("Failed to update ticket status");
      }
    } catch (err) {
      console.error(err);
      throw err;
    }
  };

  const columns: Column<Ticket>[] = [
    {
      key: "ticketNumber",
      header: "Ticket #",
      render: (t) => (
        <span className="font-mono text-xs font-bold text-navy-800 bg-neutral-100 px-2 py-0.5 rounded border border-neutral-200">
          {t.ticketNumber}
        </span>
      ),
      className: "whitespace-nowrap w-28",
    },
    {
      key: "subject",
      header: "Subject & Description",
      render: (t) => (
        <div className="max-w-md">
          <p className={cn("font-medium text-navy-900 hover:text-blue-600 transition-colors", t.isOverdue && "text-red-600 font-semibold")}>
            {t.subject}
          </p>
          {t.description && (
            <p className="text-xs text-navy-500 mt-0.5 line-clamp-1">{t.description}</p>
          )}
        </div>
      ),
    },
    {
      key: "projectPhase",
      header: "Linked Project & Phase",
      render: (t) => (
        <div>
          {t.projectCode ? (
            <div className="flex flex-col gap-1 items-start">
              <Link
                href={`/pmt/${t.projectCode}`}
                onClick={(e) => e.stopPropagation()}
                className="font-mono text-xs font-semibold text-blue-600 hover:underline"
              >
                {t.projectCode}
              </Link>
              {t.projectPhase && (
                <span
                  className={`inline-flex items-center px-2 py-0.5 text-[11px] font-bold rounded-full border ${phaseColorClass(
                    t.projectPhase
                  )}`}
                >
                  {t.projectPhase}
                </span>
              )}
            </div>
          ) : (
            <span className="text-xs text-neutral-400 italic">Unlinked</span>
          )}
        </div>
      ),
      className: "w-36",
    },
    {
      key: "ticketType",
      header: "Type",
      render: (t) => (
        <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-md inline-flex items-center gap-1.5 border", ticketTypeColor(t.ticketType))}>
          <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", ticketTypeDotColor(t.ticketType))} />
          <span>{formatStatus(t.ticketType || "incident")}</span>
        </span>
      ),
      className: "w-36",
    },
    {
      key: "status",
      header: "Status",
      render: (t) => (
        <div className="flex items-center gap-1.5">
          <ColorBadge colorClass={ticketStatusColor(t.status)}>
            {formatStatus(t.status)}
          </ColorBadge>
          {t.isOverdue && (
            <span className="text-red-600 text-xs font-bold" title="Overdue SLA">
              ⚠️
            </span>
          )}
        </div>
      ),
      className: "w-28",
    },
    {
      key: "priority",
      header: "Priority",
      render: (t) =>
        t.priority ? (
          <ColorBadge colorClass={priorityColor(t.priority)}>
            {formatStatus(t.priority)}
          </ColorBadge>
        ) : (
          <span className="text-navy-500">—</span>
        ),
      className: "w-24",
    },
    {
      key: "agent",
      header: "Assigned Agent",
      render: (t) => (
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-800 font-bold text-[10px] flex items-center justify-center flex-shrink-0">
            {t.agent?.fullName
              ? t.agent.fullName
                  .split(" ")
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join("")
              : "—"}
          </div>
          <div>
            <p className="text-xs font-medium text-navy-900 leading-tight">
              {t.agent?.fullName || "Unassigned"}
            </p>
            {t.agent?.jobLevel && (
              <p className="text-[10px] text-navy-400">{t.agent.jobLevel}</p>
            )}
          </div>
        </div>
      ),
      className: "w-40",
    },
    {
      key: "createdAt",
      header: "Created",
      render: (t) => (
        <span className="text-navy-500 text-xs tabular-nums whitespace-nowrap">
          {relativeTime(t.createdAt)}
        </span>
      ),
      className: "w-28",
    },
  ];

  const statuses: TicketStatus[] = ["new", "open", "pending", "on_hold", "resolved", "closed", "cancelled"];
  const priorities: Priority[] = ["urgent", "high", "medium", "low"];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy-900 font-[family-name:var(--font-league-spartan)]">
            Service Desk & Support Queue
          </h1>
          <p className="text-sm text-navy-500 mt-1">
            Track and resolve incidents, service requests, and problem tickets linked with delivery phases
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* View Switcher: Table vs Phase-Wise View */}
          <div className="flex items-center bg-neutral-100 p-1 rounded-xl border border-neutral-200 shadow-inner">
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === "table" ? "bg-white text-navy-900 shadow-sm" : "text-neutral-500 hover:text-navy-700"
              }`}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm0 6a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1v-2zm0 6a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1v-2z" clipRule="evenodd" />
              </svg>
              <span>Queue Table</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("phase_board")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === "phase_board" ? "bg-white text-navy-900 shadow-sm" : "text-neutral-500 hover:text-navy-700"
              }`}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M2 4a1 1 0 011-1h3a1 1 0 011 1v12a1 1 0 01-1 1H3a1 1 0 01-1-1V4zm6 0a1 1 0 011-1h3a1 1 0 011 1v12a1 1 0 01-1 1H9a1 1 0 01-1-1V4zm6 0a1 1 0 011-1h3a1 1 0 011 1v12a1 1 0 01-1 1h-3a1 1 0 01-1-1V4z" />
              </svg>
              <span>Phase View</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("kanban")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === "kanban" ? "bg-white text-navy-900 shadow-sm" : "text-neutral-500 hover:text-navy-700"
              }`}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <path d="M8 3v18" />
                <path d="M16 3v18" />
              </svg>
              <span>Kanban</span>
            </button>
          </div>

          <Button
            variant="secondary"
            onClick={() => setIsExportModalOpen(true)}
            className="border-neutral-200 text-navy-700 bg-white hover:bg-neutral-50 hover:border-neutral-300 shadow-sm"
          >
            <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Export Report
          </Button>
          <Button
            variant="secondary"
            onClick={() => setIsAutoModalOpen(true)}
            className="border-indigo-300 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 hover:border-indigo-400"
          >
            <svg className="w-4 h-4 mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Auto from File
          </Button>
          <Button data-guide="ticket:new" onClick={() => router.push("/itsm/new")}>
            <svg className="w-4 h-4 mr-1.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            New Ticket
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="New Tickets"
          value={newCount}
          icon={
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
            </svg>
          }
        />
        <StatCard
          label="Open / Active"
          value={openCount}
          icon={
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          }
        />
        <StatCard
          label="Pending / On Hold"
          value={inProgressCount}
          icon={
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
            </svg>
          }
        />
        <StatCard
          label="Overdue SLA"
          value={overdueCount}
          className={overdueCount > 0 ? "border-red-600/30 bg-red-50/20" : ""}
          icon={
            <svg className={cn("w-5 h-5", overdueCount > 0 && "text-red-600")} viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          }
        />
      </div>

      {/* My Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="My Active Tickets"
          value={myActiveCount}
          icon={
            <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          label="My In Progress"
          value={myInProgressCount}
          icon={
            <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          }
        />
        <StatCard
          label="My Closed"
          value={myClosedCount}
          icon={
            <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          }
        />
      </div>

      {/* Phase Filters Banner (Project Phase Sync) */}
      <div className="bg-white p-3.5 rounded-xl border border-neutral-200 shadow-sm space-y-2">
        <div className="flex items-center justify-between text-xs text-navy-500 font-semibold uppercase tracking-wider">
          <span className="flex items-center gap-1.5">
            <span>⚡</span>
            <span>Delivery Phase Filter (Syncs with PMT project phase changes)</span>
          </span>
          {phaseFilter !== "all" && (
            <button
              onClick={() => setPhaseFilter("all")}
              className="text-blue-600 hover:underline capitalize"
            >
              Reset phase filter
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
          <button
            onClick={() => setPhaseFilter("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
              phaseFilter === "all"
                ? "bg-navy-900 text-white shadow-sm"
                : "bg-neutral-100 text-navy-700 hover:bg-neutral-200"
            }`}
          >
            All Phases ({visibleTickets.length})
          </button>
          {PHASES.map((ph) => {
            const count = phaseCounts[ph] || 0;
            const isSelected = phaseFilter === ph;
            return (
              <button
                key={ph}
                onClick={() => setPhaseFilter(ph)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all whitespace-nowrap flex items-center gap-1.5 ${
                  isSelected
                    ? `${phaseColorClass(ph)} ring-2 ring-blue-500 shadow-sm font-extrabold`
                    : "bg-white text-navy-700 border-neutral-200 hover:border-neutral-300"
                }`}
              >
                <span>{ph}</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${count > 0 ? "bg-blue-100 text-blue-800" : "bg-neutral-100 text-neutral-500"}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
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
            placeholder="Search ticket #, subject, agent, project..."
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

        {/* Dropdown Filters */}
        <div className="flex items-center gap-3 w-full md:w-auto flex-wrap">
          <Combobox
            className="min-w-[190px]"
            value={projectFilter}
            onChange={setProjectFilter}
            placeholder="All Projects"
            searchPlaceholder="Search projects…"
            options={[
              { value: "all", label: "All Projects", hint: String(visibleTickets.length) },
              ...allProjectCodes.map((code) => ({
                value: code,
                label: code,
                hint: String(visibleTickets.filter((t) => t.projectCode === code).length),
              })),
            ]}
          />

          <Combobox
            className="min-w-[170px]"
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as any)}
            placeholder="All Statuses"
            searchPlaceholder="Search statuses…"
            options={[
              { value: "all", label: "All Statuses" },
              ...statuses.map((st) => ({
                value: st,
                label: formatStatus(st),
                hint: String(visibleTickets.filter((t) => t.status === st).length),
              })),
            ]}
          />

          <Combobox
            className="min-w-[170px]"
            value={priorityFilter}
            onChange={(v) => setPriorityFilter(v as any)}
            placeholder="All Priorities"
            searchPlaceholder="Search priorities…"
            options={[
              { value: "all", label: "All Priorities" },
              ...priorities.map((pr) => ({
                value: pr,
                label: formatStatus(pr),
                hint: String(visibleTickets.filter((t) => t.priority === pr).length),
              })),
            ]}
          />

          {(statusFilter !== "all" || priorityFilter !== "all" || phaseFilter !== "all" || projectFilter !== "all" || searchTerm) && (
            <button
              onClick={() => {
                setStatusFilter("all");
                setPriorityFilter("all");
                setPhaseFilter("all");
                setProjectFilter("all");
                setSearchTerm("");
              }}
              className="text-xs text-blue-600 hover:underline font-semibold"
            >
              Clear all
            </button>
          )}

          <div className="flex items-center gap-2">
            <label className="text-sm text-navy-700 font-medium cursor-pointer select-none flex items-center gap-2">
              <input 
                type="checkbox" 
                checked={showOnlyMine}
                onChange={(e) => setShowOnlyMine(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded border-neutral-300 focus:ring-blue-500"
              />
              Show Only Mine
            </label>
          </div>

          <span className="text-xs font-semibold text-neutral-500 ml-auto">
            {filtered.length} of {visibleTickets.length} tickets
          </span>
        </div>
      </div>

      {/* View Content: Queue Table OR Phase-Wise View OR Kanban */}
      {viewMode === "table" ? (
        <DataTable
          columns={columns}
          data={filtered}
          onRowClick={(t) => router.push(`/itsm/${t.ticketNumber}`)}
          emptyMessage={
            searchTerm || statusFilter !== "all" || priorityFilter !== "all" || phaseFilter !== "all" || projectFilter !== "all"
              ? "No tickets match your filter criteria."
              : "No tickets found"
          }
          rowClassName={(t) => (t.isOverdue ? "bg-red-50/20" : "")}
        />
      ) : viewMode === "phase_board" ? (
        <PhaseBoard
          tickets={filtered}
          onTicketClick={(t) => router.push(`/itsm/${t.ticketNumber}`)}
        />
      ) : (
        <KanbanBoard
          tickets={filtered}
          onTicketClick={(t) => router.push(`/itsm/${t.ticketNumber}`)}
          onStatusChange={handleUpdateStatus}
        />
      )}

      {/* Auto-Generate Ticket Modal */}
      <AutoTicketModal
        isOpen={isAutoModalOpen}
        onClose={() => setIsAutoModalOpen(false)}
        projects={projects}
        currentUser={currentUser}
        onTicketCreated={async () => {
          const refreshRes = await fetch("/api/itsm/tickets");
          if (refreshRes.ok) {
            const data = await refreshRes.json();
            if (data.tickets) setTickets(data.tickets);
          } else {
            router.refresh();
          }
        }}
      />


      {/* Export Report Modal */}
      <ExportReportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        currentFilters={{
          status: statusFilter === "all" ? undefined : statusFilter,
          priority: priorityFilter === "all" ? undefined : priorityFilter,
          projectCode: projectFilter === "all" ? undefined : projectFilter,
          ticketType: "all",
        }}
        totalCount={filtered.length}
      />
    </div>
  );
}

function PhaseBoard({
  tickets,
  onTicketClick,
}: {
  tickets: Ticket[];
  onTicketClick: (t: Ticket) => void;
}) {
  const boardPhases = [
    { name: "Discovery", badgeBg: "bg-blue-100 text-blue-800", dot: "bg-blue-500" },
    { name: "Design", badgeBg: "bg-purple-100 text-purple-800", dot: "bg-purple-500" },
    { name: "Build", badgeBg: "bg-indigo-100 text-indigo-800", dot: "bg-indigo-500" },
    { name: "Execution", badgeBg: "bg-cyan-100 text-cyan-800", dot: "bg-cyan-500" },
    { name: "Testing", badgeBg: "bg-amber-100 text-amber-800", dot: "bg-amber-500" },
    { name: "UAT", badgeBg: "bg-pink-100 text-pink-800", dot: "bg-pink-500" },
    { name: "Go-Live", badgeBg: "bg-emerald-100 text-emerald-800", dot: "bg-emerald-500" },
    { name: "Closure", badgeBg: "bg-neutral-200 text-neutral-800", dot: "bg-neutral-500" },
  ];

  const unlinkedTickets = tickets.filter(
    (t) => !t.projectPhase || t.projectPhase === "Unlinked" || !boardPhases.some((p) => p.name === t.projectPhase)
  );

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between text-xs text-navy-500 font-medium px-1">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse"></span>
          <span>Delivery Lifecycle Board — Tickets grouped by active Project Phase</span>
        </span>
        <span className="font-semibold text-navy-700">{tickets.length} total active tickets</span>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-6 pt-1 scrollbar-thin">
        {boardPhases.map((phase) => {
          const phaseTickets = tickets.filter((t) => t.projectPhase === phase.name);
          return (
            <div
              key={phase.name}
              className="w-80 flex-shrink-0 flex flex-col bg-neutral-50/90 rounded-2xl border border-neutral-200/80 overflow-hidden shadow-sm"
            >
              {/* Phase Column Header */}
              <div className="px-4 py-3 border-b border-neutral-200 flex items-center justify-between bg-white sticky top-0 z-10">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${phase.dot}`}></span>
                  <span className="font-bold text-xs uppercase tracking-wider text-navy-900">
                    {phase.name}
                  </span>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${phase.badgeBg}`}>
                  {phaseTickets.length}
                </span>
              </div>

              {/* Tickets in this Phase */}
              <div className="p-3 space-y-3 flex-1 overflow-y-auto max-h-[600px] scrollbar-thin">
                {phaseTickets.length === 0 ? (
                  <div className="py-10 px-4 text-center border-2 border-dashed border-neutral-200/70 rounded-xl text-neutral-400 text-xs">
                    No tickets in {phase.name} phase
                  </div>
                ) : (
                  phaseTickets.map((t) => (
                    <div
                      key={t.id}
                      onClick={() => onTicketClick(t)}
                      className="bg-white rounded-xl border border-neutral-200 p-3.5 shadow-sm hover:shadow-md hover:border-blue-300 transition-all cursor-pointer space-y-2.5 group active:scale-[0.99]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-bold text-navy-900 group-hover:text-blue-600 transition-colors">
                          {t.ticketNumber}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {t.isOverdue && (
                            <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-200" title="Overdue SLA">
                              ⚠️ Overdue
                            </span>
                          )}
                          <ColorBadge colorClass={ticketTypeColor(t.ticketType)} className="text-[10px] font-semibold px-1.5 py-0.5">
                            {formatStatus(t.ticketType || "incident")}
                          </ColorBadge>
                          <ColorBadge colorClass={priorityColor(t.priority || "medium")} className="text-[10px] uppercase font-bold px-1.5 py-0.5">
                            {t.priority}
                          </ColorBadge>
                        </div>
                      </div>

                      <div>
                        <h4 className="text-xs font-semibold text-navy-900 line-clamp-2 leading-snug group-hover:text-blue-900 transition-colors">
                          {t.subject}
                        </h4>
                        {t.description && (
                          <p className="text-[11px] text-navy-500 line-clamp-2 mt-1 leading-relaxed">
                            {t.description}
                          </p>
                        )}
                      </div>

                      {t.projectCode && (
                        <div className="flex items-center gap-1 text-[11px] font-medium text-blue-700 bg-blue-50/80 border border-blue-200/60 px-2 py-0.5 rounded-md truncate">
                          <span>📁</span>
                          <span className="truncate">{t.projectCode} • {t.projectName || "Project"}</span>
                        </div>
                      )}

                      <div className="pt-2 border-t border-neutral-100 flex items-center justify-between text-xs">
                        <ColorBadge colorClass={ticketStatusColor(t.status)} className="text-[10px]">
                          {formatStatus(t.status)}
                        </ColorBadge>

                        <div className="flex items-center gap-1.5 ml-auto">
                          <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-800 font-bold text-[9px] flex items-center justify-center flex-shrink-0">
                            {t.agent?.fullName
                              ? t.agent.fullName.split(" ").map((n) => n[0]).slice(0, 2).join("")
                              : "—"}
                          </div>
                          <span className="text-[11px] text-navy-700 font-medium truncate max-w-[85px]">
                            {t.agent?.fullName?.split(" ")[0] || "Unassigned"}
                          </span>
                          {t.agent?.jobLevel && (
                            <span className="text-[9px] px-1 py-0.2 rounded bg-neutral-100 text-neutral-600 font-bold">
                              {t.agent.jobLevel}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}

        {/* Unlinked Column */}
        {unlinkedTickets.length > 0 && (
          <div className="w-80 flex-shrink-0 flex flex-col bg-neutral-50/90 rounded-2xl border border-neutral-200/80 overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-neutral-200 flex items-center justify-between bg-white sticky top-0 z-10">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-neutral-400"></span>
                <span className="font-bold text-xs uppercase tracking-wider text-navy-900">
                  Unlinked / Operations
                </span>
              </div>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-neutral-200 text-neutral-800">
                {unlinkedTickets.length}
              </span>
            </div>
            <div className="p-3 space-y-3 flex-1 overflow-y-auto max-h-[600px] scrollbar-thin">
              {unlinkedTickets.map((t) => (
                <div
                  key={t.id}
                  onClick={() => onTicketClick(t)}
                  className="bg-white rounded-xl border border-neutral-200 p-3.5 shadow-sm hover:shadow-md hover:border-blue-300 transition-all cursor-pointer space-y-2.5 group active:scale-[0.99]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold text-navy-900 group-hover:text-blue-600 transition-colors">
                      {t.ticketNumber}
                    </span>
                    <ColorBadge colorClass={priorityColor(t.priority || "medium")} className="text-[10px] uppercase font-bold px-1.5 py-0.5">
                      {t.priority}
                    </ColorBadge>
                  </div>
                  <h4 className="text-xs font-semibold text-navy-900 line-clamp-2 leading-snug">
                    {t.subject}
                  </h4>
                  <div className="pt-2 border-t border-neutral-100 flex items-center justify-between text-xs">
                    <ColorBadge colorClass={ticketStatusColor(t.status)} className="text-[10px]">
                      {formatStatus(t.status)}
                    </ColorBadge>
                    <span className="text-[11px] text-navy-600">
                      {t.agent?.fullName?.split(" ")[0] || "Unassigned"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
