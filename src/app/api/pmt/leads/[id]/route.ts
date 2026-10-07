// GET    /api/pmt/leads/[id]  — one lead, with its solutioning summary
// PATCH  /api/pmt/leads/[id]  — edit it, or move it along the pipeline
// DELETE /api/pmt/leads/[id]  — only while nothing hangs off it

import { NextResponse } from "next/server";
import { projectDb } from "@/lib/db";
import { requireSession, requireCapabilityGlobally } from "@/lib/auth";
import { mapLeadRow } from "@/lib/row-mapper";
import { leadsWithHiddenFinancials, withoutLeadFinancials } from "@/lib/lead-finance";
import { readJson, validationError, serverError } from "@/lib/route-helpers";
import { toDateInput } from "@/lib/dates";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export const LEAD_STATUSES = [
  "new",
  "qualified",
  "solutioning",
  "proposal",
  "won",
  "lost",
] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function findLead(idOrNumber: string) {
  return projectDb("leads")
    .where(UUID_RE.test(idOrNumber) ? "id" : "lead_number", idOrNumber)
    .first<Record<string, unknown> | undefined>();
}

export async function GET(_req: Request, context: Params) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const { id } = await context.params;
    const lead = await findLead(id);
    if (!lead) {
      return NextResponse.json({ success: false, error: "Lead not found" }, { status: 404 });
    }

    const project = await projectDb("projects")
      .where("lead_id", lead.id as string)
      .select("id", "code", "name")
      .first()
      .catch(() => undefined);

    const hidden = await leadsWithHiddenFinancials([lead.id as string], {
      role: auth.session.role,
      userId: auth.session.userId,
    });
    const data = hidden.has(lead.id as string) ? withoutLeadFinancials(mapLeadRow(lead)) : mapLeadRow(lead);
    return NextResponse.json({ success: true, data, project: project ?? null });
  } catch (err) {
    return serverError("leads.item.GET", err);
  }
}

export async function PATCH(req: Request, context: Params) {
  try {
    const auth = await requireCapabilityGlobally("project.create");
    if (!auth.ok) return auth.response;

    const { id } = await context.params;
    const lead = await findLead(id);
    if (!lead) {
      return NextResponse.json({ success: false, error: "Lead not found" }, { status: 404 });
    }

    const parsed = await readJson(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.body as Record<string, unknown>;

    const updates: Record<string, unknown> = { updated_at: new Date() };
    const errors: string[] = [];

    const text = (key: string, column: string, max = 255) => {
      if (body[key] === undefined) return;
      const value = String(body[key] ?? "").trim();
      if (value.length > max) errors.push(`${key} is too long.`);
      updates[column] = value || null;
    };

    text("companyName", "company_name");
    text("contactName", "contact_name");
    text("contactEmail", "contact_email");
    text("contactPhone", "contact_phone");
    text("description", "description", 5000);
    text("scopeBaseline", "scope_baseline", 20000);
    text("solutionApproach", "solution_approach", 20000);
    text("notes", "notes", 5000);
    text("zohoCrmRef", "zoho_crm_ref");
    text("zohoCrmStage", "zoho_crm_stage");
    text("source", "source");

    if (body.companyName !== undefined && !String(body.companyName).trim()) {
      errors.push("A lead needs a company name.");
    }

    if (body.status !== undefined) {
      const status = String(body.status);
      if (!LEAD_STATUSES.includes(status as (typeof LEAD_STATUSES)[number])) {
        errors.push(`Status must be one of: ${LEAD_STATUSES.join(", ")}.`);
      } else {
        updates.status = status;
      }
    }

    if (body.opportunityValueInr !== undefined) {
      if (body.opportunityValueInr === null || body.opportunityValueInr === "") {
        updates.opportunity_value_inr = null;
      } else {
        const value = Number(body.opportunityValueInr);
        if (!Number.isFinite(value) || value < 0) {
          errors.push("The opportunity value must be a positive number.");
        } else {
          updates.opportunity_value_inr = value;
        }
      }
    }

    if (body.expectedCloseDate !== undefined) {
      updates.expected_close_date = toDateInput(body.expectedCloseDate as string) || null;
    }

    if (errors.length > 0) return validationError(errors);
    if (Object.keys(updates).length === 1) {
      return validationError(["No editable fields were supplied."]);
    }

    const [updated] = await projectDb("leads")
      .where("id", lead.id as string)
      .update(updates)
      .returning("*");

    return NextResponse.json({ success: true, data: mapLeadRow(updated) });
  } catch (err) {
    return serverError("leads.item.PATCH", err);
  }
}

export async function DELETE(_req: Request, context: Params) {
  try {
    const auth = await requireCapabilityGlobally("project.delete");
    if (!auth.ok) return auth.response;

    const { id } = await context.params;
    const lead = await findLead(id);
    if (!lead) {
      return NextResponse.json({ success: false, error: "Lead not found" }, { status: 404 });
    }

    // A lead that became a project is part of that project's history.
    const project = await projectDb("projects")
      .where("lead_id", lead.id as string)
      .first()
      .catch(() => undefined);
    if (project) {
      return NextResponse.json(
        {
          success: false,
          error: `This lead became ${project.code}. Close the project instead of deleting the lead it came from.`,
        },
        { status: 409 }
      );
    }

    const sessions = await projectDb("solutioning_sessions")
      .where("lead_id", lead.id as string)
      .count("* as n")
      .first<{ n: string }>()
      .catch(() => ({ n: "0" }));
    if (Number(sessions?.n ?? 0) > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `This lead has ${sessions!.n} solutioning session(s) against it. Mark it lost rather than deleting the estimate history.`,
        },
        { status: 409 }
      );
    }

    await projectDb("leads").where("id", lead.id as string).del();
    return NextResponse.json({ success: true, deletedId: lead.id });
  } catch (err) {
    return serverError("leads.item.DELETE", err);
  }
}
