"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Project, WBSItem, Milestone, Risk, GovernanceReview, Ticket, User, AppRole } from "@/lib/types";
import { Card } from "@/components/ui/Card";
import { ColorBadge, Badge } from "@/components/ui/Badge";
import { Tabs } from "@/components/ui/Tabs";
import { DataTable, type Column } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import {
  formatDate, formatStatus, formatCurrency,
  projectStatusColor, milestoneStatusColor, riskStatusColor, impactColor, ticketStatusColor, priorityColor,
} from "@/lib/utils";
import { phaseColorClass } from "../ProjectListClient";
import { DocumentsTab } from "./DocumentsTab";
import { FinancialsTab } from "./FinancialsTab";
import { TimesheetsTab } from "./TimesheetsTab";
import { GovernanceTab } from "./GovernanceTab";
import { InvoicesTab } from "./InvoicesTab";
import { NotificationsTab } from "./NotificationsTab";
import { WBSCommentsModal } from "./WBSCommentsModal";
import { ScopeAndSolutionModals } from "./ScopeAndSolutionModals";
import { WBSEditorTab, MilestonesEditorTab } from "./PlanEditors";
import { GanttEditor } from "./GanttEditor";
import { ExportMenu } from "./ExportMenu";
import { TeamTab } from "./TeamTab";
import { toDateInput } from "@/lib/dates";
import { ScrapProjectDialog } from "@/components/project/ScrapProjectDialog";
import type { PreDeliveryStages, LifecycleStatus } from "@/lib/lifecycle";

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

interface Props {
  project: Project;
  wbsItems: WBSItem[];
  milestones: Milestone[];
  risks: Risk[];
  reviews: GovernanceReview[];
  tickets?: Ticket[];
  userRole?: AppRole;
  /** Steps 1 and 2 of the lifecycle banner, read from the lead and its estimates. */
  preDelivery?: PreDeliveryStages;
  /** Everyone who is PM: the named PM plus PMs on the team. */
  projectManagers?: string[];
  permissions?: {
    canReschedule: boolean;
    canCreatePlan: boolean;
    canEditPlan: boolean;
    canUpdateProgress: boolean;
    canExportFinancials: boolean;
    /** Budget, Financials and Invoices — the project's named PM and admins only. */
    canViewFinancials: boolean;
    canManageInvoices: boolean;
    canChangeProjectManager: boolean;
    summary: string;
  };
}

