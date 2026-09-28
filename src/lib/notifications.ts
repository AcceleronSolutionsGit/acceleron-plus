// ═══════════════════════════════════════════════════════════════
// Project notification engine.
//
// One entry point — `notify()` — used by every route that changes
// something a project manager should hear about. It resolves who
// should be told, writes an in-app row per recipient, and (best
// effort) emails them.
//
// Design rules:
//  • Notifying must NEVER fail the action that triggered it. Every
//    path here swallows its own errors and logs.
//  • Recipients are derived from the project (PM, sponsor, team),
//    never hardcoded.
//  • A dedupe key stops the same event being repeated (e.g. an
//    overdue-milestone sweep running twice in one day).
// ═══════════════════════════════════════════════════════════════

import { randomUUID } from "crypto";
import { projectDb, identityDb } from "./db";
import { sendMail, renderNotificationEmail, isMailConfigured } from "./mailer";
import type { NotificationEventType } from "./types";

export type NotificationSeverity = "info" | "warning" | "critical";

/** Who on the project should hear about an event. */
export type Audience = "pm" | "sponsor" | "team" | "actor";

export interface NotifyInput {
  /** Project UUID or code — both are accepted. */
  project: string;
  eventType: NotificationEventType;
  title: string;
  message: string;
  severity?: NotificationSeverity;
  /** Defaults to ["pm", "sponsor"]. */
  audience?: Audience[];
  /** Extra explicit recipients (user UUIDs). */
  extraRecipients?: string[];
  /** The user who caused the event — excluded unless "actor" is in the audience. */
  actorUserId?: string | null;
  entityType?: string;
  entityId?: string;
  /** Defaults to the project page. */
  actionUrl?: string;
  /** Suppress repeats. Same key = written at most once. */
  dedupeKey?: string;
  /** Skip email even when SMTP is configured. */
  inAppOnly?: boolean;
}

export interface NotifyResult {
  created: number;
  recipients: string[];
  emailed: number;
  skipped?: "project_not_found" | "no_recipients" | "duplicate";
  error?: string;
}

