// GET/POST/PATCH /api/pmt/leads/[id]/solutioning  — solutioning sessions

import { NextRequest, NextResponse } from "next/server";
import { projectDb } from "@/lib/db";
import { requireCapabilityGlobally } from "@/lib/auth";
import { mapSolutioningSessionRow } from "@/lib/row-mapper";
import { leadsWithHiddenFinancials } from "@/lib/lead-finance";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: leadId } = await params;
  // Solutioning carries day rates, so it is commercial data.
  const auth = await requireCapabilityGlobally("financials.view");
  if (!auth.ok) return auth.response;

  // A converted lead's estimate is that project's budget: its PM and
  // admins only, the same as the project's Financials tab.
  const hidden = await leadsWithHiddenFinancials([leadId], {
    role: auth.session.role,
    userId: auth.session.userId,
  });
  if (hidden.has(leadId)) {
    return NextResponse.json(
      {
        success: false,
        error: "This lead became a project. Its estimate is visible only to that project's manager and administrators.",
        required: "financials.view",
      },
      { status: 403 }
    );
  }

  const sessions = await projectDb("solutioning_sessions")
    .where("lead_id", leadId)
    .orderBy("created_at", "desc");

  const enriched = await Promise.all(sessions.map(async (s: any) => {
    const [lineItems, additionalCosts] = await Promise.all([
      projectDb("solutioning_line_items").where("session_id", s.id).orderBy("sequence"),
      projectDb("solutioning_additional_costs").where("session_id", s.id).orderBy("sequence"),
    ]);
    return {
      ...mapSolutioningSessionRow(s),
      lineItems: lineItems.map((r: any) => ({
        id: r.id, sessionId: r.session_id, phaseName: r.phase_name,
        taskDescription: r.task_description, rateBandId: r.rate_band_id,
        rateBandName: r.rate_band_name, quantityResources: r.quantity_resources,
        estimatedDays: parseFloat(r.estimated_days), dailyRateInr: parseFloat(r.daily_rate_inr || 0),
        subtotalInr: parseFloat(r.subtotal_inr || 0), sequence: r.sequence,
      })),
      additionalCosts: additionalCosts.map((r: any) => ({
        id: r.id, sessionId: r.session_id, description: r.description,
        category: r.category, amountInr: parseFloat(r.amount_inr), sequence: r.sequence,
      })),
    };
  }));

  return NextResponse.json({ success: true, data: enriched });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: leadId } = await params;
  const auth = await requireCapabilityGlobally("project.create");
  if (!auth.ok) return auth.response;
  const session = auth.session;

  const body = await req.json();
  const { sessionName, riskBufferPercent = 15, lineItems = [], additionalCosts = [] } = body;

  if (!sessionName) {
    return NextResponse.json({ success: false, error: "VALIDATION_FAILED",
      details: [{ field: "sessionName", message: "Session name is required" }] }, { status: 400 });
  }

  // Fetch rate band daily rates for the line items
  const bandIds = lineItems.filter((li: any) => li.rateBandId).map((li: any) => li.rateBandId);
  const bands = bandIds.length > 0
    ? await projectDb("employee_rate_bands").whereIn("id", bandIds)
    : [];
  const bandMap: Record<string, any> = {};
  for (const b of bands) bandMap[b.id] = b;

  // Compute totals
  let totalEffortDays = 0;
  let totalCostInr = 0;
  const processedLineItems = lineItems.map((li: any, idx: number) => {
    const band = bandMap[li.rateBandId] ?? null;
    const dailyRate = band ? parseFloat(band.daily_cost_inr) : (li.dailyRateInr ?? 0);
    const subtotal = li.estimatedDays * (li.quantityResources ?? 1) * dailyRate;
    totalEffortDays += li.estimatedDays * (li.quantityResources ?? 1);
    totalCostInr += subtotal;
    return { ...li, dailyRateInr: dailyRate, subtotalInr: subtotal,
             rateBandName: band?.band_name ?? li.rateBandName, sequence: idx + 1 };
  });

  const totalAdditionalCostInr = additionalCosts.reduce((s: number, c: any) => s + (parseFloat(c.amountInr) || 0), 0);
  const costWithRisk = totalCostInr * (1 + riskBufferPercent / 100);
  const proposedFeeInr = costWithRisk + totalAdditionalCostInr;
  const marginPercent = proposedFeeInr > 0 ? ((proposedFeeInr - (totalCostInr + totalAdditionalCostInr)) / proposedFeeInr) * 100 : 0;

  const [session_row] = await projectDb("solutioning_sessions").insert({
    lead_id: leadId, tenant_id: "acceleron", session_name: sessionName,
    status: "draft", risk_buffer_percent: riskBufferPercent,
    total_effort_days: totalEffortDays, total_cost_inr: totalCostInr,
    total_additional_cost_inr: totalAdditionalCostInr,
    proposed_fee_inr: proposedFeeInr, margin_percent: marginPercent,
    created_by_user_id: session.userId,
  }).returning("*");

  if (processedLineItems.length > 0) {
    await projectDb("solutioning_line_items").insert(processedLineItems.map((li: any) => ({
      session_id: session_row.id, phase_name: li.phaseName, task_description: li.taskDescription,
      rate_band_id: li.rateBandId ?? null, rate_band_name: li.rateBandName ?? null,
      quantity_resources: li.quantityResources ?? 1, estimated_days: li.estimatedDays,
      daily_rate_inr: li.dailyRateInr, subtotal_inr: li.subtotalInr, sequence: li.sequence,
    })));
  }

  if (additionalCosts.length > 0) {
    await projectDb("solutioning_additional_costs").insert(additionalCosts.map((c: any, idx: number) => ({
      session_id: session_row.id, description: c.description, category: c.category ?? "other",
      amount_inr: c.amountInr, sequence: idx + 1,
    })));
  }

  // Update lead status to solutioning
  await projectDb("leads").where("id", leadId).update({ status: "solutioning" });

  return NextResponse.json({ success: true, data: mapSolutioningSessionRow(session_row) }, { status: 201 });
}

