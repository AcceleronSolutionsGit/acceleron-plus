// GET/POST/PUT/PATCH /api/pmt/leads/[id]/solutioning  — solutioning sessions

import { NextRequest, NextResponse } from "next/server";
import { projectDb } from "@/lib/db";
import { requireCapabilityGlobally } from "@/lib/auth";
import { mapSolutioningSessionRow } from "@/lib/row-mapper";
import { leadsWithHiddenFinancials } from "@/lib/lead-finance";

async function getEnrichedSession(sessionId: string, isPMOrAdmin: boolean) {
  const s = await projectDb("solutioning_sessions").where("id", sessionId).first();
  if (!s) return null;
  const [lineItems, additionalCosts] = await Promise.all([
    projectDb("solutioning_line_items").where("session_id", sessionId).orderBy("sequence"),
    projectDb("solutioning_additional_costs").where("session_id", sessionId).orderBy("sequence"),
  ]);
  return {
    ...mapSolutioningSessionRow(s),
    totalCostInr: isPMOrAdmin ? parseFloat(s.total_cost_inr) : 0,
    totalAdditionalCostInr: isPMOrAdmin ? parseFloat(s.total_additional_cost_inr) : 0,
    proposedFeeInr: isPMOrAdmin ? parseFloat(s.proposed_fee_inr) : 0,
    marginPercent: isPMOrAdmin ? parseFloat(s.margin_percent) : 0,
    overheadMarginPercent: isPMOrAdmin ? parseFloat(s.overhead_margin_percent) : 0,
    actualMarginPercent: isPMOrAdmin ? parseFloat(s.actual_margin_percent) : 0,
    lineItems: lineItems.map((r: any) => ({
      id: r.id, sessionId: r.session_id, phaseName: r.phase_name,
      taskDescription: r.task_description, rateBandId: r.rate_band_id,
      rateBandName: r.rate_band_name, quantityResources: r.quantity_resources,
      estimatedDays: parseFloat(r.estimated_days), dailyRateInr: isPMOrAdmin ? parseFloat(r.daily_rate_inr || 0) : 0,
      subtotalInr: isPMOrAdmin ? parseFloat(r.subtotal_inr || 0) : 0, sequence: r.sequence, allocatedUserId: r.allocated_user_id,
    })),
    additionalCosts: additionalCosts.map((r: any) => ({
      id: r.id, sessionId: r.session_id, description: r.description,
      category: r.category, amountInr: isPMOrAdmin ? parseFloat(r.amount_inr) : 0,
      costDate: r.cost_date ? String(r.cost_date).slice(0, 10) : null,
      sequence: r.sequence,
    })),
  };
}

async function calculateSessionTotals(
  lineItems: any[],
  additionalCosts: any[],
  overheadMarginPercent: number,
  actualMarginPercent: number
) {
  const bandIds = lineItems.filter((li: any) => li.rateBandId).map((li: any) => li.rateBandId);
  const bands = bandIds.length > 0
    ? await projectDb("employee_rate_bands").whereIn("id", bandIds)
    : [];
  const bandMap: Record<string, any> = {};
  for (const b of bands) bandMap[b.id] = b;

  let totalEffortDays = 0;
  let totalCostInr = 0;
  const processedLineItems = lineItems.map((li: any, idx: number) => {
    const band = bandMap[li.rateBandId] ?? null;
    const dailyRate = band ? parseFloat(band.daily_cost_inr) : (Number(li.dailyRateInr) || 0);
    const qty = Number(li.quantityResources) || 1;
    const days = Number(li.estimatedDays) || 0;
    const subtotal = days * qty * dailyRate;
    totalEffortDays += days * qty;
    totalCostInr += subtotal;
    return {
      ...li,
      dailyRateInr: dailyRate,
      subtotalInr: subtotal,
      rateBandName: band?.band_name ?? li.rateBandName ?? null,
      sequence: idx + 1,
    };
  });

  const totalAdditionalCostInr = additionalCosts.reduce((s: number, c: any) => s + (parseFloat(c.amountInr) || 0), 0);
  const totalBaseCost = totalCostInr + totalAdditionalCostInr;
  const overheadAmount = totalBaseCost * ((Number(overheadMarginPercent) || 0) / 100);
  const costWithOverhead = totalBaseCost + overheadAmount;
  const profitAmount = costWithOverhead * ((Number(actualMarginPercent) || 0) / 100);
  const proposedFeeInr = costWithOverhead + profitAmount;

  return {
    totalEffortDays,
    totalCostInr,
    totalAdditionalCostInr,
    proposedFeeInr,
    processedLineItems,
  };
}

