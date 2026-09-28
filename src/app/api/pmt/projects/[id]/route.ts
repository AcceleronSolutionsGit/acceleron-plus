import { NextResponse } from "next/server";
import { getProject } from "@/lib/api";
import { projectDb, itsmDb } from "@/lib/db";
import { requireProjectCapability, can } from "@/lib/auth";
import { redactProjectFinancials } from "@/lib/permissions";
import type { Project } from "@/lib/types";

/** Budget and margin are project finance: only the named PM and admins see them. */
function redactFinancials(project: Project, canSeeMoney: boolean): Project {
  return canSeeMoney ? project : redactProjectFinancials(project);
}
import { notifyAsync, events } from "@/lib/notifications";

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const guard = await requireProjectCapability(id, "project.view");
    if (!guard.ok) return guard.response;

    const project = await getProject(id);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    return NextResponse.json(
      { project: redactFinancials(project, can(guard.access, "financials.view")) },
      { status: 200 }
    );
  } catch (error) {
    console.error("Failed to fetch project:", error);
    return NextResponse.json({ error: "Failed to fetch project" }, { status: 500 });
  }
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const guard = await requireProjectCapability(id, "project.edit");
    if (!guard.ok) return guard.response;
    const { session, access } = guard;

    const body = await req.json();

    // Changing the budget is a financial act — the same people who may
    // see it. Refused outright rather than silently dropped, so a form
    // never looks saved when it was not.
    const touchesBudget = body.budgetInr !== undefined || body.budget_inr !== undefined;
    if (touchesBudget && !can(access, "financials.view")) {
      return NextResponse.json(
        {
          success: false,
          error: "Only a PM of this project or an administrator can change its budget.",
          required: "financials.view",
        },
        { status: 403 }
      );
    }

    // 1. Locate the project first (by id or code)
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
    const existing = await projectDb("projects")
      .where(isUuid ? "id" : "code", id)
      .first();

    if (!existing) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const projectId = existing.id;
    const projectCode = existing.code;

    // Being the named PM is what unlocks a project's finances, so naming
    // one is reserved for an admin or the current PM handing over —
    // otherwise any editor could name themselves and read the money.
    const requestedPm =
      body.projectManagerUserId !== undefined ? body.projectManagerUserId : body.project_manager_user_id;
    if (
      requestedPm !== undefined &&
      (requestedPm || null) !== (existing.project_manager_user_id || null) &&
      access.role !== "admin" &&
      !access.isProjectManager
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Only an administrator or one of this project's PMs can change who manages it.",
        },
        { status: 403 }
      );
    }

    // The current phase lives in itsm_db.project_contexts, not on the
    // projects row — read it now so we can tell a real change from a no-op.
    const contextBefore = await itsmDb("project_contexts")
      .where("project_db_id", projectId)
      .orWhere("project_code", projectCode)
      .first()
      .catch(() => null);
    const previousPhase: string | null = contextBefore?.current_phase ?? null;

    // 2. Separate project_db fields
    const projectUpdate: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (body.name !== undefined) projectUpdate.name = body.name;
    if (body.description !== undefined) projectUpdate.description = body.description;
    if (body.status !== undefined) projectUpdate.status = body.status;
    if (body.budgetInr !== undefined) projectUpdate.budget_inr = body.budgetInr;
    if (body.budget_inr !== undefined) projectUpdate.budget_inr = body.budget_inr;
    if (body.startDate !== undefined) projectUpdate.start_date = body.startDate;
    if (body.start_date !== undefined) projectUpdate.start_date = body.start_date;
    if (body.plannedEndDate !== undefined) projectUpdate.planned_end_date = body.plannedEndDate;
    if (body.planned_end_date !== undefined) projectUpdate.planned_end_date = body.planned_end_date;
    if (body.actualEndDate !== undefined) projectUpdate.actual_end_date = body.actualEndDate;
    if (body.actual_end_date !== undefined) projectUpdate.actual_end_date = body.actual_end_date;
    if (body.clientCompanyName !== undefined) projectUpdate.client_company_name = body.clientCompanyName;
    if (body.client_company_name !== undefined) projectUpdate.client_company_name = body.client_company_name;
    if (body.projectManagerUserId !== undefined) projectUpdate.project_manager_user_id = body.projectManagerUserId;
    if (body.project_manager_user_id !== undefined) projectUpdate.project_manager_user_id = body.project_manager_user_id;
    if (body.sponsorUserId !== undefined) projectUpdate.sponsor_user_id = body.sponsorUserId;
    if (body.sponsor_user_id !== undefined) projectUpdate.sponsor_user_id = body.sponsor_user_id;

    await projectDb("projects").where("id", projectId).update(projectUpdate);

    // 3. Phase sync with ITSM project_contexts
    const newPhase = body.currentPhase ?? body.phase ?? body.current_phase;
    const ctxUpdate: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (newPhase) ctxUpdate.current_phase = newPhase;
    if (body.name) ctxUpdate.project_name = body.name;
    if (body.status) {
      ctxUpdate.status = body.status;
      ctxUpdate.is_active = body.status !== "closed" && body.status !== "cancelled";
    }
    if (body.clientCompanyName || body.client_company_name) {
      ctxUpdate.client_company_name = body.clientCompanyName || body.client_company_name;
    }

    if (Object.keys(ctxUpdate).length > 1) {
      const ctx = contextBefore;

      if (ctx) {
        await itsmDb("project_contexts").where("id", ctx.id).update(ctxUpdate);
      } else {
        // Create context if missing
        const [createdCtx] = await itsmDb("project_contexts")
          .insert({
            tenant_id: existing.tenant_id || "acceleron",
            project_db_id: projectId,
            project_code: projectCode,
            project_name: body.name || existing.name,
            client_company_name: body.clientCompanyName || existing.client_company_name,
            status: body.status || existing.status,
            current_phase: newPhase || "Discovery",
            is_active: true,
          })
          .returning("*");

        if (createdCtx) {
          await projectDb("projects").where("id", projectId).update({ itsm_context_id: createdCtx.id });
        }
      }
    }

    // ── 4. Notify on the changes worth hearing about ──────────────
    // `existing` still holds the pre-update row, so these compare
    // against the real previous values rather than the new ones.
    if (newPhase && newPhase !== previousPhase) {
      notifyAsync(
        events.phaseChanged(projectId, projectCode, previousPhase, newPhase, session.userId)
      );
    }

    if (body.status !== undefined && body.status !== existing.status) {
      notifyAsync(
        events.statusChanged(projectId, projectCode, String(body.status), session.userId)
      );
    }

    const updatedProject = await getProject(projectId);
    // The named PM may just have handed over, so decide from the saved
    // row — they still see it if they are PM on the team as well.
    const canSeeMoney =
      access.role === "admin" ||
      (access.role !== "client" &&
        (updatedProject?.projectManagerUserId === session.userId || access.projectRole === "manager"));
    return NextResponse.json({ project: updatedProject ? redactFinancials(updatedProject, canSeeMoney) : updatedProject, phaseSynced: Boolean(newPhase && newPhase !== previousPhase) }, { status: 200 });
  } catch (error) {
    console.error("Failed to update project:", error);
    return NextResponse.json({ error: "Failed to update project" }, { status: 500 });
  }
}
