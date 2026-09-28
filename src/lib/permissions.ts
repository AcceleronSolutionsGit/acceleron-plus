// ═══════════════════════════════════════════════════════════════
// Who can do what.
//
// One matrix, used by the API guards and by the UI, so the buttons a
// person sees and the actions the server accepts can never disagree.
//
// Two layers:
//   1. The global role on identity_db.users sets the ceiling.
//   2. project_team_members.role_in_project narrows it for one project.
//
// A project manager therefore edits the plan on projects they run and
// only reads the others. Admins bypass the second layer entirely.
// ═══════════════════════════════════════════════════════════════

import type { AppRole } from "./types";

/** What a person does on one specific project. */
export type ProjectRole =
  | "manager" // owns the plan
  | "lead" // edits the plan, cannot close the project or invoice
  | "contributor" // updates their own work and logs time
  | "viewer" // reads everything they are allowed to see
  | "client"; // reads the client-facing subset only

/** Every distinct thing a person can attempt. */
export type Capability =
  // Projects
  | "project.view"
  | "project.create"
  | "project.edit"
  | "project.changePhase"
  | "project.close"
  | "project.delete"
  // The plan: WBS, milestones, Gantt
  | "plan.view"
  | "plan.create"
  | "plan.edit"
  | "plan.delete"
  | "plan.reschedule" // dragging bars on the Gantt
  | "plan.updateProgress" // moving a % without moving dates
  // Risks and governance
  | "risk.view"
  | "risk.create"
  | "risk.edit"
  | "risk.delete"
  | "governance.view"
  | "governance.record"
  | "governance.delete"
  // Commercial
  | "financials.view"
  | "invoice.view"
  | "invoice.manage"
  // Time
  | "timesheet.logOwn"
  | "timesheet.viewAll"
  | "timesheet.approve"
  // Documents
  | "document.view"
  | "document.upload"
  | "document.delete"
  // Staffing
  | "team.view"
  | "team.manage"
  | "team.viewCost" // the money side of an assignment
  // Tickets
  | "ticket.view"
  | "ticket.create"
  // Administration
  | "employee.view"
  | "employee.manage"
  | "role.manage"
  | "skill.manage"
  | "masters.manage"
  | "integration.run"
  // Reporting across every project at once, rather than within one
  | "report.allocations"
  // Bringing a collected sheet of allocations back in, in bulk
  | "allocation.import"
  // Output
  | "export.plan"
  | "export.financials";

// ─── Layer 1: the global ceiling ───────────────────────────────────

const GLOBAL: Record<AppRole, Capability[]> = {
  // Everything, including the employee master and role management.
  admin: [
    "project.view", "project.create", "project.edit", "project.changePhase", "project.close", "project.delete",
    "plan.view", "plan.create", "plan.edit", "plan.delete", "plan.reschedule", "plan.updateProgress",
    "risk.view", "risk.create", "risk.edit", "risk.delete",
    "governance.view", "governance.record", "governance.delete",
    "financials.view", "invoice.view", "invoice.manage",
    "timesheet.logOwn", "timesheet.viewAll", "timesheet.approve",
    "document.view", "document.upload", "document.delete",
    "team.view", "team.manage", "team.viewCost",
    "ticket.view", "ticket.create",
    "employee.view", "employee.manage", "role.manage", "skill.manage", "masters.manage", "integration.run",
    "report.allocations", "allocation.import",
    "export.plan", "export.financials",
  ],

  // Runs delivery. Can do everything on a project except delete it
  // outright, and cannot touch company masters or other people's roles.
  pm: [
    "project.view", "project.create", "project.edit", "project.changePhase", "project.close",
    "plan.view", "plan.create", "plan.edit", "plan.delete", "plan.reschedule", "plan.updateProgress",
    "risk.view", "risk.create", "risk.edit", "risk.delete",
    "governance.view", "governance.record",
    "financials.view", "invoice.view", "invoice.manage",
    "timesheet.logOwn", "timesheet.viewAll", "timesheet.approve",
    "document.view", "document.upload", "document.delete",
    "team.view", "team.manage", "team.viewCost",
    "ticket.view", "ticket.create",
    "employee.view",
    // A PM staffing a project needs to see who is free before they can
    // ask for them. Withholding the bench would make that guesswork.
    "report.allocations",
    "export.plan", "export.financials",
  ],

  // Delivery team. Updates the work they are doing, logs their own time,
  // raises risks. No commercial visibility.
  member: [
    "project.view",
    "plan.view", "plan.updateProgress",
    "risk.view", "risk.create",
    "governance.view",
    "timesheet.logOwn",
    "document.view", "document.upload",
    "team.view",
    "ticket.view", "ticket.create",
    "export.plan",
  ],

  // The client portal. Reads the plan and the documents shared with them,
  // raises tickets, and sees nothing about cost.
  client: [
    "project.view",
    "plan.view",
    "governance.view",
    "invoice.view",
    "document.view",
    "ticket.view", "ticket.create",
    // They can already read the plan on screen; refusing the download
    // was inconsistent rather than protective. Cost figures are still
    // withheld — that is what "export.financials" is for.
    "export.plan",
  ],
};

