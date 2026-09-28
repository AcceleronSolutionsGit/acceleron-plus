// ═══════════════════════════════════════════════════════════════
// Scrapping a project.
//
// Taking a project out of circulation without destroying what it
// carries. A project is not just a row — hanging off it are timesheets
// somebody approved, invoices that have been sent, and tickets a client
// raised. So scrapping is a state the project enters, with the reason,
// the person and the moment recorded against it, and an admin can put
// it back.
//
// Purging — actually deleting the row and everything cascading from it
// — is offered only when there is demonstrably nothing to lose. The
// check is in `purgeBlockers` and every caller goes through it.
//
// One module owns all of this so the rules cannot be half-applied: the
// API, the UI and anything added later all ask the same questions here.
// ═══════════════════════════════════════════════════════════════

import { projectDb, itsmDb } from "./db";

// The pure rules live in `scrap-rules.ts` so the confirmation dialog
// can import them without dragging the database into the browser.
export {
  MIN_REASON_LENGTH,
  MAX_REASON_LENGTH,
  reasonProblem,
} from "./scrap-rules";

export interface ScrapState {
  scrapped: boolean;
  scrappedAt: string | null;
  scrappedByName: string | null;
  reason: string | null;
  /** A PM has asked; no admin has actioned it yet. */
  requestPending: boolean;
  requestedAt: string | null;
  requestedByName: string | null;
  requestReason: string | null;
}

export function scrapStateOf(row: Record<string, unknown>): ScrapState {
  const scrappedAt = row.scrapped_at ? new Date(row.scrapped_at as string).toISOString() : null;
  const requestedAt = row.scrap_requested_at
    ? new Date(row.scrap_requested_at as string).toISOString()
    : null;

  return {
    scrapped: Boolean(scrappedAt),
    scrappedAt,
    scrappedByName: (row.scrapped_by_name as string) ?? null,
    reason: (row.scrap_reason as string) ?? null,
    // A request that has been actioned is history, not a pending ask.
    requestPending: Boolean(requestedAt) && !scrappedAt,
    requestedAt,
    requestedByName: (row.scrap_requested_by_name as string) ?? null,
    requestReason: (row.scrap_request_reason as string) ?? null,
  };
}

export interface ProjectFootprint {
  workPackages: number;
  teamMembers: number;
  timesheets: number;
  approvedTimesheets: number;
  hoursLogged: number;
  invoices: number;
  milestones: number;
  documents: number;
  risks: number;
  tickets: number;
}

/** What is attached to this project — what scrapping keeps, and what purging would destroy. */
export async function footprintOf(projectId: string): Promise<ProjectFootprint> {
  const count = async (table: string, where: Record<string, unknown> = {}) => {
    try {
      const row = (await projectDb(table)
        .where({ project_id: projectId, ...where })
        .count("* as n")
        .first()) as { n?: string | number } | undefined;
      return Number(row?.n ?? 0);
    } catch {
      // A table that does not exist yet is zero rows, not an error that
      // should stop somebody scrapping a project.
      return 0;
    }
  };

  const [
    workPackages,
    teamMembers,
    timesheets,
    approvedTimesheets,
    invoices,
    milestones,
    documents,
    risks,
  ] = await Promise.all([
    count("wbs_items"),
    count("project_team_members"),
    count("project_timesheets"),
    count("project_timesheets", { status: "approved" }),
    count("invoices"),
    count("milestones"),
    count("project_documents"),
    count("risks"),
  ]);

  let hoursLogged = 0;
  try {
    const row = (await projectDb("project_timesheets")
      .where("project_id", projectId)
      .sum("hours_logged as total")
      .first()) as { total?: string | number } | undefined;
    hoursLogged = Math.round(Number(row?.total ?? 0) * 10) / 10;
  } catch {
    hoursLogged = 0;
  }

  // Tickets live in a different database, so they are counted separately
  // and never cascade — purging a project cannot delete a client's ticket.
  let tickets = 0;
  try {
    const row = (await itsmDb("tickets")
      .where("project_id", projectId)
      .count("* as n")
      .first()) as { n?: string | number } | undefined;
    tickets = Number(row?.n ?? 0);
  } catch {
    tickets = 0;
  }

  return {
    workPackages,
    teamMembers,
    timesheets,
    approvedTimesheets,
    hoursLogged,
    invoices,
    milestones,
    documents,
    risks,
    tickets,
  };
}