interface ProjectRow {
  id: string;
  code: string;
  name: string;
  tenant_id: string | null;
  project_manager_user_id: string | null;
  sponsor_user_id: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Resolve a project by UUID or code. Exported — routes need this too. */
export async function resolveProject(idOrCode: string): Promise<ProjectRow | null> {
  if (!idOrCode) return null;
  const row = await projectDb("projects")
    .where(UUID_RE.test(idOrCode) ? "id" : "code", idOrCode)
    .select("id", "code", "name", "tenant_id", "project_manager_user_id", "sponsor_user_id")
    .first<ProjectRow | undefined>();
  return row ?? null;
}

async function resolveRecipients(
  project: ProjectRow,
  audience: Audience[],
  actorUserId: string | null | undefined,
  extra: string[]
): Promise<string[]> {
  const ids = new Set<string>();

  if (audience.includes("pm") && project.project_manager_user_id) {
    ids.add(project.project_manager_user_id);
  }
  if (audience.includes("sponsor") && project.sponsor_user_id) {
    ids.add(project.sponsor_user_id);
  }
  if (audience.includes("team")) {
    try {
      const members = await projectDb("project_team_members")
        .where("project_id", project.id)
        .select("user_id");
      members.forEach((m: { user_id: string | null }) => m.user_id && ids.add(m.user_id));
    } catch {
      // Table may not exist in a partially migrated database.
    }
  }
  extra.forEach((id) => id && ids.add(id));

  // Don't tell people about their own action unless asked to.
  if (actorUserId && !audience.includes("actor")) ids.delete(actorUserId);

  return [...ids];
}

/** Look up email + name for a set of user ids. Returns an empty map on failure. */
async function lookupUsers(userIds: string[]): Promise<Map<string, { email: string; fullName: string }>> {
  const map = new Map<string, { email: string; fullName: string }>();
  if (userIds.length === 0) return map;

  try {
    const rows = await identityDb("users")
      .whereIn("id", userIds)
      .andWhere("is_active", true)
      .select("id", "email", "full_name");
    for (const row of rows) {
      if (row.email) map.set(row.id, { email: row.email, fullName: row.full_name ?? row.email });
    }
  } catch (err) {
    console.error("[notify] Could not look up recipient emails:", err);
  }
  return map;
}

/**
 * Record an event and tell the right people.
 * Always resolves — check the result rather than catching.
 */
export async function notify(input: NotifyInput): Promise<NotifyResult> {
  try {
    const project = await resolveProject(input.project);
    if (!project) {
      console.warn(`[notify] Unknown project "${input.project}" for event ${input.eventType}`);
      return { created: 0, recipients: [], emailed: 0, skipped: "project_not_found" };
    }

    const audience = input.audience ?? ["pm", "sponsor"];
    const recipients = await resolveRecipients(
      project,
      audience,
      input.actorUserId,
      input.extraRecipients ?? []
    );

    if (recipients.length === 0) {
      return { created: 0, recipients: [], emailed: 0, skipped: "no_recipients" };
    }

    if (input.dedupeKey) {
      const existing = await projectDb("project_notifications")
        .where("dedupe_key", input.dedupeKey)
        .first();
      if (existing) return { created: 0, recipients, emailed: 0, skipped: "duplicate" };
    }

    const now = new Date();
    const actionUrl = input.actionUrl ?? `/pmt/${project.code}`;
    const severity = input.severity ?? "info";

    const rows = recipients.map((recipientUserId) => ({
      id: randomUUID(),
      tenant_id: project.tenant_id ?? "acceleron",
      recipient_user_id: recipientUserId,
      actor_user_id: input.actorUserId ?? null,
      event_type: input.eventType,
      severity,
      title: input.title,
      message: input.message,
      project_id: project.id,
      project_code: project.code,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      action_url: actionUrl,
      is_read: false,
      // Only the first row carries the key; the unique index does the rest.
      dedupe_key: input.dedupeKey ?? null,
      created_at: now,
      updated_at: now,
    }));

    // One key can only be claimed once, so give it to a single row.
    rows.slice(1).forEach((row) => {
      row.dedupe_key = null;
    });

    await projectDb("project_notifications").insert(rows);

    // ─── Email, best effort ─────────────────────────────────────
    let emailed = 0;
    if (!input.inAppOnly && isMailConfigured()) {
      const users = await lookupUsers(recipients);
      const addresses = recipients
        .map((id) => users.get(id)?.email)
        .filter((email): email is string => Boolean(email));

      if (addresses.length > 0) {
        const { subject, text, html } = renderNotificationEmail({
          title: input.title,
          message: input.message,
          projectName: project.name,
          projectCode: project.code,
          actionUrl,
          severity,
        });
        const result = await sendMail({ to: addresses, subject, text, html });
        if (result.sent) {
          emailed = addresses.length;
          await projectDb("project_notifications")
            .whereIn(
              "id",
              rows.map((r) => r.id)
            )
            .update({ email_sent_at: new Date() })
            .catch(() => undefined);
        }
      }
    }

    return { created: rows.length, recipients, emailed };
  } catch (err) {
    // A failed notification must never fail the action that caused it.
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[notify] ${input.eventType} failed:`, error);
    return { created: 0, recipients: [], emailed: 0, error };
  }
}

/**
 * Fire-and-forget wrapper. Use inside a route handler when the caller
 * shouldn't wait for SMTP. Errors are already swallowed by notify().
 */
export function notifyAsync(input: NotifyInput): void {
  void notify(input);
}

// ─── Convenience builders ──────────────────────────────────────────
//
// Each returns a NotifyInput so callers stay declarative and the
// wording of a given event lives in exactly one place.

export const events = {
  projectCreated: (project: string, name: string, code: string, actorUserId?: string | null): NotifyInput => ({
    project,
    eventType: "project_kickoff",
    title: `Project ${code} created`,
    message: `"${name}" has been created and an ITSM project context was opened for it. Tickets raised against ${code} will now appear on the project.`,
    audience: ["pm", "sponsor"],
    actorUserId,
    entityType: "project",
    severity: "info",
  }),

  phaseChanged: (
    project: string,
    code: string,
    fromPhase: string | null,
    toPhase: string,
    actorUserId?: string | null
  ): NotifyInput => ({
    project,
    eventType: "phase_changed",
    title: `${code} moved to ${toPhase}`,
    message: fromPhase
      ? `Project phase changed from ${fromPhase} to ${toPhase}. Linked ITSM tickets now report the new phase.`
      : `Project phase set to ${toPhase}.`,
    audience: ["pm", "sponsor", "team"],
    actorUserId,
    entityType: "project",
    severity: "info",
  }),

  statusChanged: (
    project: string,
    code: string,
    status: string,
    actorUserId?: string | null
  ): NotifyInput => ({
    project,
    eventType: status === "closed" ? "project_closed" : "project_status_changed",
    title: `${code} is now ${status.replace(/_/g, " ")}`,
    message: `The project status changed to "${status}".`,
    audience: ["pm", "sponsor"],
    actorUserId,
    entityType: "project",
    severity: status === "on_hold" || status === "cancelled" ? "warning" : "info",
  }),

  milestoneCreated: (
    project: string,
    milestoneId: string,
    name: string,
    dueDate: string | null,
    actorUserId?: string | null
  ): NotifyInput => ({
    project,
    eventType: "milestone_created",
    title: `Milestone added: ${name}`,
    message: dueDate
      ? `A new milestone "${name}" is due on ${new Date(dueDate).toDateString()}.`
      : `A new milestone "${name}" was added with no due date set.`,
    audience: ["pm", "team"],
    actorUserId,
    entityType: "milestone",
    entityId: milestoneId,
    severity: "info",
  }),

  milestoneCompleted: (
    project: string,
    milestoneId: string,
    name: string,
    actorUserId?: string | null
  ): NotifyInput => ({
    project,
    eventType: "milestone_completed",
    title: `Milestone complete: ${name}`,
    message: `"${name}" has been marked complete. If it is a billing milestone, raise the invoice from the Invoices tab.`,
    audience: ["pm", "sponsor"],
    actorUserId,
    entityType: "milestone",
    entityId: milestoneId,
    severity: "info",
  }),

  milestoneOverdue: (
    project: string,
    milestoneId: string,
    name: string,
    dueDate: string
  ): NotifyInput => ({
    project,
    eventType: "milestone_overdue",
    title: `Milestone overdue: ${name}`,
    message: `"${name}" was due on ${new Date(dueDate).toDateString()} and is still open.`,
    audience: ["pm", "sponsor"],
    entityType: "milestone",
    entityId: milestoneId,
    severity: "warning",
    // At most one overdue alert per milestone per day.
    dedupeKey: `milestone_overdue:${milestoneId}:${new Date().toISOString().slice(0, 10)}`,
  }),

  wbsStatusChanged: (
    project: string,
    wbsId: string,
    name: string,
    status: string,
    actorUserId?: string | null
  ): NotifyInput => ({
    project,
    eventType: status === "completed" ? "deliverable_ready" : "wbs_status_changed",
    title:
      status === "completed"
        ? `Deliverable ready: ${name}`
        : `Work package "${name}" is now ${status.replace(/_/g, " ")}`,
    message:
      status === "completed"
        ? `The work package "${name}" has been completed and is ready for review.`
        : `The status of work package "${name}" changed to "${status}".`,
    audience: ["pm", "team"],
    actorUserId,
    entityType: "wbs_item",
    entityId: wbsId,
    severity: "info",
  }),

  riskRaised: (
    project: string,
    riskId: string,
    title: string,
    probability: string | null,
    impact: string | null,
    actorUserId?: string | null
  ): NotifyInput => {
    const isSevere = probability === "high" && impact === "high";
    return {
      project,
      eventType: "risk_raised",
      title: isSevere ? `Critical risk raised: ${title}` : `Risk raised: ${title}`,
      message: `A risk was logged with probability "${probability ?? "unset"}" and impact "${impact ?? "unset"}". Review it on the Risks & Issues tab.`,
      audience: isSevere ? ["pm", "sponsor"] : ["pm"],
      actorUserId,
      entityType: "risk",
      entityId: riskId,
      severity: isSevere ? "critical" : "warning",
    };
  },

  riskEscalated: (
    project: string,
    riskId: string,
    title: string,
    actorUserId?: string | null
  ): NotifyInput => ({
    project,
    eventType: "risk_escalated",
    title: `Risk escalated: ${title}`,
    message: `"${title}" has been escalated to high probability and high impact. It needs a mitigation owner.`,
    audience: ["pm", "sponsor"],
    actorUserId,
    entityType: "risk",
    entityId: riskId,
    severity: "critical",
  }),

  governanceRecorded: (
    project: string,
    reviewId: string,
    reviewType: string,
    outcome: string | null,
    actorUserId?: string | null
  ): NotifyInput => ({
    project,
    eventType: outcome === "fail" ? "stage_gate_failed" : "stage_gate_recorded",
    title:
      outcome === "fail"
        ? `Stage-gate FAILED: ${reviewType}`
        : `Stage-gate recorded: ${reviewType}`,
    message:
      outcome === "fail"
        ? `The "${reviewType}" review did not pass. The project cannot advance until the findings are closed.`
        : `A "${reviewType}" review was recorded with outcome "${outcome ?? "pending"}".`,
    audience: ["pm", "sponsor"],
    actorUserId,
    entityType: "governance_review",
    entityId: reviewId,
    severity: outcome === "fail" ? "critical" : "info",
  }),

  ticketLinked: (
    project: string,
    ticketId: string,
    ticketNumber: string,
    subject: string,
    phase: string | null
  ): NotifyInput => ({
    project,
    eventType: "ticket_linked",
    title: `Ticket ${ticketNumber} linked to this project`,
    message: phase
      ? `"${subject}" was raised against this project during the ${phase} phase.`
      : `"${subject}" was raised against this project.`,
    audience: ["pm"],
    entityType: "ticket",
    entityId: ticketId,
    actionUrl: `/itsm/${ticketNumber}`,
    severity: "info",
    dedupeKey: `ticket_linked:${ticketId}`,
  }),

  ticketEscalated: (
    project: string,
    ticketId: string,
    ticketNumber: string,
    subject: string,
    priority: string
  ): NotifyInput => ({
    project,
    eventType: "ticket_escalated",
    title: `Ticket ${ticketNumber} escalated to ${priority}`,
    message: `"${subject}" is now ${priority} priority on this project.`,
    audience: ["pm"],
    entityType: "ticket",
    entityId: ticketId,
    actionUrl: `/itsm/${ticketNumber}`,
    severity: "warning",
  }),

  ticketSlaBreached: (
    project: string,
    ticketId: string,
    ticketNumber: string,
    subject: string
  ): NotifyInput => ({
    project,
    eventType: "sla_breach",
    title: `SLA breached on ${ticketNumber}`,
    message: `"${subject}" has breached its resolution SLA.`,
    audience: ["pm", "sponsor"],
    entityType: "ticket",
    entityId: ticketId,
    actionUrl: `/itsm/${ticketNumber}`,
    severity: "critical",
    dedupeKey: `sla_breach:${ticketId}`,
  }),
};

/**
 * Sweep for milestones that have slipped past their due date and alert
 * on each one. Safe to call repeatedly — the dedupe key limits it to
 * one alert per milestone per day.
 */
export async function sweepOverdueMilestones(projectId?: string): Promise<number> {
  try {
    let query = projectDb("milestones as m")
      .join("projects as p", "p.id", "m.project_id")
      .whereNotNull("m.due_date")
      .where("m.due_date", "<", new Date())
      .whereNotIn("m.status", ["completed", "missed"])
      .select("m.id", "m.name", "m.due_date", "p.id as project_id");

    if (projectId) query = query.where("p.id", projectId);

    const overdue = await query;
    let sent = 0;

    for (const row of overdue) {
      const result = await notify(
        events.milestoneOverdue(
          row.project_id,
          row.id,
          row.name,
          new Date(row.due_date).toISOString()
        )
      );
      if (result.created > 0) sent++;
    }
    return sent;
  } catch (err) {
    console.error("[notify] Overdue milestone sweep failed:", err);
    return 0;
  }
}
