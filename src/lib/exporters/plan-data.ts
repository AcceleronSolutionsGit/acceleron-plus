// ═══════════════════════════════════════════════════════════════
// Everything the exporters need, gathered once.
//
// Financial figures are only included when the caller holds
// "export.financials" — the same flag the UI uses to decide whether to
// show a cost column. A client exporting their own plan must not get a
// spreadsheet with our margins in it.
// ═══════════════════════════════════════════════════════════════

import { projectDb, itsmDb } from "../db";
import { toDateInput } from "@/lib/dates";

export interface PlanWbsItem {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  parentWbsId: string | null;
  sequence: number;
  status: string;
  startDate: string | null;
  endDate: string | null;
  progressPercent: number;
  estimatedHours: number | null;
  ownerName: string | null;
  depth: number;
}

export interface PlanMilestone {
  id: string;
  name: string;
  description: string | null;
  dueDate: string | null;
  status: string;
  completedAt: string | null;
  isBillingMilestone: boolean;
}

export interface PlanRisk {
  id: string;
  title: string;
  description: string | null;
  probability: string | null;
  impact: string | null;
  status: string;
  mitigationPlan: string | null;
  ownerName: string | null;
}

export interface PlanReview {
  id: string;
  reviewType: string;
  reviewDate: string | null;
  outcome: string | null;
  notes: string | null;
}

export interface PlanTeamMember {
  userName: string | null;
  roleInProject: string | null;
  allocationPercent: number | null;
  rateBandName: string | null;
}

export interface PlanTicket {
  ticketNumber: string;
  subject: string;
  status: string | null;
  priority: string | null;
  createdAt: string | null;
}

export interface PlanFinancials {
  budgetInr: number | null;
  totalLoggedHours: number;
  invoicedInr: number;
  invoiceCount: number;
}

export interface PlanExport {
  project: {
    id: string;
    code: string;
    name: string;
    description: string | null;
    status: string | null;
    clientCompanyName: string | null;
    currentPhase: string | null;
    startDate: string | null;
    plannedEndDate: string | null;
    projectManagerName: string | null;
  };
  wbs: PlanWbsItem[];
  milestones: PlanMilestone[];
  risks: PlanRisk[];
  reviews: PlanReview[];
  team: PlanTeamMember[];
  tickets: PlanTicket[];
  /** Absent when the caller may not see money. */
  financials?: PlanFinancials;
  generatedAt: string;
  /** Overall completion, weighted by each package's duration. */
  overallProgress: number;
}

function iso(value: unknown): string | null {
  // The local calendar day, not the UTC one — an export must agree with
  // the screen, and the screen shows the day Postgres holds.
  return toDateInput(value as Date | string | null) || null;
}

/** Depth-first ordering so the export reads like the tree on screen. */
function flattenTree(rows: Record<string, unknown>[]): PlanWbsItem[] {
  const byParent = new Map<string | null, Record<string, unknown>[]>();
  for (const row of rows) {
    const parent = (row.parent_wbs_id as string) ?? null;
    if (!byParent.has(parent)) byParent.set(parent, []);
    byParent.get(parent)!.push(row);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => Number(a.sequence ?? 0) - Number(b.sequence ?? 0));
  }

  const out: PlanWbsItem[] = [];
  const seen = new Set<string>();

  const walk = (parent: string | null, depth: number) => {
    for (const row of byParent.get(parent) ?? []) {
      const id = String(row.id);
      if (seen.has(id)) continue; // guards against a cycle in bad data
      seen.add(id);
      out.push({
        id,
        code: (row.code as string) ?? null,
        name: (row.name as string) ?? "",
        description: (row.description as string) ?? null,
        parentWbsId: (row.parent_wbs_id as string) ?? null,
        sequence: Number(row.sequence ?? 0),
        status: (row.status as string) ?? "not_started",
        startDate: iso(row.start_date),
        endDate: iso(row.end_date),
        progressPercent: Number(row.progress_percent ?? 0),
        estimatedHours: row.estimated_hours != null ? Number(row.estimated_hours) : null,
        ownerName: (row.owner_name as string) ?? null,
        depth,
      });
      walk(id, depth + 1);
    }
  };

  walk(null, 0);

  // Anything orphaned by a broken parent reference still gets exported.
  for (const row of rows) {
    if (!seen.has(String(row.id))) {
      out.push({
        id: String(row.id),
        code: (row.code as string) ?? null,
        name: (row.name as string) ?? "",
        description: (row.description as string) ?? null,
        parentWbsId: null,
        sequence: Number(row.sequence ?? 0),
        status: (row.status as string) ?? "not_started",
        startDate: iso(row.start_date),
        endDate: iso(row.end_date),
        progressPercent: Number(row.progress_percent ?? 0),
        estimatedHours: row.estimated_hours != null ? Number(row.estimated_hours) : null,
        ownerName: null,
        depth: 0,
      });
    }
  }

  return out;
}

/** Duration-weighted completion across leaf work packages. */
function weightedProgress(items: PlanWbsItem[]): number {
  const parentIds = new Set(items.map((i) => i.parentWbsId).filter(Boolean));
  const leaves = items.filter((i) => !parentIds.has(i.id));
  if (leaves.length === 0) return 0;

  const days = (item: PlanWbsItem) => {
    if (!item.startDate || !item.endDate) return 1;
    const span =
      (new Date(item.endDate).getTime() - new Date(item.startDate).getTime()) / 86400000;
    return Math.max(1, Math.round(span));
  };

  const total = leaves.reduce((sum, i) => sum + days(i), 0);
  if (total === 0) return 0;
  return Math.round(leaves.reduce((sum, i) => sum + i.progressPercent * days(i), 0) / total);
}

