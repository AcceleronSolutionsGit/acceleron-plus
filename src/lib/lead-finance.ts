// ═══════════════════════════════════════════════════════════════
// Once a lead becomes a project, its money is the project's money.
//
// The finalized fee on a converted lead IS the project budget, and the
// opportunity value is copied from it. So for a converted lead the
// project rule applies — the project's named PM and admins only — or the
// pipeline would be a side door to every budget the project page hides.
// Leads still in pre-sales are unaffected: they fall to the global role.
// ═══════════════════════════════════════════════════════════════

import { projectDb } from "./db";
import { can, canSeeProjectFinancials } from "./permissions";
import type { AppRole } from "./types";

type Viewer = { role: AppRole; userId?: string | null } | null | undefined;

/** Lead ids (of those given) whose money this viewer must not see. */
export async function leadsWithHiddenFinancials(leadIds: string[], viewer: Viewer): Promise<Set<string>> {
  const hidden = new Set<string>();
  if (!viewer || leadIds.length === 0) return new Set(leadIds);
  if (viewer.role === "admin") return hidden;
  // Members and clients see no pre-sales money at all.
  if (!can({ role: viewer.role }, "financials.view")) return new Set(leadIds);

  const projects = (await projectDb("projects")
    .whereIn("lead_id", leadIds)
    .select("lead_id", "project_manager_user_id")
    .catch(() => [])) as { lead_id: string; project_manager_user_id: string | null }[];

  for (const p of projects) {
    if (!canSeeProjectFinancials(viewer, { projectManagerUserId: p.project_manager_user_id })) {
      hidden.add(p.lead_id);
    }
  }
  return hidden;
}

/** A mapped lead without its money fields — keys removed, not zeroed. */
export function withoutLeadFinancials<T extends object>(lead: T): T {
  const copy: Record<string, unknown> = { ...(lead as Record<string, unknown>) };
  delete copy.opportunityValueInr;
  delete copy.opportunity_value_inr;
  return copy as T;
}