/**
 * Reasons this project must not be permanently deleted.
 *
 * An empty list means purging is safe. Anything in it is a record
 * somebody else relies on — a signed-off timesheet, an invoice that has
 * been sent, a ticket a client raised — and those outlive the project
 * they happened on.
 */
export function purgeBlockers(footprint: ProjectFootprint): string[] {
  const blockers: string[] = [];

  if (footprint.approvedTimesheets > 0) {
    blockers.push(
      `${footprint.approvedTimesheets} approved timesheet ${
        footprint.approvedTimesheets === 1 ? "entry" : "entries"
      } — somebody signed those off`
    );
  }
  if (footprint.invoices > 0) {
    blockers.push(
      `${footprint.invoices} invoice${footprint.invoices === 1 ? "" : "s"} — these have been raised against the client`
    );
  }
  if (footprint.tickets > 0) {
    blockers.push(
      `${footprint.tickets} linked ticket${footprint.tickets === 1 ? "" : "s"} — raised on the service desk`
    );
  }
  if (footprint.hoursLogged > 0) {
    blockers.push(`${footprint.hoursLogged} hours logged against it`);
  }

  return blockers;
}

/** One line for a confirmation dialog: what is kept when this is scrapped. */
export function describeFootprint(f: ProjectFootprint): string {
  const parts: string[] = [];
  const add = (n: number, one: string, many = `${one}s`) => {
    if (n > 0) parts.push(`${n} ${n === 1 ? one : many}`);
  };

  add(f.workPackages, "work package");
  add(f.teamMembers, "person staffed", "people staffed");
  add(f.timesheets, "timesheet entry", "timesheet entries");
  add(f.invoices, "invoice");
  add(f.milestones, "milestone");
  add(f.documents, "document");
  add(f.risks, "risk");
  add(f.tickets, "linked ticket");

  if (parts.length === 0) return "Nothing is attached to this project yet.";
  return parts.join(" · ");
}

// ─── Writes ────────────────────────────────────────────────────────

export interface Actor {
  userId: string;
  name: string;
}

/** Take a project out of circulation. Nothing is destroyed. */
export async function scrapProject(
  projectId: string,
  reason: string,
  actor: Actor
): Promise<void> {
  await projectDb("projects")
    .where("id", projectId)
    .update({
      scrapped_at: new Date(),
      scrapped_by_user_id: actor.userId,
      scrapped_by_name: actor.name,
      scrap_reason: reason.trim(),
      updated_at: new Date(),
    });
}

/** Put it back. The reason it was scrapped is cleared with it. */
export async function restoreProject(projectId: string): Promise<void> {
  await projectDb("projects")
    .where("id", projectId)
    .update({
      scrapped_at: null,
      scrapped_by_user_id: null,
      scrapped_by_name: null,
      scrap_reason: null,
      // The request is cleared too — it has been answered, and leaving
      // it would show the project as still pending somebody's decision.
      scrap_requested_at: null,
      scrap_requested_by_user_id: null,
      scrap_requested_by_name: null,
      scrap_request_reason: null,
      updated_at: new Date(),
    });
}

/** A PM asking an admin to scrap it. */
export async function requestScrap(
  projectId: string,
  reason: string,
  actor: Actor
): Promise<void> {
  await projectDb("projects")
    .where("id", projectId)
    .update({
      scrap_requested_at: new Date(),
      scrap_requested_by_user_id: actor.userId,
      scrap_requested_by_name: actor.name,
      scrap_request_reason: reason.trim(),
      updated_at: new Date(),
    });
}

/** Withdraw a request that has not been actioned. */
export async function withdrawScrapRequest(projectId: string): Promise<void> {
  await projectDb("projects").where("id", projectId).update({
    scrap_requested_at: null,
    scrap_requested_by_user_id: null,
    scrap_requested_by_name: null,
    scrap_request_reason: null,
    updated_at: new Date(),
  });
}

/**
 * Delete the row for good, and everything that cascades from it.
 *
 * The caller must have checked `purgeBlockers` first; this checks again
 * rather than trusting it, because the only protection against deleting
 * a client's invoice is that this function refuses to.
 */
export async function purgeProject(projectId: string): Promise<void> {
  const blockers = purgeBlockers(await footprintOf(projectId));
  if (blockers.length > 0) {
    throw new Error(
      `This project cannot be deleted permanently: ${blockers.join("; ")}.`
    );
  }
  await projectDb("projects").where("id", projectId).del();
}