export async function gatherPlan(
  projectId: string,
  options: { includeFinancials: boolean }
): Promise<PlanExport | null> {
  const project = await projectDb("projects").where("id", projectId).first();
  if (!project) return null;

  const [wbsRows, milestoneRows, riskRows, reviewRows, teamRows] = await Promise.all([
    projectDb("wbs_items").where("project_id", projectId).select("*").catch(() => []),
    projectDb("milestones").where("project_id", projectId).orderBy("due_date").catch(() => []),
    projectDb("risks").where("project_id", projectId).orderBy("created_at", "desc").catch(() => []),
    projectDb("governance_reviews")
      .where("project_id", projectId)
      .orderBy("review_date", "desc")
      .catch(() => []),
    projectDb("project_team_members")
      .where("project_id", projectId)
      .andWhere("is_active", true)
      .catch(() => []),
  ]);

  // Linked tickets live in the other database, keyed by project code.
  const ticketRows = await itsmDb("tickets")
    .where("project_code", project.code)
    .select("ticket_number", "subject", "status", "priority", "created_at")
    .orderBy("created_at", "desc")
    .limit(500)
    .catch(() => []);

  const wbs = flattenTree(wbsRows as Record<string, unknown>[]);

  let financials: PlanFinancials | undefined;
  if (options.includeFinancials) {
    const [hours, invoices] = await Promise.all([
      projectDb("project_timesheets")
        .where("project_id", projectId)
        .sum("hours as total")
        .first<{ total: string | null }>()
        .catch(() => ({ total: null })),
      projectDb("invoices")
        .where("project_id", projectId)
        .select(projectDb.raw("coalesce(sum(amount_inr), 0) as amount"), projectDb.raw("count(*) as n"))
        .first<{ amount: string | null; n: string }>()
        .catch(() => ({ amount: null, n: "0" })),
    ]);

    financials = {
      budgetInr: project.budget_inr != null ? Number(project.budget_inr) : null,
      totalLoggedHours: Number(hours?.total ?? 0),
      invoicedInr: Number(invoices?.amount ?? 0),
      invoiceCount: Number(invoices?.n ?? 0),
    };
  }

  // The phase is authoritative in the ITSM context table.
  const context = await itsmDb("project_contexts")
    .where("project_db_id", projectId)
    .orWhere("project_code", project.code)
    .first()
    .catch(() => null);

  return {
    project: {
      id: project.id,
      code: project.code,
      name: project.name,
      description: project.description ?? null,
      status: project.status ?? null,
      clientCompanyName: project.client_company_name ?? null,
      currentPhase: context?.current_phase ?? null,
      startDate: iso(project.start_date),
      plannedEndDate: iso(project.planned_end_date),
      projectManagerName:
        (teamRows as Record<string, unknown>[]).find(
          (m) => String(m.user_id) === String(project.project_manager_user_id)
        )?.user_name as string ?? null,
    },
    wbs,
    milestones: (milestoneRows as Record<string, unknown>[]).map((m) => ({
      id: String(m.id),
      name: (m.name as string) ?? "",
      description: (m.description as string) ?? null,
      dueDate: iso(m.due_date),
      status: (m.status as string) ?? "pending",
      completedAt: iso(m.completed_at),
      isBillingMilestone: Boolean(m.is_billing_milestone),
    })),
    risks: (riskRows as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      title: (r.title as string) ?? "",
      description: (r.description as string) ?? null,
      probability: (r.probability as string) ?? null,
      impact: (r.impact as string) ?? null,
      status: (r.status as string) ?? "open",
      mitigationPlan: (r.mitigation_plan as string) ?? null,
      ownerName: null,
    })),
    reviews: (reviewRows as Record<string, unknown>[]).map((g) => ({
      id: String(g.id),
      reviewType: (g.review_type as string) ?? "",
      reviewDate: iso(g.review_date),
      outcome: (g.outcome as string) ?? null,
      notes: (g.notes as string) ?? null,
    })),
    team: (teamRows as Record<string, unknown>[]).map((t) => ({
      userName: (t.user_name as string) ?? null,
      roleInProject: (t.role_in_project as string) ?? null,
      allocationPercent: t.allocation_percent != null ? Number(t.allocation_percent) : null,
      rateBandName: (t.rate_band_name as string) ?? null,
    })),
    tickets: (ticketRows as Record<string, unknown>[]).map((t) => ({
      ticketNumber: (t.ticket_number as string) ?? "",
      subject: (t.subject as string) ?? "",
      status: (t.status as string) ?? null,
      priority: (t.priority as string) ?? null,
      createdAt: iso(t.created_at),
    })),
    financials,
    generatedAt: new Date().toISOString(),
    overallProgress: weightedProgress(wbs),
  };
}

/** A filename stem that is safe on Windows as well as everywhere else. */
export function exportFileStem(plan: PlanExport): string {
  const safe = `${plan.project.code}-${plan.project.name}`
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
  return `${safe}-plan-${plan.generatedAt.slice(0, 10)}`;
}
