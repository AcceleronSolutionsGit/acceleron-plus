// POST /api/pmt/leads/[id]/convert — turn a won lead into a project
//
// This is the join the pipeline was missing. A lead that closes should
// carry its finalized estimate across: the agreed fee becomes the
// budget, the phases in the estimate become the work breakdown, and
// the lead is stamped so the project can always be traced back to the
// deal it came from.

import { NextResponse } from "next/server";
import { projectDb, itsmDb, identityDb } from "@/lib/db";
import { requireCapabilityGlobally } from "@/lib/auth";
import { readJson, validationError, serverError } from "@/lib/route-helpers";
import { notifyAsync, events } from "@/lib/notifications";
import { toDateInput } from "@/lib/dates";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request, context: Params) {
  try {
    const auth = await requireCapabilityGlobally("project.create");
    if (!auth.ok) return auth.response;
    const session = auth.session;
    if (!["admin", "sales"].includes(session.role)) {
      return NextResponse.json({ success: false, error: "FORBIDDEN" }, { status: 403 });
    }

    const { id } = await context.params;
    const lead = await projectDb("leads")
      .where(UUID_RE.test(id) ? "id" : "lead_number", id)
      .first<Record<string, unknown> | undefined>();
    if (!lead) {
      return NextResponse.json({ success: false, error: "Lead not found" }, { status: 404 });
    }

    // Converting twice would give one deal two projects.
    const already = await projectDb("projects")
      .where("lead_id", lead.id as string)
      .select("id", "code", "name")
      .first()
      .catch(() => undefined);
    if (already) {
      return NextResponse.json(
        {
          success: false,
          error: `This lead is already ${already.code} — ${already.name}.`,
          project: already,
        },
        { status: 409 }
      );
    }

    const parsed = await readJson(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.body as Record<string, unknown>;

    const name = String(body.name ?? lead.company_name ?? "").trim();
    if (!name) return validationError(["The project needs a name."]);

    const startDate = toDateInput(body.startDate as string) || null;
    const plannedEndDate = toDateInput(body.plannedEndDate as string) || null;
    if (startDate && plannedEndDate && plannedEndDate < startDate) {
      return validationError(["The planned end cannot fall before the start."]);
    }

    // The finalized estimate is the commercial basis for the project.
    const estimate = await projectDb("solutioning_sessions")
      .where({ lead_id: lead.id as string, status: "finalized" })
      .orderBy("finalized_at", "desc")
      .first<Record<string, unknown> | undefined>()
      .catch(() => undefined);

    const budget =
      body.budgetInr !== undefined && body.budgetInr !== null && body.budgetInr !== ""
        ? Number(body.budgetInr)
        : Number(estimate?.proposed_fee_inr ?? lead.opportunity_value_inr ?? 0) || null;

    const scopeBaseline = body.scopeBaseline !== undefined ? body.scopeBaseline : (lead.scope_baseline ?? null);
    const solutionApproach = body.solutionApproach !== undefined ? body.solutionApproach : (lead.solution_approach ?? null);

    // Compute next project code safely
    const lastProject = await projectDb("projects")
      .whereRaw("code ~ '^PRJ-[0-9]+$'")
      .orderByRaw("CAST(SUBSTRING(code FROM 5) AS INTEGER) DESC")
      .first();
    const lastNum = lastProject?.code ? parseInt(String(lastProject.code).replace("PRJ-", ""), 10) || 0 : 0;
    const code = `PRJ-${String(lastNum + 1).padStart(4, "0")}`;

    const [project] = await projectDb("projects")
      .insert({
        tenant_id: lead.tenant_id ?? "acceleron",
        code,
        name,
        description: body.description ?? lead.description ?? null,
        status: "initiated",
        lead_id: lead.id,
        client_company_name: lead.company_name ?? null,
        project_manager_user_id: body.projectManagerUserId ?? lead.pm_owner_user_id ?? session.userId,
        sponsor_user_id: body.sponsorUserId ?? null,
        start_date: startDate,
        planned_end_date: plannedEndDate,
        budget_inr: budget,
        scope_baseline: scopeBaseline,
        solution_approach: solutionApproach,
      })
      .returning("*");

    // ── Carry over any documents uploaded to this lead to the newly created project ──
    try {
      await projectDb("project_documents")
        .where("lead_id", lead.id as string)
        .update({
          project_id: project.id,
          updated_at: new Date(),
        });
    } catch (docErr) {
      console.warn("[leads.convert] Document transfer failed (non-fatal):", docErr);
    }

    // ── The estimate's phases become the plan ──────────────────
    //
    // Several line items can share a phase; each phase becomes one
    // work package carrying the summed effort, which is a far better
    // starting point than an empty plan.
    let wbsCreated = 0;
    if (estimate && body.createPlanFromEstimate !== false) {
      const lineItems = (await projectDb("solutioning_line_items")
        .where("session_id", estimate.id as string)
        .orderBy("sequence")
        .catch(() => [])) as Record<string, unknown>[];

      const byPhase = new Map<string, { days: number; tasks: string[] }>();
      for (const item of lineItems) {
        const phase = String(item.phase_name ?? "Delivery").trim() || "Delivery";
        if (!byPhase.has(phase)) byPhase.set(phase, { days: 0, tasks: [] });
        const entry = byPhase.get(phase)!;
        entry.days +=
          Number(item.estimated_days ?? 0) * Number(item.quantity_resources ?? 1);
        if (item.task_description) entry.tasks.push(String(item.task_description));
      }

      const rows = [...byPhase.entries()].map(([phase, entry], index) => ({
        project_id: project.id,
        code: `WBS-${String(index + 1).padStart(3, "0")}`,
        name: phase,
        description: entry.tasks.join("\n") || null,
        type: "phase",
        sequence: index + 1,
        status: "not_started",
        progress_percent: 0,
        // Estimated in days; the plan holds hours.
        estimated_hours: Math.round(entry.days * 8 * 100) / 100,
      }));

      if (rows.length > 0) {
        await projectDb("wbs_items").insert(rows);
        wbsCreated = rows.length;
      }

      // Fetch rate bands to get billable rate
      const bandIds = lineItems.map((i: any) => i.rate_band_id).filter(Boolean) as string[];
      const rateBands = bandIds.length > 0 ? (await projectDb("employee_rate_bands").whereIn("id", bandIds).select("id", "daily_billable_rate_inr") as Record<string, unknown>[]) : [];
      const bandMap = new Map(rateBands.map((b) => [String(b.id), Number(b.daily_billable_rate_inr ?? 0)]));

      // Resolve user_id from employee_master using employee_id (allocated_user_id)
      const teamMembers = new Map<string, any>();
      const empIds = lineItems.map((i: any) => i.allocated_user_id).filter(Boolean) as string[];
      const employees = empIds.length > 0 ? (await identityDb("employee_master").whereIn("employee_id", empIds).select("employee_id", "user_id", "full_name") as Record<string, unknown>[]) : [];
      const empMap = new Map(employees.map((e) => [String(e.employee_id), e]));

      for (const item of lineItems) {
        if (item.allocated_user_id) {
          const empId = String(item.allocated_user_id);
          if (!teamMembers.has(empId)) {
            const emp = empMap.get(empId);
            const actualUserId = emp?.user_id ? String(emp.user_id) : empId; // fallback
            const plannedDays = Number(item.estimated_days ?? 0) * Number(item.quantity_resources ?? 1);
            const dailyCost = Number(item.daily_rate_inr ?? 0);
            const billableRate = item.rate_band_id ? (bandMap.get(String(item.rate_band_id)) ?? 0) : 0;

            teamMembers.set(empId, {
              project_id: project.id,
              user_id: actualUserId,
              employee_id: empId,
              user_name: emp?.full_name ? String(emp.full_name) : null,
              rate_band_id: item.rate_band_id ?? null,
              rate_band_name: item.rate_band_name ?? null,
              role_in_project: "Consultant",
              allocation_percent: 100,
              is_active: true,
              daily_cost_inr: dailyCost,
              daily_billable_rate_inr: billableRate,
              planned_days: plannedDays,
              planned_cost_inr: plannedDays * dailyCost,
              planned_billable_inr: plannedDays * billableRate,
            });
          } else {
            // Aggregate if same user is in multiple line items
            const existing = teamMembers.get(empId);
            const addedDays = Number(item.estimated_days ?? 0) * Number(item.quantity_resources ?? 1);
            existing.planned_days += addedDays;
            existing.planned_cost_inr += addedDays * Number(item.daily_rate_inr ?? 0);
            existing.planned_billable_inr += addedDays * (item.rate_band_id ? (bandMap.get(String(item.rate_band_id)) ?? 0) : 0);
          }
        }
      }
      if (teamMembers.size > 0) {
        await projectDb("project_team_members").insert(Array.from(teamMembers.values()));
      }
    }

    // ── The ITSM context, same as a project created by hand ────
    let itsmContextId: string | null = null;
    try {
      const [ctx] = await itsmDb("project_contexts")
        .insert({
          tenant_id: project.tenant_id,
          project_db_id: project.id,
          project_code: project.code,
          project_name: project.name,
          client_company_name: project.client_company_name ?? null,
          pm_user_id: project.project_manager_user_id ?? null,
          status: "active",
          current_phase: String(body.currentPhase ?? "Discovery"),
          is_active: true,
        })
        .returning("id");
      itsmContextId = ctx.id;
      await projectDb("projects").where("id", project.id).update({ itsm_context_id: itsmContextId });
    } catch (itsmErr) {
      console.warn("[leads.convert] ITSM context sync failed (non-fatal):", itsmErr);
    }

    await projectDb("leads").where("id", lead.id as string).update({
      status: "won",
      scope_baseline: scopeBaseline,
      solution_approach: solutionApproach,
      updated_at: new Date(),
    });

    notifyAsync(events.projectCreated(project.id, project.name, project.code, session.userId));

    return NextResponse.json(
      {
        success: true,
        project: { ...project, itsm_context_id: itsmContextId },
        wbsCreated,
        usedEstimate: estimate
          ? { id: estimate.id, sessionName: estimate.session_name, fee: estimate.proposed_fee_inr }
          : null,
        itsmSynced: itsmContextId !== null,
      },
      { status: 201 }
    );
  } catch (err) {
    return serverError("leads.convert.POST", err);
  }
}