// ─── Layer 2: the project-level narrowing ──────────────────────────
//
// A capability has to appear in BOTH layers. This never grants anything
// the global role lacks — it only takes away.

const PROJECT: Record<ProjectRole, Capability[]> = {
  manager: GLOBAL.pm,

  lead: [
    "project.view",
    "plan.view", "plan.create", "plan.edit", "plan.delete", "plan.reschedule", "plan.updateProgress",
    "risk.view", "risk.create", "risk.edit",
    "governance.view",
    "timesheet.logOwn", "timesheet.viewAll",
    "document.view", "document.upload",
    "team.view",
    "ticket.view", "ticket.create",
    "export.plan",
  ],

  contributor: [
    "project.view",
    "plan.view", "plan.updateProgress",
    "risk.view", "risk.create",
    "governance.view",
    "timesheet.logOwn",
    "document.view", "document.upload",
    "team.view",
    "ticket.view", "ticket.create",
    "export.plan",
  ],

  viewer: [
    "project.view", "plan.view", "risk.view", "governance.view",
    "document.view", "team.view", "ticket.view", "export.plan",
  ],

  client: [
    "project.view", "plan.view", "governance.view", "invoice.view",
    "document.view", "ticket.view", "ticket.create", "export.plan",
  ],
};

/**
 * project_team_members.role_in_project mapped onto the roles above. The
 * column now only ever holds "PM", "Team Lead" or "Developer" (see
 * team-roles.js); the patterns also cover rows written before that, and
 * a client contact's row. Anything unrecognised is a contributor, the
 * safe middle.
 */
export function normaliseProjectRole(raw: string | null | undefined): ProjectRole {
  const value = String(raw ?? "").trim().toLowerCase();
  if (!value) return "contributor";

  if (/(^|\b)(pm|project manager|delivery manager|program manager|owner)(\b|$)/.test(value)) return "manager";
  if (/(lead|architect|principal|scrum master)/.test(value)) return "lead";
  if (/(client|customer|sponsor rep|stakeholder)/.test(value)) return "client";
  if (/(viewer|observer|read.?only|auditor)/.test(value)) return "viewer";
  return "contributor";
}

/**
 * Money columns that ride along on a project row. mapProjectRow maps the
 * whole row, so the margin fields travel with the budget unless removed.
 */
export const PROJECT_FINANCIAL_FIELDS = [
  "budgetInr",
  "targetMarginPercent",
  "marginSetByUserId",
  "marginSetAt",
  "marginNotes",
] as const;

/** The project without its money — keys removed, never zeroed. */
export function redactProjectFinancials<T extends object>(project: T): T {
  const copy: Record<string, unknown> = { ...(project as Record<string, unknown>) };
  for (const field of PROJECT_FINANCIAL_FIELDS) delete copy[field];
  return copy as T;
}

// ─── The decision ──────────────────────────────────────────────────

export interface AccessContext {
  role: AppRole;
  /** Undefined when the question is not about a specific project. */
  projectRole?: ProjectRole | null;
  /** True when this person is the named PM or sponsor on the project. */
  isProjectOwner?: boolean;
  /**
   * True when this person is a PM on the project: named on the project
   * row (projects.project_manager_user_id), or an active team member with
   * the PM role. A project can have several. A sponsor is an owner but
   * not a PM.
   */
  isProjectManager?: boolean;
  /**
   * True when this context was resolved for one specific project. The
   * financial rule below only makes sense per project; a question asked
   * without one (the pre-sales pipeline, say) falls to the global role.
   */
  projectScoped?: boolean;
}

// ─── Project finances: admin and the project's own PM, nobody else ──
//
// Budget, cost, margin, invoices, rates and the money columns in an
// export. These are not decided by the two layers above: holding the
// global "pm" role is not enough. What counts is being a PM on this
// project — named on the project row, or holding the PM role on its team
// — and only an admin or one of the project's existing PMs can make
// somebody that.

export const FINANCIAL_CAPABILITIES: readonly Capability[] = [
  "financials.view",
  "invoice.view",
  "invoice.manage",
  "team.viewCost",
  "export.financials",
];

export function isFinancialCapability(capability: Capability): boolean {
  return FINANCIAL_CAPABILITIES.includes(capability);
}

/**
 * May this person see the money on this project?
 *
 * The one rule behind every financial capability, exposed on its own for
 * the places that have a project row rather than an AccessContext — the
 * project list and the portfolio dashboard.
 */