export function ProjectDetailClient({
  project: initialProject,
  wbsItems,
  milestones,
  risks,
  reviews,
  tickets: initialTickets = [],
  userRole = "member",
  preDelivery,
  projectManagers = [],
  permissions = {
    canReschedule: false,
    canCreatePlan: false,
    canEditPlan: false,
    canUpdateProgress: false,
    canExportFinancials: false,
    canViewFinancials: false,
    canManageInvoices: false,
    canChangeProjectManager: false,
    summary: "",
  },
}: Props) {
  const router = useRouter();
  const [isScrapOpen, setIsScrapOpen] = useState(false);
  const [scrapNotice, setScrapNotice] = useState("");

  const [project, setProject] = useState<Project>(initialProject);
  const [tickets, setTickets] = useState<Ticket[]>(initialTickets);
  const [currentPhase, setCurrentPhase] = useState(project.currentPhase || "Discovery");
  const [isUpdatingPhase, setIsUpdatingPhase] = useState(false);
  const [phaseSyncSuccess, setPhaseSyncSuccess] = useState(false);

  // Edit Project Modal state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editForm, setEditForm] = useState({
    name: project.name,
    description: project.description || "",
    clientCompanyName: project.clientCompanyName || "",
    status: project.status,
    currentPhase: project.currentPhase || "Discovery",
    projectManagerUserId: project.projectManagerUserId || "",
    budgetInr: project.budgetInr ? String(project.budgetInr) : "",
    startDate: toDateInput(project.startDate),
    plannedEndDate: toDateInput(project.plannedEndDate),
  });

  const [employees, setEmployees] = useState<User[]>([]);

  // WBS Comments Modal state
  const [activeCommentWbsItem, setActiveCommentWbsItem] = useState<WBSItem | null>(null);

  // Scope & Solution Approach Modal states
  const [isScopeModalOpen, setIsScopeModalOpen] = useState(false);
  const [isSolutionModalOpen, setIsSolutionModalOpen] = useState(false);

  // Editing the plan is a PM/admin action; everyone else sees it read-only.
  // Resolved on the server from the global role AND the project team row.
  const canManage = permissions.canEditPlan;

  // Load employees for PM select
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
        console.error("Failed to load employees:", err);
      }
    }
    loadEmployees();
  }, []);

  // Quick Phase Change handler with ITSM sync
  const handlePhaseChange = async (newPhase: string) => {
    if (newPhase === currentPhase) return;
    setIsUpdatingPhase(true);
    setPhaseSyncSuccess(false);

    try {
      const res = await fetch(`/api/pmt/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPhase: newPhase }),
      });

      if (res.ok) {
        const data = await res.json();
        setCurrentPhase(newPhase);
        if (data.project) setProject(data.project);

        // Also update local tickets to reflect the new phase
        setTickets((prev) =>
          prev.map((t) => ({ ...t, projectPhase: newPhase }))
        );

        setPhaseSyncSuccess(true);
        setTimeout(() => setPhaseSyncSuccess(false), 4000);
      } else {
        alert("Failed to update phase. Please try again.");
      }
    } catch (err) {
      console.error("Phase change error:", err);
      alert("Failed to update phase due to network error.");
    } finally {
      setIsUpdatingPhase(false);
    }
  };

  // Edit Project Submit
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingEdit(true);

    try {
      const payload: Record<string, unknown> = {
        name: editForm.name,
        description: editForm.description || null,
        clientCompanyName: editForm.clientCompanyName || null,
        status: editForm.status,
        currentPhase: editForm.currentPhase,
        startDate: editForm.startDate || null,
        plannedEndDate: editForm.plannedEndDate || null,
      };
      // Only sent by people allowed to change them; the API refuses a
      // budget or a new PM from anyone else rather than ignoring it.
      if (permissions.canChangeProjectManager) {
        payload.projectManagerUserId = editForm.projectManagerUserId || null;
      }
      if (permissions.canViewFinancials) {
        payload.budgetInr = editForm.budgetInr ? Number(editForm.budgetInr) : null;
      }

      const res = await fetch(`/api/pmt/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.project) {
          setProject(data.project);
          setCurrentPhase(data.project.currentPhase || editForm.currentPhase);
        }
        setIsEditModalOpen(false);
        setPhaseSyncSuccess(true);
        setTimeout(() => setPhaseSyncSuccess(false), 4000);
        router.refresh();
      } else {
        const err = await res.json();
        alert(`Failed to update project: ${err.error || res.statusText}`);
      }
    } catch (err) {
      console.error(err);
      alert("Failed to update project due to network error.");
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Invoices and Financials are money: they are not rendered at all for
  // anyone but the project's named PM and admins (and their APIs 403).
  const tabs = [
    { id: "gantt",         label: "Gantt Timeline",       count: undefined },
    { id: "wbs",           label: "WBS Deliverables",      count: wbsItems.length },
    { id: "tickets",       label: "Linked ITSM Tickets",  count: tickets.length },
    { id: "milestones",    label: "Milestones",            count: milestones.length },
    { id: "invoices",      label: "Invoices",              count: undefined, finance: true },
    { id: "notifications", label: "Notifications Sent",    count: undefined },
    { id: "governance",    label: "Stage-Gates",           count: reviews.length },
    { id: "team",          label: "Team & Resources",      count: undefined },
    { id: "timesheets",    label: "Timesheets",            count: undefined },
    { id: "financials",    label: "Financials",            count: undefined, finance: true },
    { id: "risks",         label: "Risks & Issues",        count: risks.length },
    { id: "documents",     label: "Docs & Files",          count: undefined },
  ]
    .filter((tab) => !tab.finance || permissions.canViewFinancials)
    .map((tab) => ({ id: tab.id, label: tab.label, count: tab.count }));

  // Lifecycle steps. 1 and 2 come from the lead and its estimates (see
  // lib/lifecycle.ts); nothing here asserts a stage that did not happen.
  const lifecycleSteps: {
    id: string;
    title: string;
    status: LifecycleStatus;
    desc: string;
    detail?: string;
    href?: string;
  }[] = [
    {
      id: "lead",
      title: "1. Lead & Pipeline",
      ...(preDelivery?.lead ?? { status: "pending" as const, desc: "No lead linked" }),
    },
    {
      id: "solutioning",
      title: "2. Solutioning & Effort",
      ...(preDelivery?.solutioning ?? { status: "pending" as const, desc: "No estimate" }),
    },
    { id: "wbs", title: "3. WBS & Scope", status: "active", desc: `${wbsItems.length} Deliverable Work Packages` },
    { id: "execution", title: "4. Execution & Timesheets", status: "active", desc: "Time Logging & Sprint Burndown" },
    { id: "governance", title: "5. Stage-Gate Audits", status: "active", desc: `${reviews.length} Compliance Reviews` },
    { id: "billing", title: "6. Billing & Closure", status: "active", desc: "Tax Invoices & Client Sign-off" },
  ];

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <Link href="/pmt" className="text-navy-500 hover:text-navy-700 transition-colors">
            Projects
          </Link>
          <span className="text-navy-500/40">›</span>
          <span className="text-navy-900 font-semibold">{project.code}</span>
          {project.clientCompanyName && (
            <>
              <span className="text-navy-500/40">•</span>
              <span className="text-navy-600">{project.clientCompanyName}</span>
            </>
          )}
        </div>

        {phaseSyncSuccess && (
          <div className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full animate-fade-in shadow-sm">
            <span>✓</span>
            <span>Phase updated to &quot;{currentPhase}&quot; & synced to ITSM tickets</span>
          </div>
        )}
      </div>

      {/* Project Header Card */}
      <Card padding="lg">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="space-y-2.5">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-navy-900 font-[family-name:var(--font-league-spartan)]">
                {project.name}
              </h1>
              <ColorBadge colorClass={projectStatusColor(project.status)}>
                {formatStatus(project.status)}
              </ColorBadge>

              {/* Quick Phase Changer Pill / Dropdown */}
              <div className="flex items-center gap-1.5 pl-2 border-l border-neutral-200">
                <span className="text-xs font-semibold text-neutral-500">Phase:</span>
                <div className="relative inline-block">
                  <select
                    value={currentPhase}
                    disabled={isUpdatingPhase}
                    onChange={(e) => handlePhaseChange(e.target.value)}
                    className={`text-xs font-bold px-3 py-1 rounded-full border cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors appearance-none pr-7 ${phaseColorClass(
                      currentPhase
                    )}`}
                  >
                    {PHASES.map((ph) => (
                      <option key={ph} value={ph} className="bg-white text-navy-900">
                        {ph}
                      </option>
                    ))}
                  </select>
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-[10px] text-current">
                    ▼
                  </span>
                </div>
                {isUpdatingPhase && (
                  <span className="text-xs text-blue-600 animate-spin">⟳</span>
                )}
              </div>
            </div>

            <p className="font-mono text-xs font-bold text-navy-600 bg-neutral-100 inline-block px-2 py-0.5 rounded border border-neutral-200">
              {project.code}
            </p>

            {project.description && (
              <p className="text-sm text-navy-700 max-w-3xl leading-relaxed">{project.description}</p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setIsScopeModalOpen(true)}
              className="px-3 py-1.5 text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors flex items-center gap-1.5"
            >
              <span>📋</span>
              <span>Scope Baseline</span>
            </button>
            <button
              onClick={() => setIsSolutionModalOpen(true)}
              className="px-3 py-1.5 text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors flex items-center gap-1.5"
            >
              <span>📐</span>
              <span>Solution Approach</span>
            </button>
            <Link
              href="/pmt/governance"
              className="px-3 py-1.5 text-xs font-medium border border-neutral-200 rounded-lg text-navy-700 hover:bg-neutral-50 transition-colors"
            >
              Governance Center
            </Link>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setEditForm({
                  name: project.name,
                  description: project.description || "",
                  clientCompanyName: project.clientCompanyName || "",
                  status: project.status,
                  currentPhase: currentPhase,
                  projectManagerUserId: project.projectManagerUserId || "",
                  budgetInr: project.budgetInr ? String(project.budgetInr) : "",
                  startDate: toDateInput(project.startDate),
                  plannedEndDate: toDateInput(project.plannedEndDate),
                });
                setIsEditModalOpen(true);
              }}
            >
              <svg className="w-3.5 h-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
              Edit Project
            </Button>

            {/* Scrapping is destructive-adjacent, so it sits apart from
                the rest and is styled as such. A member never sees it. */}
            {(userRole === "admin" || userRole === "pm") && (
              <Button
                data-guide="project:scrap"
                variant="ghost"
                size="sm"
                onClick={() => setIsScrapOpen(true)}
                className="text-danger hover:bg-danger-bg hover:text-danger"
              >
                <svg className="mr-1 h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 7h16M10 11v6M14 11v6" />
                  <path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" />
                  <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
                </svg>
                {userRole === "admin" ? "Scrap project" : "Request scrapping"}
              </Button>
            )}

            <ExportMenu
              projectId={project.id}
              canExportFinancials={permissions.canExportFinancials}
            />
          </div>
        </div>

        {/* Meta row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mt-6 pt-5 border-t border-neutral-100">
          <MetaItem
            label={projectManagers.length > 1 ? "Project Managers" : "Project Manager"}
            value={projectManagers.length > 0 ? projectManagers.join(", ") : "Unassigned"}
            subtext={projectManagers.length > 1 ? undefined : project.projectManager?.jobLevel}
          />
          <MetaItem label="Client" value={project.clientCompanyName || "Internal"} />
          {permissions.canViewFinancials && (
            <MetaItem
              label="Budget"
              value={project.budgetInr ? formatCurrency(Number(project.budgetInr)) : "—"}
            />
          )}
          <MetaItem label="Start Date" value={formatDate(project.startDate)} />
          <MetaItem label="Planned End" value={formatDate(project.plannedEndDate)} />
          <MetaItem
            label="ITSM Sync"
            value={project.itsmContextId ? "Linked (Active)" : "Pending"}
            isBadge={true}
          />
        </div>
      </Card>

      {/* Project End-to-End Flow Pipeline Banner */}
      <div className="bg-white rounded-xl border border-navy-500/10 p-4 shadow-sm overflow-x-auto">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-navy-900 uppercase tracking-wider">
            Project End-to-End Lifecycle — Acceleron Delivery Framework
          </span>
          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-700">
            Phase: {currentPhase}
          </span>
        </div>
        <div className="flex items-center justify-between min-w-[760px] gap-2 pt-2">
          {lifecycleSteps.map((step, idx) => {
            const isCompleted = step.status === "completed";
            const isIdle = step.status === "pending" || step.status === "skipped";
            const title = (
              <span className={`text-xs font-bold truncate ${isIdle ? "text-navy-400" : "text-navy-900"}`}>
                {step.title}
              </span>
            );
            return (
              <div key={step.id} className="flex-1 relative min-w-0" title={step.detail ?? step.desc}>
                <div className="flex items-center gap-2 mb-1.5">
                  <div
                    className={`w-5 h-5 shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold ${
                      isCompleted
                        ? "bg-emerald-600 text-white"
                        : isIdle
                          ? "bg-neutral-200 text-navy-500"
                          : "bg-navy-900 text-white"
                    }`}
                  >
                    {isCompleted ? "✓" : step.status === "skipped" ? "–" : idx + 1}
                  </div>
                  {step.href && userRole !== "member" && userRole !== "client" ? (
                    <Link href={step.href} className="min-w-0 truncate hover:underline">
                      {title}
                    </Link>
                  ) : (
                    title
                  )}
                </div>
                <div
                  className={`h-1.5 rounded-full ${
                    isCompleted ? "bg-emerald-500" : isIdle ? "bg-neutral-200" : "bg-navy-900"
                  }`}
                />
                <p className="text-[10px] text-navy-400 mt-1 truncate">{step.desc}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tabs */}
      <Tabs tabs={tabs} defaultTab="gantt">
        {(activeTab) => {
          switch (activeTab) {
            case "gantt":
              return (
                <GanttEditor
                  projectId={project.id}
                  wbsItems={wbsItems}
                  milestones={milestones}
                  projectStartDate={project.startDate}
                  projectEndDate={project.plannedEndDate}
                  canReschedule={permissions.canReschedule}
                  canCreate={permissions.canCreatePlan}
                  canUpdateProgress={permissions.canUpdateProgress}
                  accessSummary={permissions.summary}
                />
              );
            case "wbs":
              return (
                <WBSEditorTab
                  projectId={project.id}
                  initialItems={wbsItems}
                  canManage={canManage}
                  onOpenComments={(item) => setActiveCommentWbsItem(item)}
                />
              );
            case "tickets":
              return (
                <ProjectTicketsTab
                  tickets={tickets}
                  projectCode={project.code}
                  currentPhase={currentPhase}
                />
              );
            case "milestones":
              return (
                <MilestonesEditorTab
                  projectId={project.id}
                  initialMilestones={milestones}
                  canManage={canManage}
                />
              );
            case "invoices":
              if (!permissions.canViewFinancials) return null;
              return (
                <InvoicesTab
                  projectId={project.id}
                  projectCode={project.code}
                  clientName={project.clientCompanyName}
                />
              );
            case "notifications":
              return (
                <NotificationsTab
                  projectId={project.id}
                  projectCode={project.code}
                />
              );
            case "governance":
              return (
                <GovernanceTab
                  projectId={project.id}
                  reviews={reviews}
                  wbsTree={wbsItems}
                />
              );
            case "team":
              return <TeamTab projectId={project.id} />;
            case "timesheets":
              return <TimesheetsTab projectId={project.id} userRole={userRole} />;
            case "financials":
              return permissions.canViewFinancials ? (
                <FinancialsTab projectId={project.id} canManageBilling={permissions.canManageInvoices} />
              ) : null;
            case "risks":
              return <RisksTab risks={risks} />;
            case "documents":
              return <DocumentsTab projectId={project.id} userRole={userRole} />;
            default:
              return null;
          }
        }}
      </Tabs>

      {/* Edit Project Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title={`Edit Project: ${project.code}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsEditModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleEditSubmit} disabled={isSavingEdit || !editForm.name}>
              {isSavingEdit ? "Saving..." : "Save Changes"}
            </Button>
          </>
        }
      >
        <form onSubmit={handleEditSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-navy-700 mb-1">
              Project Name *
            </label>
            <Input
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-navy-700 mb-1">Description</label>
            <textarea
              value={editForm.description}
              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
              className="w-full text-sm rounded-lg border border-neutral-200 px-3 py-2 text-navy-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-navy-700 mb-1">Status</label>
              <select
                value={editForm.status}
                onChange={(e) => setEditForm({ ...editForm, status: e.target.value as any })}
                className="w-full text-sm rounded-lg border border-neutral-200 px-3 py-2 text-navy-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="initiated">Initiated</option>
                <option value="planning">Planning</option>
                <option value="active">Active</option>
                <option value="on_hold">On Hold</option>
                <option value="closed">Closed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-navy-700 mb-1">Delivery Phase</label>
              <select
                value={editForm.currentPhase}
                onChange={(e) => setEditForm({ ...editForm, currentPhase: e.target.value })}
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
              <label className="block text-sm font-medium text-navy-700 mb-1">Client Company</label>
              <Input
                value={editForm.clientCompanyName}
                onChange={(e) => setEditForm({ ...editForm, clientCompanyName: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-navy-700 mb-1">
                Lead PM <span className="font-normal text-navy-400">(more PMs on the Team tab)</span>
              </label>
              <select
                value={editForm.projectManagerUserId}
                disabled={!permissions.canChangeProjectManager}
                title={
                  permissions.canChangeProjectManager
                    ? undefined
                    : "Only an administrator or the current project manager can change this."
                }
                onChange={(e) => setEditForm({ ...editForm, projectManagerUserId: e.target.value })}
                className="w-full text-sm rounded-lg border border-neutral-200 px-3 py-2 text-navy-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-neutral-50 disabled:text-navy-500 disabled:cursor-not-allowed"
              >
                <option value="">Unassigned</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.fullName} {emp.jobLevel ? `(${emp.jobLevel})` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className={`grid gap-4 ${permissions.canViewFinancials ? "grid-cols-3" : "grid-cols-2"}`}>
            {permissions.canViewFinancials && (
              <div>
                <label className="block text-sm font-medium text-navy-700 mb-1">Budget (INR)</label>
                <Input
                  type="number"
                  value={editForm.budgetInr}
                  onChange={(e) => setEditForm({ ...editForm, budgetInr: e.target.value })}
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-navy-700 mb-1">Start Date</label>
              <Input
                type="date"
                value={editForm.startDate}
                onChange={(e) => setEditForm({ ...editForm, startDate: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-navy-700 mb-1">Planned End</label>
              <Input
                type="date"
                value={editForm.plannedEndDate}
                onChange={(e) => setEditForm({ ...editForm, plannedEndDate: e.target.value })}
              />
            </div>
          </div>
        </form>
      </Modal>

      {/* WBS Client Comments Modal */}
      <WBSCommentsModal
        isOpen={!!activeCommentWbsItem}
        onClose={() => setActiveCommentWbsItem(null)}
        wbsItem={activeCommentWbsItem}
        projectId={project.id}
      />

      {/* Scope & Solution Approach Modals */}
      <ScopeAndSolutionModals
        isScopeOpen={isScopeModalOpen}
        onCloseScope={() => setIsScopeModalOpen(false)}
        isSolutionOpen={isSolutionModalOpen}
        onCloseSolution={() => setIsSolutionModalOpen(false)}
        projectCode={project.code}
        projectName={project.name}
        clientName={project.clientCompanyName}
      />

      <ScrapProjectDialog
        projectId={project.id}
        projectCode={project.code}
        projectName={project.name}
        isOpen={isScrapOpen}
        onClose={() => setIsScrapOpen(false)}
        onDone={(outcome, message) => {
          setScrapNotice(message);
          // A scrapped project has left every list, so staying on its
          // page would be a dead end. A recorded request has not.
          if (outcome === "scrapped") {
            router.push("/pmt");
            router.refresh();
          }
        }}
      />

      {scrapNotice && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-[70] -translate-x-1/2 rounded-xl border border-navy-900/10 bg-surface px-4 py-3 text-[13px] text-navy-800 shadow-lg animate-[modal-in_240ms_var(--ease-out-soft)_both]"
        >
          {scrapNotice}
          <button
            onClick={() => setScrapNotice("")}
            className="ml-3 cursor-pointer font-semibold text-navy-400 hover:text-navy-900"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}

function MetaItem({
  label,
  value,
  subtext,
  isBadge,
}: {
  label: string;
  value: string;
  subtext?: string;
  isBadge?: boolean;
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">{label}</p>
      {isBadge ? (
        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 mt-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          {value}
        </span>
      ) : (
        <p className="text-sm font-semibold text-navy-900 mt-0.5 truncate">{value}</p>
      )}
      {subtext && <p className="text-[10px] text-navy-500">{subtext}</p>}
    </div>
  );
}

// ─── Linked ITSM Tickets Tab ───────────────────────────────────────

function ProjectTicketsTab({
  tickets,
  projectCode,
  currentPhase,
}: {
  tickets: Ticket[];
  projectCode: string;
  currentPhase: string;
}) {
  const router = useRouter();

  const columns: Column<Ticket>[] = [
    {
      key: "ticketNumber",
      header: "Ticket #",
      render: (t) => (
        <span className="font-mono text-xs font-bold text-blue-600 hover:underline">
          {t.ticketNumber}
        </span>
      ),
      className: "w-32",
    },
    {
      key: "ticketType",
      header: "Type",
      render: (t) => (
        <span className="text-xs uppercase font-semibold text-neutral-600 bg-neutral-100 px-2 py-0.5 rounded">
          {t.ticketType?.replace("_", " ")}
        </span>
      ),
      className: "w-28",
    },
    {
      key: "subject",
      header: "Subject & Description",
      render: (t) => (
        <div className="max-w-md">
          <p className="font-medium text-navy-900 text-sm">{t.subject}</p>
          {t.description && (
            <p className="text-xs text-navy-500 line-clamp-1 mt-0.5">{t.description}</p>
          )}
        </div>
      ),
    },
    {
      key: "projectPhase",
      header: "Project Phase",
      render: (t) => (
        <span
          className={`inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full border ${phaseColorClass(
            t.projectPhase || currentPhase
          )}`}
        >
          {t.projectPhase || currentPhase}
        </span>
      ),
      className: "w-28",
    },
    {
      key: "status",
      header: "Status",
      render: (t) => (
        <ColorBadge colorClass={ticketStatusColor(t.status)}>
          {formatStatus(t.status)}
        </ColorBadge>
      ),
      className: "w-28",
    },
    {
      key: "priority",
      header: "Priority",
      render: (t) => (
        <ColorBadge colorClass={priorityColor(t.priority || "medium")}>
          {formatStatus(t.priority || "medium")}
        </ColorBadge>
      ),
      className: "w-24",
    },
    {
      key: "agent",
      header: "Assigned Agent",
      render: (t) => (
        <div className="text-xs">
          <span className="font-medium text-navy-900">{t.agent?.fullName || "Unassigned"}</span>
          {t.agent?.jobLevel && <span className="text-[10px] text-navy-400 block">{t.agent.jobLevel}</span>}
        </div>
      ),
      className: "w-36",
    },
    {
      key: "createdAt",
      header: "Created",
      render: (t) => (
        <span className="text-xs text-navy-500 tabular-nums">{formatDate(t.createdAt)}</span>
      ),
      className: "w-28",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-navy-900">
            ITSM Tickets Linked to {projectCode}
          </h3>
          <p className="text-xs text-navy-500">
            All support tickets, incidents, and requests linked to this project under phase &quot;{currentPhase}&quot;
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/itsm?projectCode=${projectCode}`}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-neutral-200 hover:bg-neutral-50 text-navy-700 transition-colors flex items-center gap-1"
          >
            <span>View in ITSM</span>
            <span>→</span>
          </Link>
          <Link
            href="/itsm"
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-navy-900 text-white hover:bg-navy-800 transition-colors flex items-center gap-1"
          >
            <span>+ New Ticket</span>
          </Link>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={tickets}
        onRowClick={(t) => router.push(`/itsm/${t.ticketNumber || t.id}`)}
        emptyMessage={`No tickets currently linked to project ${projectCode}. Create a ticket from the ITSM portal.`}
      />
    </div>
  );
}

// ─── WBS Tab ───────────────────────────────────────────────────────

// ─── Milestones Tab ────────────────────────────────────────────────

// ─── Risks Tab ─────────────────────────────────────────────────────

function RisksTab({ risks }: { risks: Risk[] }) {
  const columns: Column<Risk>[] = [
    { key: "title", header: "Title", render: (r) => <span className="font-medium">{r.title}</span> },
    {
      key: "probability", header: "Probability",
      render: (r) => r.probability ? <ColorBadge colorClass={impactColor(r.probability)}>{formatStatus(r.probability)}</ColorBadge> : <span className="text-navy-500">—</span>,
    },
    {
      key: "impact", header: "Impact",
      render: (r) => r.impact ? <ColorBadge colorClass={impactColor(r.impact)}>{formatStatus(r.impact)}</ColorBadge> : <span className="text-navy-500">—</span>,
    },
    {
      key: "status", header: "Status",
      render: (r) => <ColorBadge colorClass={riskStatusColor(r.status)}>{formatStatus(r.status)}</ColorBadge>,
    },
    { key: "owner", header: "Owner", render: (r) => <span className="text-navy-700">{r.owner?.fullName || "—"}</span> },
  ];

  return <DataTable columns={columns} data={risks} emptyMessage="No risks or issues logged" />;
}