// ─── PATCH — finalize an estimate, or reopen it ────────────────────
//
// A draft is somebody's working estimate; a finalized one is the number
// the proposal goes out with. Marking it so stamps who and when, and
// carries the proposed fee onto the lead, which is what the pipeline
// board and any forecast read.

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: leadId } = await params;
  const auth = await requireCapabilityGlobally("project.create");
  if (!auth.ok) return auth.response;
  const session = auth.session;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Malformed JSON." }, { status: 400 });
  }

  const sessionId = String(body.sessionId ?? "").trim();
  if (!sessionId) {
    return NextResponse.json({ success: false, error: "Which session?" }, { status: 400 });
  }

  const existing = await projectDb("solutioning_sessions")
    .where({ id: sessionId, lead_id: leadId })
    .first();
  if (!existing) {
    return NextResponse.json(
      { success: false, error: "That estimate does not belong to this lead." },
      { status: 404 }
    );
  }

  const action = String(body.action ?? "finalize");

  if (action === "reopen") {
    const [reopened] = await projectDb("solutioning_sessions")
      .where("id", sessionId)
      .update({
        status: "draft",
        finalized_by_user_id: null,
        finalized_at: null,
        updated_at: new Date(),
      })
      .returning("*");
    return NextResponse.json({ success: true, data: mapSolutioningSessionRow(reopened) });
  }

  if (existing.status === "finalized") {
    return NextResponse.json(
      { success: false, error: "That estimate is already finalized." },
      { status: 409 }
    );
  }

  // Only one estimate can be the live one, or the proposal value is
  // ambiguous. Finalizing a second supersedes the first.
  await projectDb("solutioning_sessions")
    .where({ lead_id: leadId, status: "finalized" })
    .whereNot("id", sessionId)
    .update({ status: "superseded", updated_at: new Date() });

  const [finalized] = await projectDb("solutioning_sessions")
    .where("id", sessionId)
    .update({
      status: "finalized",
      finalized_by_user_id: session.userId,
      finalized_at: new Date(),
      updated_at: new Date(),
    })
    .returning("*");

  // The fee agreed here becomes the opportunity value on the board, and
  // the lead moves to "proposal" unless it has already been won or lost.
  const leadUpdate: Record<string, unknown> = {
    opportunity_value_inr: finalized.proposed_fee_inr,
    updated_at: new Date(),
  };
  const lead = await projectDb("leads").where("id", leadId).first();
  if (lead && !["won", "lost"].includes(String(lead.status))) {
    leadUpdate.status = "proposal";
  }
  await projectDb("leads").where("id", leadId).update(leadUpdate);

  return NextResponse.json({
    success: true,
    data: mapSolutioningSessionRow(finalized),
    leadStatus: leadUpdate.status ?? lead?.status ?? null,
  });
}
