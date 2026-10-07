// GET /api/pmt/leads        — list all leads
// POST /api/pmt/leads       — create a new lead

import { NextRequest, NextResponse } from "next/server";
import { projectDb } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { mapLeadRow } from "@/lib/row-mapper";
import { leadsWithHiddenFinancials, withoutLeadFinancials } from "@/lib/lead-finance";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "UNAUTHORIZED" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const q      = searchParams.get("q");

  let query = projectDb("leads").orderBy("created_at", "desc");
  if (status) query = query.where("status", status);
  if (q)      query = query.where(function () {
    this.where("company_name", "ilike", `%${q}%`)
        .orWhere("contact_name", "ilike", `%${q}%`)
        .orWhere("lead_number", "ilike", `%${q}%`);
  });

  const rows = await query;
  const hidden = await leadsWithHiddenFinancials(
    rows.map((r: { id: string }) => r.id),
    { role: session.role, userId: session.userId }
  );
  const data = rows.map((r: { id: string }) =>
    hidden.has(r.id) ? withoutLeadFinancials(mapLeadRow(r)) : mapLeadRow(r)
  );
  return NextResponse.json({ success: true, data });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "UNAUTHORIZED" }, { status: 401 });
  if (!["pm", "admin"].includes(session.role)) {
    return NextResponse.json({ success: false, error: "FORBIDDEN" }, { status: 403 });
  }

  const body = await req.json();
  const { companyName, contactName, contactEmail, contactPhone, description,
          opportunityValueInr, zohoCrmRef, zohoCrmStage, source = "manual",
          expectedCloseDate, pmOwnerUserId, notes, scopeBaseline, solutionApproach } = body;

  if (!companyName) {
    return NextResponse.json({ success: false, error: "VALIDATION_FAILED",
      details: [{ field: "companyName", message: "Company name is required" }] }, { status: 400 });
  }

  // Sequential lead number
  const last = await projectDb("leads")
    .where("lead_number", "like", "ACC-LEAD-%")
    .orderBy("lead_number", "desc")
    .first("lead_number") as any;
  const lastNum = last?.lead_number ? parseInt((last.lead_number as string).replace("ACC-LEAD-", "")) || 0 : 0;
  const leadNumber = `ACC-LEAD-${String(lastNum + 1).padStart(4, "0")}`;

  const [row] = await projectDb("leads").insert({
    tenant_id:             "acceleron",
    lead_number:           leadNumber,
    company_name:          companyName,
    contact_name:          contactName ?? null,
    contact_email:         contactEmail ?? null,
    contact_phone:         contactPhone ?? null,
    description:           description ?? null,
    scope_baseline:        scopeBaseline ?? null,
    solution_approach:     solutionApproach ?? null,
    opportunity_value_inr: opportunityValueInr ?? null,
    zoho_crm_ref:          zohoCrmRef ?? null,
    zoho_crm_stage:        zohoCrmStage ?? null,
    source,
    status:                "new",
    pm_owner_user_id:      pmOwnerUserId ?? session.userId,
    expected_close_date:   expectedCloseDate ?? null,
    notes:                 notes ?? null,
  }).returning("*");

  return NextResponse.json({ success: true, data: mapLeadRow(row) }, { status: 201 });
}
