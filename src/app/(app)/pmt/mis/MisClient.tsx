"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { PmtHeaderTabs } from "@/components/layout/PmtHeaderTabs";
import { Card, StatCard } from "@/components/ui/Card";
import { formatDate, cn } from "@/lib/utils";
import type { Project, Milestone, ProjectManagerRef } from "@/lib/types";

export interface ProjectMisItem {
  project: Project;
  teamCount: number;
  milestones: Milestone[];
  metrics: {
    totalMilestones: number;
    completedMilestones: number;
    overdueMilestones: number;
    atRiskMilestones: number;
    upcomingMilestones: number;
    completionPercent: number;
    scheduleHealth: "delayed" | "at_risk" | "on_track" | "completed";
    delayDays: number;
    daysRemaining: number | null;
    plannedDurationDays: number | null;
    elapsedDays: number | null;
    timelineProgressPercent: number;
  };
}

export interface MisMilestone extends Milestone {
  projectCode: string;
  projectName: string;
  projectClient: string;
  projectPhase: string;
  projectStatus: string;
  projectManagers: ProjectManagerRef[];
  daysDiff: number | null;
  isOverdue: boolean;
}

interface MisClientProps {
  items: ProjectMisItem[];
  milestones: MisMilestone[];
  userScope: "admin" | "pm" | "member";
  userName: string;
  userRole: string;
  availablePms: string[];
}