async function updateExistingSession(leadId: string, sessionId: string, body: any, session: any) {
  const existing = await projectDb("solutioning_sessions")
    .where({ id: sessionId, lead_id: leadId })
    .first();
  if (!existing) {
    return NextResponse.json({ success: false, error: "Session not found." }, { status: 404 });
  }

  const {
    sessionName = existing.session_name,
    riskBufferPercent = existing.risk_buffer_percent,
    lineItems = [],
    additionalCosts = [],
    overheadMarginPercent = existing.overhead_margin_percent,
    actualMarginPercent = existing.actual_margin_percent,
  } = body;

  const {
    totalEffortDays,
    totalCostInr,
    totalAdditionalCostInr,
    proposedFeeInr,
    processedLineItems,
  } = await calculateSessionTotals(lineItems, additionalCosts, overheadMarginPercent, actualMarginPercent);

  await projectDb.transaction(async (trx) => {
    await trx("solutioning_sessions")
      .where("id", sessionId)
      .update({
        session_name: sessionName,
        risk_buffer_percent: Number(riskBufferPercent) || 0,
        total_effort_days: totalEffortDays,
        total_cost_inr: totalCostInr,
        total_additional_cost_inr: totalAdditionalCostInr,
        proposed_fee_inr: proposedFeeInr,
        overhead_margin_percent: Number(overheadMarginPercent) || 0,
        actual_margin_percent: Number(actualMarginPercent) || 0,
        updated_at: new Date(),
      });

    await trx("solutioning_line_items").where("session_id", sessionId).del();
    await trx("solutioning_additional_costs").where("session_id", sessionId).del();

    if (processedLineItems.length > 0) {
      await trx("solutioning_line_items").insert(
        processedLineItems.map((li: any) => ({
          session_id: sessionId,
          phase_name: li.phaseName || "Execution",
          task_description: li.taskDescription || "Role",
          rate_band_id: li.rateBandId ?? null,
          rate_band_name: li.rateBandName ?? null,
          quantity_resources: Number(li.quantityResources) || 1,
          estimated_days: Number(li.estimatedDays) || 0,
          daily_rate_inr: li.dailyRateInr,
          subtotal_inr: li.subtotalInr,
          sequence: li.sequence,
          allocated_user_id: li.allocatedUserId ?? null,
        }))
      );
    }

    if (additionalCosts.length > 0) {
      await trx("solutioning_additional_costs").insert(
        additionalCosts.map((c: any, idx: number) => ({
          session_id: sessionId,
          description: c.description || "Expense",
          category: c.category ?? "other",
          amount_inr: Number(c.amountInr) || 0,
          cost_date: c.costDate ? String(c.costDate).slice(0, 10) : null,
          sequence: idx + 1,
        }))
      );
    }

    if (existing.status === "finalized") {
      await trx("leads").where("id", leadId).update({
        opportunity_value_inr: proposedFeeInr,
        updated_at: new Date(),
      });
    }
  });

  const leadRow = await projectDb("leads").where("id", leadId).first();
  const isPMOrAdmin = session.role === "admin" || session.role === "sales" || session.userId === leadRow?.pm_owner_user_id;
  const enriched = await getEnrichedSession(sessionId, isPMOrAdmin);

  return NextResponse.json({ success: true, data: enriched });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: leadId } = await params;
  const auth = await requireCapabilityGlobally("financials.view");
  if (!auth.ok) return auth.response;
  if (!["admin", "sales"].includes(auth.session.role)) {
    return NextResponse.json({ success: false, error: "FORBIDDEN" }, { status: 403 });
  }

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

  const leadRow = await projectDb("leads").where("id", leadId).first();
  const isPMOrAdmin = auth.session.role === "admin" || auth.session.role === "sales" || auth.session.userId === leadRow?.pm_owner_user_id;

  const enriched = await Promise.all(sessions.map((s: any) => getEnrichedSession(s.id, isPMOrAdmin)));

  return NextResponse.json({ success: true, data: enriched.filter(Boolean) });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: leadId } = await params;
  const auth = await requireCapabilityGlobally("project.create");
  if (!auth.ok) return auth.response;
  const session = auth.session;
  if (!["admin", "sales"].includes(session.role)) {
    return NextResponse.json({ success: false, error: "FORBIDDEN" }, { status: 403 });
  }

  const body = await req.json();

  // If a sessionId is provided in POST, treat as an in-place edit/update
  if (body.sessionId) {
    return updateExistingSession(leadId, String(body.sessionId).trim(), body, session);
  }

  const { sessionName, riskBufferPercent = 15, lineItems = [], additionalCosts = [], overheadMarginPercent = 0, actualMarginPercent = 0 } = body;

  if (!sessionName) {
    return NextResponse.json({
      success: false,
      error: "VALIDATION_FAILED",
      details: [{ field: "sessionName", message: "Session name is required" }],
    }, { status: 400 });
  }

  const {
    totalEffortDays,
    totalCostInr,
    totalAdditionalCostInr,
    proposedFeeInr,
    processedLineItems,
  } = await calculateSessionTotals(lineItems, additionalCosts, overheadMarginPercent, actualMarginPercent);

  const [session_row] = await projectDb("solutioning_sessions").insert({
    lead_id: leadId,
    tenant_id: "acceleron",
    session_name: sessionName,
    status: "draft",
    risk_buffer_percent: Number(riskBufferPercent) || 0,
    total_effort_days: totalEffortDays,
    total_cost_inr: totalCostInr,
    total_additional_cost_inr: totalAdditionalCostInr,
    proposed_fee_inr: proposedFeeInr,
    margin_percent: 0,
    overhead_margin_percent: Number(overheadMarginPercent) || 0,
    actual_margin_percent: Number(actualMarginPercent) || 0,
    created_by_user_id: session.userId,
  }).returning("*");

  if (processedLineItems.length > 0) {
    await projectDb("solutioning_line_items").insert(
      processedLineItems.map((li: any) => ({
        session_id: session_row.id,
        phase_name: li.phaseName || "Execution",
        task_description: li.taskDescription || "Role",
        rate_band_id: li.rateBandId ?? null,
        rate_band_name: li.rateBandName ?? null,
        quantity_resources: Number(li.quantityResources) || 1,
        estimated_days: Number(li.estimatedDays) || 0,
        daily_rate_inr: li.dailyRateInr,
        subtotal_inr: li.subtotalInr,
        sequence: li.sequence,
        allocated_user_id: li.allocatedUserId ?? null,
      }))
    );
  }

  if (additionalCosts.length > 0) {
    await projectDb("solutioning_additional_costs").insert(
      additionalCosts.map((c: any, idx: number) => ({
        session_id: session_row.id,
        description: c.description || "Expense",
        category: c.category ?? "other",
        amount_inr: Number(c.amountInr) || 0,
        cost_date: c.costDate ? String(c.costDate).slice(0, 10) : null,
        sequence: idx + 1,
      }))
    );
  }

  // Update lead status to solutioning
  await projectDb("leads").where("id", leadId).update({ status: "solutioning" });

  const leadRow = await projectDb("leads").where("id", leadId).first();
  const isPMOrAdmin = session.role === "admin" || session.role === "sales" || session.userId === leadRow?.pm_owner_user_id;
  const enriched = await getEnrichedSession(session_row.id, isPMOrAdmin);

  return NextResponse.json({ success: true, data: enriched }, { status: 201 });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: leadId } = await params;
  const auth = await requireCapabilityGlobally("project.create");
  if (!auth.ok) return auth.response;
  const session = auth.session;
  if (!["admin", "sales"].includes(session.role)) {
    return NextResponse.json({ success: false, error: "FORBIDDEN" }, { status: 403 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Malformed JSON." }, { status: 400 });
  }

  const sessionId = String(body.sessionId ?? "").trim();
  if (!sessionId) {
    return NextResponse.json({ success: false, error: "Session ID is required." }, { status: 400 });
  }

  return updateExistingSession(leadId, sessionId, body, session);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: leadId } = await params;
  const auth = await requireCapabilityGlobally("project.create");
  if (!auth.ok) return auth.response;
  const session = auth.session;
  if (!["admin", "sales"].includes(session.role)) {
    return NextResponse.json({ success: false, error: "FORBIDDEN" }, { status: 403 });
  }

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Malformed JSON." }, { status: 400 });
  }

  const sessionId = String(body.sessionId ?? "").trim();
  if (!sessionId) {
    return NextResponse.json({ success: false, error: "Which session?" }, { status: 400 });
  }

  const action = String(body.action ?? "finalize");

  if (action === "update" || body.lineItems !== undefined || body.additionalCosts !== undefined) {
    return updateExistingSession(leadId, sessionId, body, session);
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

  // Only one estimate can be the live one, or the proposal value is ambiguous. Finalizing a second supersedes the first.
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
