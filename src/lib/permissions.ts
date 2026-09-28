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
 * Free text in project_team_members.role_in_project — "PM", "Tech Lead",
 * "Developer", "QA" — mapped onto the roles above. Anything unrecognised
 * is a contributor, which is the safe middle.
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
   * True when this person is the named project manager on the project
   * row (projects.project_manager_user_id). Narrower than isProjectOwner:
   * a sponsor is an owner but not the PM.
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
// global "pm" role is not enough, and neither is a "PM" line on the team
// tab — both are too easy to acquire. What counts is being the project
// manager named on the project itself, which only an admin (or the
// outgoing PM) can change.

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
  project: { projectManagerUserId?: string | null } | null | undefined
): boolean {
  if (!viewer) return false;
  if (viewer.role === "admin") return true;
  if (viewer.role === "client") return false;
  return Boolean(
    viewer.userId && project?.projectManagerUserId && project.projectManagerUserId === viewer.userId
  );
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

  // Money on a project: the named PM and admins only (see above). This
  // is decided before the layers, because it is not a layer question.
  if (context.projectScoped && isFinancialCapability(capability)) {
    return context.role !== "client" && context.isProjectManager === true;
  }

  if (!GLOBAL[context.role]?.includes(capability)) return false;

  // Named PM or sponsor: their global role already reflects the project.
  if (context.isProjectOwner) return true;

  // Not a member of this project, or not asking about one: the global
  // role is the answer.
  if (!context.projectRole) return true;

  return PROJECT[context.projectRole]?.includes(capability) ?? false;
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
      "Creates and runs projects, owns plans, approves time. Sees budget, cost and invoices only on projects where they are the named PM.",
  },
  member: {
    name: "Team Member",
    description:
      "Updates their own work and logs time. No commercial visibility unless named PM of a project.",
  },
  client: {
    name: "Client",
    description: "Read-only view of the plan and shared documents. Can raise tickets.",
  },
};

export const PROJECT_ROLE_LABELS: Record<ProjectRole, { name: string; description: string }> = {
  manager: { name: "Project manager", description: "Owns this project's plan and delivery." },
  lead: { name: "Lead", description: "Edits the plan. Cannot close the project or invoice." },
  contributor: { name: "Contributor", description: "Updates progress on their work and logs time." },
  viewer: { name: "Viewer", description: "Reads the project. Changes nothing." },
  client: { name: "Client contact", description: "Reads the client-facing view and raises tickets." },
};

/** Plain-language summary of what someone may do here, for the UI. */
export function describeAccess(context: AccessContext): string {
  if (context.role === "admin") return "Administrator — full access.";

  const globalLabel = GLOBAL_ROLE_LABELS[context.role]?.name ?? context.role;
  if (context.isProjectOwner) return `${globalLabel} — you own this project.`;
  if (!context.projectRole) return `${globalLabel} — you are not on this project's team.`;

  const projectLabel = PROJECT_ROLE_LABELS[context.projectRole]?.name ?? context.projectRole;
  return `${globalLabel}, ${projectLabel} on this project.`;
}