export function MisClient({
  items,
  milestones,
  userScope,
  userName,
  userRole,
  availablePms,
}: MisClientProps) {
  // Navigation / Tab state
  const [activeTab, setActiveTab] = useState<"projects" | "milestones">("projects");
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");

  // Project Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [healthFilter, setHealthFilter] = useState<string>("all");
  const [phaseFilter, setPhaseFilter] = useState<string>("all");
  const [pmFilter, setPmFilter] = useState<string>("all");

  // Milestone Filter state
  const [milestoneHorizon, setMilestoneHorizon] = useState<string>("all");
  const [billingOnly, setBillingOnly] = useState(false);
  const [milestoneSearch, setMilestoneSearch] = useState("");

  // Executive KPI summary calculations
  const totalProjects = items.length;
  const delayedProjects = items.filter((i) => i.metrics.scheduleHealth === "delayed").length;
  const atRiskProjects = items.filter((i) => i.metrics.scheduleHealth === "at_risk").length;
  const onTrackProjects = items.filter((i) => i.metrics.scheduleHealth === "on_track").length;
  const completedProjects = items.filter((i) => i.metrics.scheduleHealth === "completed").length;

  const totalMilestonesCount = milestones.length;
  const overdueMilestonesCount = milestones.filter((m) => m.isOverdue).length;
  const completedMilestonesCount = milestones.filter((m) => m.status === "completed").length;
  const upcoming30DaysCount = milestones.filter(
    (m) => !m.isOverdue && m.status !== "completed" && m.daysDiff !== null && m.daysDiff >= 0 && m.daysDiff <= 30
  ).length;

  // Filtered projects
  const filteredProjects = useMemo(() => {
    return items.filter((item) => {
      const p = item.project;

      // Search match
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const codeMatch = p.code?.toLowerCase().includes(query);
        const nameMatch = p.name?.toLowerCase().includes(query);
        const clientMatch = p.clientCompanyName?.toLowerCase().includes(query);
        if (!codeMatch && !nameMatch && !clientMatch) return false;
      }

      // Schedule health filter
      if (healthFilter !== "all" && item.metrics.scheduleHealth !== healthFilter) {
        return false;
      }

      // Phase filter
      if (phaseFilter !== "all") {
        const phase = p.currentPhase || "Discovery";
        if (phase.toLowerCase() !== phaseFilter.toLowerCase()) return false;
      }

      // PM filter
      if (pmFilter !== "all") {
        const pmNames = [
          p.projectManager?.fullName,
          ...(p.managers?.map((m) => m.fullName) ?? []),
        ].filter(Boolean) as string[];
        if (!pmNames.includes(pmFilter)) return false;
      }

      return true;
    });
  }, [items, searchQuery, healthFilter, phaseFilter, pmFilter]);

  // Filtered milestones
  const filteredMilestones = useMemo(() => {
    return milestones.filter((m) => {
      if (billingOnly && !m.isBillingMilestone) return false;

      if (milestoneSearch.trim()) {
        const query = milestoneSearch.toLowerCase();
        const nameMatch = m.name?.toLowerCase().includes(query);
        const projectMatch = m.projectName?.toLowerCase().includes(query);
        const codeMatch = m.projectCode?.toLowerCase().includes(query);
        const clientMatch = m.projectClient?.toLowerCase().includes(query);
        if (!nameMatch && !projectMatch && !codeMatch && !clientMatch) return false;
      }

      if (milestoneHorizon === "overdue") {
        return m.isOverdue;
      }
      if (milestoneHorizon === "7days") {
        return (
          m.status !== "completed" &&
          !m.isOverdue &&
          m.daysDiff !== null &&
          m.daysDiff >= 0 &&
          m.daysDiff <= 7
        );
      }
      if (milestoneHorizon === "30days") {
        return (
          m.status !== "completed" &&
          !m.isOverdue &&
          m.daysDiff !== null &&
          m.daysDiff >= 0 &&
          m.daysDiff <= 30
        );
      }
      if (milestoneHorizon === "90days") {
        return (
          m.status !== "completed" &&
          !m.isOverdue &&
          m.daysDiff !== null &&
          m.daysDiff >= 0 &&
          m.daysDiff <= 90
        );
      }
      if (milestoneHorizon === "completed") {
        return m.status === "completed";
      }

      return true;
    });
  }, [milestones, billingOnly, milestoneSearch, milestoneHorizon]);

  // Distinct phases for filter
  const phases = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => {
      if (i.project.currentPhase) set.add(i.project.currentPhase);
    });
    return Array.from(set);
  }, [items]);

  // Export CSV handler
  const handleExportCSV = () => {
    if (activeTab === "projects") {
      const headers = [
        "Project Code",
        "Project Name",
        "Client",
        "Phase",
        "Status",
        "Schedule Health",
        "Start Date",
        "Planned End Date",
        "Delay (Days)",
        "Milestones Done",
        "Total Milestones",
        "Overdue Milestones",
        "Completion %",
        "Project Managers",
      ];
      const rows = filteredProjects.map((item) => {
        const p = item.project;
        const m = item.metrics;
        const pmNames = [
          p.projectManager?.fullName,
          ...(p.managers?.map((mgr) => mgr.fullName) ?? []),
        ]
          .filter(Boolean)
          .join("; ");
        return [
          `"${p.code || ""}"`,
          `"${(p.name || "").replace(/"/g, '""')}"`,
          `"${(p.clientCompanyName || "").replace(/"/g, '""')}"`,
          `"${p.currentPhase || "Discovery"}"`,
          `"${p.status || ""}"`,
          `"${m.scheduleHealth}"`,
          `"${p.startDate || ""}"`,
          `"${p.plannedEndDate || ""}"`,
          m.delayDays,
          m.completedMilestones,
          m.totalMilestones,
          m.overdueMilestones,
          `"${m.completionPercent}%"`,
          `"${pmNames}"`,
        ].join(",");
      });

      const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows].join("\n");
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `Project_MIS_Report_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      const headers = [
        "Milestone Name",
        "Project Code",
        "Project Name",
        "Client",
        "Due Date",
        "Status",
        "Is Overdue",
        "Days Diff",
        "Billing Milestone",
      ];
      const rows = filteredMilestones.map((m) => [
        `"${(m.name || "").replace(/"/g, '""')}"`,
        `"${m.projectCode || ""}"`,
        `"${(m.projectName || "").replace(/"/g, '""')}"`,
        `"${(m.projectClient || "").replace(/"/g, '""')}"`,
        `"${m.dueDate || ""}"`,
        `"${m.status || ""}"`,
        m.isOverdue ? "Yes" : "No",
        m.daysDiff !== null ? m.daysDiff : "",
        m.isBillingMilestone ? "Yes" : "No",
      ].join(","));

      const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows].join("\n");
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `Milestones_Radar_Report_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <div className="space-y-6">
      {/* PMT High-Level Tabs */}
      <PmtHeaderTabs
        title="Project Management Information System (MIS)"
        subtitle="Operational delivery tracking, timeline delay variances, and upcoming milestone forecast"
        userRole={userRole}
        action={
          <div className="flex items-center gap-2.5">
            <button
              onClick={handleExportCSV}
              className="inline-flex items-center gap-1.5 rounded-lg border border-navy-900/10 bg-white px-3.5 py-2 text-xs font-semibold text-navy-800 shadow-xs transition hover:bg-navy-50 hover:border-navy-900/20 active:translate-y-px"
            >
              <svg className="h-4 w-4 text-navy-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export CSV
            </button>
            <Link
              href="/pmt"
              className="inline-flex items-center gap-1.5 rounded-lg bg-navy-900 px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-navy-800 active:translate-y-px"
            >
              Active Projects &rarr;
            </Link>
          </div>
        }
      />

      {/* ── User Access Scope Indicator ─────────────────────────── */}
      <div
        className={cn(
          "flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between shadow-xs",
          userScope === "admin"
            ? "border-indigo-100 bg-gradient-to-r from-indigo-50/70 via-blue-50/40 to-surface"
            : userScope === "pm"
            ? "border-emerald-100 bg-gradient-to-r from-emerald-50/70 via-teal-50/40 to-surface"
            : "border-sky-100 bg-gradient-to-r from-sky-50/70 via-blue-50/40 to-surface"
        )}
      >
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg shadow-2xs",
              userScope === "admin"
                ? "bg-indigo-600 text-white"
                : userScope === "pm"
                ? "bg-emerald-600 text-white"
                : "bg-sky-600 text-white"
            )}
          >
            {userScope === "admin" ? (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            ) : userScope === "pm" ? (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-navy-800">
                {userScope === "admin"
                  ? "Enterprise Organization Scope"
                  : userScope === "pm"
                  ? "Project Manager Delivery Scope"
                  : "My Staffed Projects Scope"}
              </span>
              <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-semibold text-navy-600 border border-navy-900/10">
                {totalProjects} {totalProjects === 1 ? "Project" : "Projects"} in View
              </span>
            </div>
            <p className="mt-0.5 text-xs text-navy-600">
              {userScope === "admin"
                ? "Full executive visibility across all projects in the system. Use the filters below to slice by Project Manager, Client, or Health Status."
                : userScope === "pm"
                ? `Showing only projects managed by or staffed under ${userName}. Milestones and timeline variances are scoped to your assigned delivery portfolio.`
                : `Showing projects where ${userName} is an allocated team member. Real-time timeline, milestone progress, and delay alerts for your projects.`}
            </p>
          </div>
        </div>

        {userScope === "admin" && availablePms.length > 0 && (
          <div className="flex shrink-0 items-center gap-2">
            <label className="text-xs font-medium text-navy-700 whitespace-nowrap">Filter by PM:</label>
            <select
              value={pmFilter}
              onChange={(e) => setPmFilter(e.target.value)}
              className="rounded-lg border border-navy-900/15 bg-white px-2.5 py-1.5 text-xs font-medium text-navy-800 shadow-2xs focus:border-navy-900 focus:outline-none"
            >
              <option value="all">All Project Managers ({availablePms.length})</option>
              {availablePms.map((pm) => (
                <option key={pm} value={pm}>
                  {pm}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* ── Executive Stat Cards ─────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          label="Total Projects"
          value={totalProjects}
          accentTop="#3b82f6"
          hint={
            <span className="text-navy-500 font-medium">
              {completedProjects} delivered / closed
            </span>
          }
          icon={
            <svg className="h-4.5 w-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
          }
        />

        <div
          onClick={() => setHealthFilter(healthFilter === "on_track" ? "all" : "on_track")}
          className="cursor-pointer"
        >
          <StatCard
            label="On Track"
            value={onTrackProjects}
            tone="positive"
            accentTop="#10b981"
            hint={
              <span className="text-emerald-700 font-medium">
                {totalProjects > 0 ? Math.round((onTrackProjects / totalProjects) * 100) : 0}% on schedule
              </span>
            }
            className={healthFilter === "on_track" ? "ring-2 ring-emerald-500" : ""}
            icon={
              <svg className="h-4.5 w-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
        </div>

        <div
          onClick={() => setHealthFilter(healthFilter === "delayed" ? "all" : "delayed")}
          className="cursor-pointer"
        >
          <StatCard
            label="Delayed Projects"
            value={delayedProjects}
            tone={delayedProjects > 0 ? "critical" : "default"}
            accentTop="#ef4444"
            hint={
              <span className="text-rose-600 font-medium">
                {delayedProjects > 0 ? "Timeline variance detected" : "Zero timeline delays"}
              </span>
            }
            className={healthFilter === "delayed" ? "ring-2 ring-rose-500" : ""}
            icon={
              <svg className="h-4.5 w-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            }
          />
        </div>

        <div
          onClick={() => setHealthFilter(healthFilter === "at_risk" ? "all" : "at_risk")}
          className="cursor-pointer"
        >
          <StatCard
            label="At Risk"
            value={atRiskProjects}
            tone={atRiskProjects > 0 ? "warning" : "default"}
            accentTop="#f59e0b"
            hint={
              <span className="text-amber-700 font-medium">
                {atRiskProjects > 0 ? "Deadline < 14d or tight lag" : "No high-risk projects"}
              </span>
            }
            className={healthFilter === "at_risk" ? "ring-2 ring-amber-500" : ""}
            icon={
              <svg className="h-4.5 w-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            }
          />
        </div>

        <div
          onClick={() => {
            setActiveTab("milestones");
            setMilestoneHorizon("overdue");
          }}
          className="cursor-pointer"
        >
          <StatCard
            label="Overdue Milestones"
            value={overdueMilestonesCount}
            tone={overdueMilestonesCount > 0 ? "critical" : "default"}
            accentTop="#dc2626"
            hint={
              <span className="text-rose-600 font-medium">
                {overdueMilestonesCount > 0 ? "Click to view radar" : "All milestones on track"}
              </span>
            }
            icon={
              <svg className="h-4.5 w-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
              </svg>
            }
          />
        </div>
      </div>

      {/* ── Main Perspective Navigation Tabs ─────────────────────── */}
      <div className="flex flex-col gap-4 border-b border-navy-900/10 pb-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab("projects")}
            className={cn(
              "flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-semibold transition",
              activeTab === "projects"
                ? "border-navy-900 text-navy-900"
                : "border-transparent text-navy-500 hover:text-navy-800"
            )}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Project Timeline & Delay Matrix
            <span className="rounded-full bg-navy-100 px-2 py-0.5 text-xs text-navy-700">
              {filteredProjects.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("milestones")}
            className={cn(
              "flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-semibold transition",
              activeTab === "milestones"
                ? "border-navy-900 text-navy-900"
                : "border-transparent text-navy-500 hover:text-navy-800"
            )}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
            </svg>
            Upcoming Milestones Radar
            {overdueMilestonesCount > 0 ? (
              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700">
                {overdueMilestonesCount} Overdue
              </span>
            ) : (
              <span className="rounded-full bg-navy-100 px-2 py-0.5 text-xs text-navy-700">
                {totalMilestonesCount}
              </span>
            )}
          </button>
        </div>

        {activeTab === "projects" && (
          <div className="flex items-center gap-1.5 self-end sm:self-auto">
            <span className="text-xs text-navy-400 mr-1 font-medium">Layout:</span>
            <button
              onClick={() => setViewMode("table")}
              className={cn(
                "rounded-md p-1.5 transition",
                viewMode === "table"
                  ? "bg-navy-900 text-white shadow-2xs"
                  : "bg-surface text-navy-600 hover:bg-navy-100"
              )}
              title="Table View"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
            </button>
            <button
              onClick={() => setViewMode("cards")}
              className={cn(
                "rounded-md p-1.5 transition",
                viewMode === "cards"
                  ? "bg-navy-900 text-white shadow-2xs"
                  : "bg-surface text-navy-600 hover:bg-navy-100"
              )}
              title="Timeline Card View"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* TAB 1: PROJECT TIMELINE & DELAY MATRIX                      */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {activeTab === "projects" && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="flex flex-col gap-3 rounded-xl border border-navy-900/8 bg-surface p-3.5 shadow-2xs sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-sm">
              <svg
                className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-navy-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search by project code, name, client..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-navy-900/10 bg-white py-1.5 pl-9 pr-3 text-xs placeholder:text-navy-400 focus:border-navy-900 focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Health Filter Pills */}
              <div className="flex items-center rounded-lg border border-navy-900/10 bg-navy-50/50 p-0.5 text-xs">
                {[
                  { id: "all", label: "All Health" },
                  { id: "delayed", label: "Delayed" },
                  { id: "at_risk", label: "At Risk" },
                  { id: "on_track", label: "On Track" },
                  { id: "completed", label: "Completed" },
                ].map((pill) => (
                  <button
                    key={pill.id}
                    onClick={() => setHealthFilter(pill.id)}
                    className={cn(
                      "rounded-md px-2.5 py-1 font-medium transition",
                      healthFilter === pill.id
                        ? "bg-white text-navy-900 shadow-2xs"
                        : "text-navy-600 hover:text-navy-900"
                    )}
                  >
                    {pill.label}
                  </button>
                ))}
              </div>

              {/* Phase Dropdown */}
              <select
                value={phaseFilter}
                onChange={(e) => setPhaseFilter(e.target.value)}
                className="rounded-lg border border-navy-900/10 bg-white px-2.5 py-1.5 text-xs font-medium text-navy-800 shadow-2xs focus:border-navy-900 focus:outline-none"
              >
                <option value="all">All Phases</option>
                {phases.map((ph) => (
                  <option key={ph} value={ph}>
                    {ph}
                  </option>
                ))}
              </select>

              {(searchQuery || healthFilter !== "all" || phaseFilter !== "all" || pmFilter !== "all") && (
                <button
                  onClick={() => {
                    setSearchQuery("");
                    setHealthFilter("all");
                    setPhaseFilter("all");
                    setPmFilter("all");
                  }}
                  className="rounded-lg px-2 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 transition"
                >
                  Reset Filters
                </button>
              )}
            </div>
          </div>

          {/* Table View */}
          {viewMode === "table" ? (
            <div className="overflow-hidden rounded-xl border border-navy-900/8 bg-surface shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-navy-900/10 bg-navy-50/75 text-[11px] font-bold uppercase tracking-wider text-navy-500">
                    <tr>
                      <th className="py-3 pl-4 pr-3">Project Details</th>
                      <th className="px-3 py-3">Client</th>
                      <th className="px-3 py-3">Project Manager</th>
                      <th className="px-3 py-3">Phase & Status</th>
                      <th className="px-3 py-3">Milestone Progress</th>
                      <th className="px-3 py-3">Planned Timeline</th>
                      <th className="px-3 py-3">Timeline Delay Variance</th>
                      <th className="px-3 py-3">Health</th>
                      <th className="py-3 pl-3 pr-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-navy-900/5 font-medium text-navy-800">
                    {filteredProjects.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-12 text-center text-navy-400">
                          <p className="text-sm font-semibold text-navy-600">No projects match the selected criteria.</p>
                          <p className="mt-1 text-xs">Try adjusting your search or health filters.</p>
                        </td>
                      </tr>
                    ) : (
                      filteredProjects.map((item) => {
                        const p = item.project;
                        const m = item.metrics;
                        const leadPm = p.managers?.find((mgr) => mgr.isLead) || p.projectManager;
                        const otherPms = (p.managers ?? []).filter((mgr) => !mgr.isLead);

                        return (
                          <tr key={p.id} className="hover:bg-navy-50/40 transition">
                            {/* Project Details */}
                            <td className="py-3 pl-4 pr-3">
                              <Link
                                href={`/pmt/${p.code || p.id}`}
                                className="group block focus:outline-none"
                              >
                                <span className="font-semibold text-navy-900 group-hover:text-red transition">
                                  [{p.code || "PRJ"}] {p.name}
                                </span>
                                {p.category && (
                                  <span className="mt-0.5 block text-[11px] text-navy-400">
                                    {p.category}
                                  </span>
                                )}
                              </Link>
                            </td>

                            {/* Client */}
                            <td className="px-3 py-3 text-navy-600 whitespace-nowrap">
                              {p.clientCompanyName || "—"}
                            </td>

                            {/* Project Manager */}
                            <td className="px-3 py-3 whitespace-nowrap">
                              <div className="flex flex-col gap-0.5">
                                {leadPm ? (
                                  <span className="inline-flex items-center gap-1.5 font-semibold text-navy-800">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                    {leadPm.fullName}
                                  </span>
                                ) : (
                                  <span className="text-navy-400 italic">Unassigned</span>
                                )}
                                {otherPms.length > 0 && (
                                  <span className="text-[10px] text-navy-400">
                                    +{otherPms.length} co-manager{otherPms.length > 1 ? "s" : ""}
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Phase & Status */}
                            <td className="px-3 py-3 whitespace-nowrap">
                              <span className="inline-flex items-center rounded-md border border-navy-900/10 bg-navy-50 px-2 py-0.5 text-[11px] font-semibold text-navy-700">
                                {p.currentPhase || "Discovery"}
                              </span>
                            </td>

                            {/* Milestone Progress */}
                            <td className="px-3 py-3 min-w-[140px]">
                              <div className="space-y-1">
                                <div className="flex items-center justify-between text-[11px]">
                                  <span className="font-semibold text-navy-900">
                                    {m.completedMilestones}/{m.totalMilestones} done
                                  </span>
                                  <span className="text-navy-500">{m.completionPercent}%</span>
                                </div>
                                <div className="h-1.5 w-full overflow-hidden rounded-full bg-navy-100">
                                  <div
                                    className={cn(
                                      "h-full rounded-full transition-all duration-500",
                                      m.scheduleHealth === "delayed"
                                        ? "bg-rose-500"
                                        : m.scheduleHealth === "at_risk"
                                        ? "bg-amber-500"
                                        : "bg-emerald-500"
                                    )}
                                    style={{ width: `${m.completionPercent}%` }}
                                  />
                                </div>
                                {m.overdueMilestones > 0 && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-600">
                                    <span className="h-1.5 w-1.5 rounded-full bg-rose-600 animate-pulse" />
                                    {m.overdueMilestones} overdue milestone{m.overdueMilestones > 1 ? "s" : ""}
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Planned Timeline */}
                            <td className="px-3 py-3 whitespace-nowrap text-[11px]">
                              <div className="text-navy-700">
                                {p.startDate ? formatDate(p.startDate) : "—"} &rarr;{" "}
                                <span className="font-semibold">
                                  {p.plannedEndDate ? formatDate(p.plannedEndDate) : "—"}
                                </span>
                              </div>
                              {m.daysRemaining !== null && (
                                <div className="text-[10px] text-navy-400">
                                  {m.daysRemaining >= 0
                                    ? `${m.daysRemaining} days remaining`
                                    : `${Math.abs(m.daysRemaining)} days past planned end`}
                                </div>
                              )}
                            </td>

                            {/* Timeline Delay Variance */}
                            <td className="px-3 py-3 whitespace-nowrap">
                              {m.delayDays > 0 ? (
                                <span className="inline-flex items-center gap-1.5 rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-bold text-rose-700">
                                  <span className="h-2 w-2 rounded-full bg-rose-500" />
                                  +{m.delayDays}d Delay
                                </span>
                              ) : m.scheduleHealth === "at_risk" ? (
                                <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700">
                                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                                  At Risk
                                </span>
                              ) : p.status === "closed" ? (
                                <span className="inline-flex items-center gap-1 rounded-md border border-navy-900/10 bg-navy-50 px-2 py-0.5 text-xs font-semibold text-navy-600">
                                  Delivered
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                                  On Track
                                </span>
                              )}
                            </td>

                            {/* Schedule Health Badge */}
                            <td className="px-3 py-3 whitespace-nowrap">
                              <span
                                className={cn(
                                  "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide",
                                  m.scheduleHealth === "delayed"
                                    ? "bg-rose-100 text-rose-800 border border-rose-200"
                                    : m.scheduleHealth === "at_risk"
                                    ? "bg-amber-100 text-amber-800 border border-amber-200"
                                    : m.scheduleHealth === "completed"
                                    ? "bg-navy-100 text-navy-700 border border-navy-200"
                                    : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                                )}
                              >
                                {m.scheduleHealth === "delayed"
                                  ? "Critical Delay"
                                  : m.scheduleHealth === "at_risk"
                                  ? "At Risk"
                                  : m.scheduleHealth === "completed"
                                  ? "Closed"
                                  : "Healthy"}
                              </span>
                            </td>

                            {/* Action */}
                            <td className="py-3 pl-3 pr-4 text-right whitespace-nowrap">
                              <Link
                                href={`/pmt/${p.code || p.id}`}
                                className="inline-flex items-center gap-1 rounded-md border border-navy-900/10 bg-white px-2.5 py-1 text-xs font-semibold text-navy-700 shadow-2xs hover:bg-navy-50 hover:text-navy-900 transition"
                              >
                                View
                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                              </Link>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* Cards View */
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredProjects.map((item) => {
                const p = item.project;
                const m = item.metrics;
                const leadPm = p.managers?.find((mgr) => mgr.isLead) || p.projectManager;

                return (
                  <Card
                    key={p.id}
                    accent={
                      m.scheduleHealth === "delayed"
                        ? "#ef4444"
                        : m.scheduleHealth === "at_risk"
                        ? "#f59e0b"
                        : m.scheduleHealth === "completed"
                        ? "#64748b"
                        : "#10b981"
                    }
                    className="flex flex-col justify-between"
                  >
                    <div>
                      {/* Card Header */}
                      <div className="flex items-start justify-between gap-2 border-b border-navy-900/5 pb-3">
                        <div className="min-w-0">
                          <Link
                            href={`/pmt/${p.code || p.id}`}
                            className="font-bold text-navy-900 hover:text-red transition text-sm block truncate"
                          >
                            [{p.code || "PRJ"}] {p.name}
                          </Link>
                          <p className="text-xs text-navy-500 mt-0.5 truncate">{p.clientCompanyName || "Internal Project"}</p>
                        </div>
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                            m.scheduleHealth === "delayed"
                              ? "bg-rose-100 text-rose-800"
                              : m.scheduleHealth === "at_risk"
                              ? "bg-amber-100 text-amber-800"
                              : m.scheduleHealth === "completed"
                              ? "bg-navy-100 text-navy-700"
                              : "bg-emerald-100 text-emerald-800"
                          )}
                        >
                          {m.scheduleHealth}
                        </span>
                      </div>

                      {/* Progress & Variance */}
                      <div className="mt-4 space-y-3">
                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-navy-600 font-medium">Milestone Progress</span>
                            <span className="font-bold text-navy-900">
                              {m.completedMilestones}/{m.totalMilestones} ({m.completionPercent}%)
                            </span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-navy-100">
                            <div
                              className={cn(
                                "h-full rounded-full transition-all",
                                m.scheduleHealth === "delayed"
                                  ? "bg-rose-500"
                                  : m.scheduleHealth === "at_risk"
                                  ? "bg-amber-500"
                                  : "bg-emerald-500"
                              )}
                              style={{ width: `${m.completionPercent}%` }}
                            />
                          </div>
                        </div>

                        {/* Calendar timeline bar */}
                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-navy-400">Calendar Elapsed</span>
                            <span className="text-navy-600 font-medium">{m.timelineProgressPercent}%</span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-navy-50">
                            <div
                              className="h-full rounded-full bg-navy-400"
                              style={{ width: `${m.timelineProgressPercent}%` }}
                            />
                          </div>
                        </div>

                        {/* Schedule Delay Chip */}
                        {m.delayDays > 0 ? (
                          <div className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-800 flex items-center justify-between">
                            <span className="font-semibold">Schedule Variance:</span>
                            <span className="font-bold text-rose-700">+{m.delayDays} Days Behind</span>
                          </div>
                        ) : (
                          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-800 flex items-center justify-between">
                            <span className="font-medium">Schedule Variance:</span>
                            <span className="font-semibold text-emerald-700">On Schedule</span>
                          </div>
                        )}

                        {/* Planned Dates */}
                        <div className="grid grid-cols-2 gap-2 text-xs text-navy-600 bg-navy-50/50 p-2.5 rounded-lg">
                          <div>
                            <span className="block text-[10px] text-navy-400 uppercase font-semibold">Start</span>
                            <span className="font-medium">{p.startDate ? formatDate(p.startDate) : "—"}</span>
                          </div>
                          <div>
                            <span className="block text-[10px] text-navy-400 uppercase font-semibold">Planned End</span>
                            <span className="font-medium">{p.plannedEndDate ? formatDate(p.plannedEndDate) : "—"}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Card Footer */}
                    <div className="mt-4 pt-3 border-t border-navy-900/5 flex items-center justify-between">
                      <div className="text-xs">
                        <span className="text-navy-400 block text-[10px]">Project Manager</span>
                        <span className="font-medium text-navy-800">
                          {leadPm ? leadPm.fullName : "Unassigned"}
                        </span>
                      </div>
                      <Link
                        href={`/pmt/${p.code || p.id}`}
                        className="rounded-md border border-navy-900/10 bg-white px-3 py-1.5 text-xs font-semibold text-navy-800 shadow-2xs hover:bg-navy-50 transition"
                      >
                        Project Details &rarr;
                      </Link>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* TAB 2: UPCOMING MILESTONES RADAR                            */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {activeTab === "milestones" && (
        <div className="space-y-4">
          {/* Milestone Filter Toolbar */}
          <div className="flex flex-col gap-3 rounded-xl border border-navy-900/8 bg-surface p-3.5 shadow-2xs sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-sm">
              <svg
                className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-navy-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search milestones, projects, clients..."
                value={milestoneSearch}
                onChange={(e) => setMilestoneSearch(e.target.value)}
                className="w-full rounded-lg border border-navy-900/10 bg-white py-1.5 pl-9 pr-3 text-xs placeholder:text-navy-400 focus:border-navy-900 focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Horizon Filter Pills */}
              <div className="flex items-center rounded-lg border border-navy-900/10 bg-navy-50/50 p-0.5 text-xs">
                {[
                  { id: "all", label: "All Milestones" },
                  { id: "overdue", label: `Overdue (${overdueMilestonesCount})` },
                  { id: "7days", label: "Next 7d" },
                  { id: "30days", label: `Next 30d (${upcoming30DaysCount})` },
                  { id: "completed", label: "Completed" },
                ].map((pill) => (
                  <button
                    key={pill.id}
                    onClick={() => setMilestoneHorizon(pill.id)}
                    className={cn(
                      "rounded-md px-2.5 py-1 font-medium transition",
                      milestoneHorizon === pill.id
                        ? "bg-white text-navy-900 shadow-2xs font-bold"
                        : "text-navy-600 hover:text-navy-900",
                      pill.id === "overdue" && overdueMilestonesCount > 0 && milestoneHorizon !== "overdue"
                        ? "text-rose-600 font-semibold"
                        : ""
                    )}
                  >
                    {pill.label}
                  </button>
                ))}
              </div>

              {/* Billing Toggle */}
              <label className="flex items-center gap-1.5 rounded-lg border border-navy-900/10 bg-white px-2.5 py-1.5 text-xs font-medium text-navy-800 shadow-2xs cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={billingOnly}
                  onChange={(e) => setBillingOnly(e.target.checked)}
                  className="rounded border-navy-300 text-navy-900 focus:ring-0"
                />
                💰 Billing Milestones Only
              </label>

              {(milestoneSearch || milestoneHorizon !== "all" || billingOnly) && (
                <button
                  onClick={() => {
                    setMilestoneSearch("");
                    setMilestoneHorizon("all");
                    setBillingOnly(false);
                  }}
                  className="rounded-lg px-2 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 transition"
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          {/* Milestones Radar Table */}
          <div className="overflow-hidden rounded-xl border border-navy-900/8 bg-surface shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-navy-900/10 bg-navy-50/75 text-[11px] font-bold uppercase tracking-wider text-navy-500">
                  <tr>
                    <th className="py-3 pl-4 pr-3">Target Due Date & Countdown</th>
                    <th className="px-3 py-3">Milestone Name</th>
                    <th className="px-3 py-3">Project [Code & Name]</th>
                    <th className="px-3 py-3">Client</th>
                    <th className="px-3 py-3">Phase</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Type</th>
                    <th className="py-3 pl-3 pr-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-900/5 font-medium text-navy-800">
                  {filteredMilestones.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-navy-400">
                        <p className="text-sm font-semibold text-navy-600">No milestones match the current filter.</p>
                        <p className="mt-1 text-xs">Try selecting a different time horizon or search query.</p>
                      </td>
                    </tr>
                  ) : (
                    filteredMilestones.map((m) => {
                      return (
                        <tr
                          key={m.id}
                          className={cn(
                            "transition hover:bg-navy-50/40",
                            m.isOverdue ? "bg-rose-50/20" : ""
                          )}
                        >
                          {/* Due Date & Countdown */}
                          <td className="py-3 pl-4 pr-3 whitespace-nowrap">
                            <div className="flex flex-col gap-1">
                              <span className="font-semibold text-navy-900">
                                {m.dueDate ? formatDate(m.dueDate) : "No due date"}
                              </span>
                              {m.status === "completed" ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                  </svg>
                                  Completed {m.completedAt ? `(${formatDate(m.completedAt)})` : ""}
                                </span>
                              ) : m.isOverdue ? (
                                <span className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700 w-fit">
                                  <span className="h-1.5 w-1.5 rounded-full bg-rose-600 animate-pulse" />
                                  {m.daysDiff !== null
                                    ? `Overdue by ${Math.abs(m.daysDiff)} days`
                                    : "Overdue"}
                                </span>
                              ) : m.daysDiff !== null ? (
                                <span
                                  className={cn(
                                    "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold w-fit",
                                    m.daysDiff <= 7
                                      ? "bg-amber-100 text-amber-800 border border-amber-200"
                                      : "bg-navy-100 text-navy-700"
                                  )}
                                >
                                  {m.daysDiff === 0
                                    ? "Due today"
                                    : `Due in ${m.daysDiff} days`}
                                </span>
                              ) : null}
                            </div>
                          </td>

                          {/* Milestone Name */}
                          <td className="px-3 py-3">
                            <span className="font-semibold text-navy-900 block">{m.name}</span>
                            {m.description && (
                              <span className="text-[11px] text-navy-400 block line-clamp-1 max-w-xs">
                                {m.description}
                              </span>
                            )}
                          </td>

                          {/* Project Code & Name */}
                          <td className="px-3 py-3">
                            <Link
                              href={`/pmt/${m.projectCode || m.projectId}`}
                              className="font-semibold text-navy-900 hover:text-red transition block"
                            >
                              [{m.projectCode}] {m.projectName}
                            </Link>
                          </td>

                          {/* Client */}
                          <td className="px-3 py-3 whitespace-nowrap text-navy-600">
                            {m.projectClient}
                          </td>

                          {/* Phase */}
                          <td className="px-3 py-3 whitespace-nowrap">
                            <span className="rounded-md border border-navy-900/10 bg-navy-50 px-2 py-0.5 text-[11px] font-medium text-navy-700">
                              {m.projectPhase}
                            </span>
                          </td>

                          {/* Status */}
                          <td className="px-3 py-3 whitespace-nowrap">
                            <span
                              className={cn(
                                "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold uppercase",
                                m.status === "completed"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : m.status === "at_risk"
                                  ? "bg-amber-100 text-amber-800"
                                  : m.status === "missed"
                                  ? "bg-rose-100 text-rose-800"
                                  : "bg-navy-100 text-navy-700"
                              )}
                            >
                              {m.status.replace("_", " ")}
                            </span>
                          </td>

                          {/* Type (Billing or Delivery) */}
                          <td className="px-3 py-3 whitespace-nowrap">
                            {m.isBillingMilestone ? (
                              <span className="inline-flex items-center gap-1 rounded-md border border-purple-200 bg-purple-50 px-2 py-0.5 text-[11px] font-semibold text-purple-700">
                                💰 Billing
                              </span>
                            ) : (
                              <span className="text-[11px] text-navy-400 font-medium">
                                Delivery
                              </span>
                            )}
                          </td>

                          {/* Action */}
                          <td className="py-3 pl-3 pr-4 text-right whitespace-nowrap">
                            <Link
                              href={`/pmt/${m.projectCode || m.projectId}?tab=gantt`}
                              className="inline-flex items-center gap-1 rounded-md border border-navy-900/10 bg-white px-2.5 py-1 text-xs font-semibold text-navy-700 shadow-2xs hover:bg-navy-50 hover:text-navy-900 transition"
                            >
                              Timeline
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            </Link>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
