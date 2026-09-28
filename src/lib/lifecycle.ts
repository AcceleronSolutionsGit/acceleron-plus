// ═══════════════════════════════════════════════════════════════
// The first two steps of the delivery lifecycle banner, read from data.
//
//   1. Lead & Pipeline      — where the deal came from
//   2. Solutioning & Effort — whether it was estimated before it was sold
//
// Both used to be hardcoded "completed", so every project claimed a
// qualified Zoho deal and a finalized grade-rate estimate whether it had
// one or not. They now come from the rows that actually record those
// things: projects.lead_id → leads, and leads → solutioning_sessions.
// A project imported from a Zoho Books sales order has no lead, but the
// sales order is itself proof the deal closed, so it counts for step 1.
//
// Nothing here carries money. The fee on an estimate is the project's
// budget, so it is left out and the banner stays safe to show everyone.
// ═══════════════════════════════════════════════════════════════

import { projectDb } from "./db";
import { formatDateLabel } from "./lifecycle-format";

export type LifecycleStatus = "completed" | "active" | "pending" | "skipped";

export interface LifecycleStage {
  status: LifecycleStatus;
  /** One short line under the step. */
  desc: string;
  /** Longer explanation, shown on hover. */
  detail?: string;
  /** Where to go to act on this step, when there is somewhere. */
  href?: string;
}

export interface PreDeliveryStages {
  lead: LifecycleStage;
  solutioning: LifecycleStage;
}

const LEAD_STATUS_LABEL: Record<string, string> = {
  new: "New lead",
  qualifying: "Qualifying",
  qualified: "Qualified",
  solutioning: "In solutioning",
  proposal: "Proposal out",
  proposal_sent: "Proposal sent",
  on_hold: "On hold",
  won: "Won",
  lost: "Lost",
};

function leadStatusLabel(status: unknown): string {
  const key = String(status ?? "").toLowerCase();
  return LEAD_STATUS_LABEL[key] ?? (key ? key.replace(/_/g, " ") : "Unknown");
}

function days(value: unknown): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n <= 0) return "";
  const rounded = Math.round(n * 10) / 10;
  return `${rounded} effort-day${rounded === 1 ? "" : "s"}`;
}

interface ProjectRef {
  id: string;
  leadId?: string | null;
  zohoSalesOrderRef?: string | null;
  zohoBooksRef?: string | null;
}

export async function getPreDeliveryStages(project: ProjectRef): Promise<PreDeliveryStages> {
  // ── No lead: either booked straight from a Zoho sales order, or nothing ──
  if (!project.leadId) {
    if (project.zohoSalesOrderRef) {
      const ref = project.zohoBooksRef || project.zohoSalesOrderRef;
      return {
        lead: {
          status: "completed",
          desc: `Zoho sales order · ${ref}`,
          detail:
            "Booked from a Zoho Books sales order, so the deal is already closed. There is no pipeline lead behind it.",
        },
        solutioning: {
          status: "skipped",
          desc: "Not estimated in Acceleron",
          detail:
            "This project came from a Zoho sales order rather than a converted lead, so no grade-rate estimate was built for it here.",
        },
      };
    }

    return {
      lead: {
        status: "pending",
        desc: "No lead or sales order linked",
        detail:
          "The project was created by hand. Converting a lead from the pipeline, or importing the Zoho sales order, records where the deal came from.",
        href: "/pmt/leads",
      },
      solutioning: {
        status: "pending",
        desc: "No estimate — no lead linked",
        detail: "Estimates hang off a lead. With no lead there is nothing to estimate against.",
      },
    };
  }

  // ── A lead: read it and its estimates ──
  const lead = (await projectDb("leads")
    .where("id", project.leadId)
    .select("id", "lead_number", "status", "zoho_crm_ref", "zoho_crm_stage", "company_name")
    .first()
    .catch(() => undefined)) as Record<string, unknown> | undefined;

  if (!lead) {
    return {
      lead: {
        status: "pending",
        desc: "Linked lead no longer exists",
        detail: "projects.lead_id points at a lead that could not be found.",
      },
      solutioning: { status: "pending", desc: "No estimate found" },
    };
  }

  const leadHref = `/pmt/leads/${lead.id}`;
  const status = String(lead.status ?? "").toLowerCase();
  const zoho = lead.zoho_crm_ref ? ` · Zoho ${lead.zoho_crm_ref}` : "";

  const leadStage: LifecycleStage =
    status === "won"
      ? {
          status: "completed",
          desc: `${lead.lead_number} · Won${zoho}`,
          detail: `Deal qualified and won in the pipeline${lead.zoho_crm_stage ? ` (Zoho stage: ${lead.zoho_crm_stage})` : ""}.`,
          href: leadHref,
        }
      : status === "lost"
        ? {
            status: "pending",
            desc: `${lead.lead_number} · Marked lost`,
            detail: "The lead behind this project is marked lost in the pipeline — worth checking.",
            href: leadHref,
          }
        : {
            status: "active",
            desc: `${lead.lead_number} · ${leadStatusLabel(status)}${zoho}`,
            detail: "The lead has not been marked won yet.",
            href: leadHref,
          };

  const sessions = (await projectDb("solutioning_sessions")
    .where("lead_id", lead.id as string)
    .select("id", "session_name", "status", "total_effort_days", "finalized_at", "created_at")
    .orderBy("created_at", "desc")
    .catch(() => [])) as Record<string, unknown>[];

  const finalized = sessions
    .filter((s) => String(s.status) === "finalized")
    .sort((a, b) => String(b.finalized_at ?? "").localeCompare(String(a.finalized_at ?? "")))[0];

  let solutioning: LifecycleStage;
  if (finalized) {
    const effort = days(finalized.total_effort_days);
    const when = formatDateLabel(finalized.finalized_at);
    solutioning = {
      status: "completed",
      desc: `Estimate finalized${effort ? ` · ${effort}` : ""}`,
      detail: `"${finalized.session_name}"${when ? `, finalized ${when}` : ""}.`,
      href: leadHref,
    };
  } else if (sessions.length > 0) {
    solutioning = {
      status: "active",
      desc: `${sessions.length} draft estimate${sessions.length === 1 ? "" : "s"} · not finalized`,
      detail: "An estimate exists but nobody has finalized it, so there is no agreed effort baseline.",
      href: leadHref,
    };
  } else {
    solutioning = {
      status: "pending",
      desc: "No effort estimate yet",
      detail: "No grade-rate estimate has been built for this lead.",
      href: leadHref,
    };
  }

  return { lead: leadStage, solutioning };
}