export function canSeeProjectFinancials(
  viewer: { role: AppRole; userId?: string | null } | null | undefined,
  project: { id?: string; projectManagerUserId?: string | null } | null | undefined,
  /** Projects where the viewer is PM on the team (see projectsManagedBy). */
  managedProjectIds?: ReadonlySet<string>
): boolean {
  if (!viewer) return false;
  if (viewer.role === "admin") return true;
  if (viewer.role === "client") return false;
  if (viewer.userId && project?.projectManagerUserId && project.projectManagerUserId === viewer.userId) {
    return true;
  }
  return Boolean(project?.id && managedProjectIds?.has(project.id));
}

/**
 * Can this person do this?
 *
 * Admins are allowed everything. For everyone else the capability must
 * be in the global role, and — when the question concerns a project they
 * are a member of — in their project role too.
 */
export function can(context: AccessContext, capability: Capability): boolean {
  if (context.role === "admin") return true;

  // Money on a project: its PMs and admins only (see above). This is
  // decided before anything else, because it is not a layer question.
  if (context.projectScoped && isFinancialCapability(capability)) {
    return context.role !== "client" && context.isProjectManager === true;
  }

  // A client account is never raised by a project row, only narrowed.
  if (context.role === "client") {
    if (!GLOBAL.client.includes(capability)) return false;
    if (!context.projectRole) return true;
    return PROJECT[context.projectRole]?.includes(capability) ?? false;
  }

  // On a project team, the project role decides what they can do on
  // that project — PM, Team Lead or Developer — whatever their account
  // role. A PM (named on the project, or PM on the team) acts as manager.
  const teamRole: ProjectRole | null = context.isProjectManager ? "manager" : (context.projectRole ?? null);
  if (teamRole === "manager" || teamRole === "lead" || teamRole === "contributor") {
    return PROJECT[teamRole].includes(capability);
  }

  // Not on the team (or asked without a project): the account role.
  if (!GLOBAL[context.role]?.includes(capability)) return false;

  // Sponsor: their account role already reflects the project.
  if (context.isProjectOwner) return true;

  if (!teamRole) return true;

  // A legacy viewer row only narrows.
  return PROJECT[teamRole]?.includes(capability) ?? false;
}

/**
 * May this person make somebody a PM on the project, or take a PM off it?
 * Being PM is what unlocks the finances, so: admins, and the project's
 * existing PMs. Nobody grants it to themselves.
 */
export function canAssignProjectManagers(context: AccessContext): boolean {
  return context.role === "admin" || (context.role !== "client" && context.isProjectManager === true);
}

/** Every capability this context allows — handy for sending to the client. */
export function capabilitiesFor(context: AccessContext): Capability[] {
  if (context.role === "admin") return [...GLOBAL.admin];
  // Same answer as can(), capability by capability, so the two cannot drift.
  const candidates = new Set<Capability>([...(GLOBAL[context.role] ?? []), ...FINANCIAL_CAPABILITIES]);
  return [...candidates].filter((capability) => can(context, capability));
}

// ─── Labels for the interface ──────────────────────────────────────

export const GLOBAL_ROLE_LABELS: Record<AppRole, { name: string; description: string }> = {
  admin: {
    name: "Administrator",
    description: "Everything, including the employee master, roles and integrations.",
  },
  pm: {
    name: "Project Manager",
    description:
      "Creates projects and runs the ones they are PM on. Sees budget, cost and invoices only on projects where they are a PM.",
  },
  member: {
    name: "Team Member",
    description:
      "Updates their own work and logs time. On a project, their team role (Developer, Team Lead or PM) decides what they can do there.",
  },
  client: {
    name: "Client",
    description: "Read-only view of the plan and shared documents. Can raise tickets.",
  },
};

export const PROJECT_ROLE_LABELS: Record<ProjectRole, { name: string; description: string }> = {
  manager: { name: "PM", description: "Runs this project — plan, team and finances." },
  lead: { name: "Team Lead", description: "Edits the plan and work breakdown. No finances." },
  contributor: { name: "Developer", description: "Updates progress on their work and logs time." },
  viewer: { name: "Viewer", description: "Reads the project. Changes nothing." },
  client: { name: "Client contact", description: "Reads the client-facing view and raises tickets." },
};

/** Plain-language summary of what someone may do here, for the UI. */
export function describeAccess(context: AccessContext): string {
  if (context.role === "admin") return "Administrator — full access.";

  const globalLabel = GLOBAL_ROLE_LABELS[context.role]?.name ?? context.role;
  if (context.isProjectManager) return `PM on this project.`;
  if (context.projectRole) {
    const projectLabel = PROJECT_ROLE_LABELS[context.projectRole]?.name ?? context.projectRole;
    return context.role === "client" ? `${globalLabel}, ${projectLabel} on this project.` : `${projectLabel} on this project.`;
  }
  if (context.isProjectOwner) return `${globalLabel} — sponsor of this project.`;
  return `${globalLabel} — you are not on this project's team.`;
}
