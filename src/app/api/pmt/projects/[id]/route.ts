import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getProject } from "@/lib/api";
import { projectDb, itsmDb } from "@/lib/db";
import { requireProjectCapability, can } from "@/lib/auth";
import { redactProjectFinancials } from "@/lib/permissions";
import { setProjectManagers, ManagerInputError } from "@/lib/project-managers";
import type { Project } from "@/lib/types";
import { notifyAsync, events } from "@/lib/notifications";

/** Budget and margin are project finance: only the named PM and admins see them. */
function redactFinancials(project: Project, canSeeMoney: boolean): Project {
  return canSeeMoney ? project : redactProjectFinancials(project);
}

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const guard = await requireProjectCapability(id, "project.view");
    if (!guard.ok) return guard.response;

    const isAdmin = guard.session.role === "admin" || guard.session.additionalRoles?.includes("admin");
    if (!isAdmin && !guard.access.isProjectManager && !guard.access.isProjectOwner && !guard.access.projectRole) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

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

    const canChangePM = access.role === "admin" || access.isProjectManager;

    // Handle PM changes if managers array is passed
    if (body.managers !== undefined) {
      if (!canChangePM) {
        return NextResponse.json(
          {
            success: false,
            error: "Only an administrator or one of this project's PMs can change who manages it.",
          },
          { status: 403 }
        );
      }
      if (Array.isArray(body.managers)) {
        try {
          await setProjectManagers(projectId, body.managers);
        } catch (err: any) {
          if (err instanceof ManagerInputError) {
            return NextResponse.json({ success: false, error: err.message }, { status: 400 });
          }
          throw err;
        }
      }
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

    // Handle single requested PM if managers array was not explicitly passed
    const requestedPm =
      body.projectManagerUserId !== undefined ? body.projectManagerUserId : body.project_manager_user_id;

    if (body.managers === undefined && requestedPm !== undefined) {
      const isKey = typeof requestedPm === "string" && (requestedPm.startsWith("emp:") || requestedPm.startsWith("user:"));
      const isUuid = typeof requestedPm === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestedPm);

      if (isKey) {
        if (!canChangePM) {
          return NextResponse.json(
            {
              success: false,
              error: "Only an administrator or one of this project's PMs can change who manages it.",
            },
            { status: 403 }
          );
        }
        await setProjectManagers(projectId, [requestedPm]);
      } else if (isUuid) {
        if (requestedPm !== existing.project_manager_user_id && !canChangePM) {
          return NextResponse.json(
            {
              success: false,
              error: "Only an administrator or one of this project's PMs can change who manages it.",
            },
            { status: 403 }
          );
        }
        projectUpdate.project_manager_user_id = requestedPm;
      } else if (!requestedPm) {
        if (existing.project_manager_user_id && !canChangePM) {
          return NextResponse.json(
            {
              success: false,
              error: "Only an administrator or one of this project's PMs can change who manages it.",
            },
            { status: 403 }
          );
        }
        projectUpdate.project_manager_user_id = null;
      }
    }

    if (body.name !== undefined) projectUpdate.name = body.name;
    if (body.description !== undefined) projectUpdate.description = body.description;
    if (body.status !== undefined) projectUpdate.status = body.status;
    if (body.budgetInr !== undefined) projectUpdate.budget_inr = body.budgetInr;
    if (body.budget_inr !== undefined) projectUpdate.budget_inr = body.budget_inr;
    if (body.targetMarginPercent !== undefined) {
      projectUpdate.target_margin_percent = body.targetMarginPercent === null || body.targetMarginPercent === "" ? null : Number(body.targetMarginPercent);
    }
    if (body.target_margin_percent !== undefined) {
      projectUpdate.target_margin_percent = body.target_margin_percent === null || body.target_margin_percent === "" ? null : Number(body.target_margin_percent);
    }
    if (body.overheadPercent !== undefined) projectUpdate.overhead_percent = Number(body.overheadPercent) || 0;
    if (body.overhead_percent !== undefined) projectUpdate.overhead_percent = Number(body.overhead_percent) || 0;
    if (body.startDate !== undefined) projectUpdate.start_date = body.startDate;
    if (body.start_date !== undefined) projectUpdate.start_date = body.start_date;
    if (body.plannedEndDate !== undefined) projectUpdate.planned_end_date = body.plannedEndDate;
    if (body.planned_end_date !== undefined) projectUpdate.planned_end_date = body.planned_end_date;
    if (body.actualEndDate !== undefined) projectUpdate.actual_end_date = body.actualEndDate;
    if (body.actual_end_date !== undefined) projectUpdate.actual_end_date = body.actual_end_date;
    if (body.clientCompanyName !== undefined) projectUpdate.client_company_name = body.clientCompanyName;
    if (body.client_company_name !== undefined) projectUpdate.client_company_name = body.client_company_name;
    if (body.deliveryManagerUserId !== undefined) projectUpdate.delivery_manager_user_id = body.deliveryManagerUserId;
    if (body.delivery_manager_user_id !== undefined) projectUpdate.delivery_manager_user_id = body.delivery_manager_user_id;
    if (body.sponsorUserId !== undefined) projectUpdate.sponsor_user_id = body.sponsorUserId;
    if (body.sponsor_user_id !== undefined) projectUpdate.sponsor_user_id = body.sponsor_user_id;
    if (body.solutionApproach !== undefined) projectUpdate.solution_approach = body.solutionApproach;
    if (body.solution_approach !== undefined) projectUpdate.solution_approach = body.solution_approach;
    if (body.scopeBaseline !== undefined) projectUpdate.scope_baseline = body.scopeBaseline;
    if (body.scope_baseline !== undefined) projectUpdate.scope_baseline = body.scope_baseline;
    if (body.classification !== undefined) projectUpdate.classification = body.classification;
    if (body.category !== undefined) projectUpdate.category = body.category;
    if (body.projectType !== undefined) projectUpdate.project_type = body.projectType;
    if (body.project_type !== undefined) projectUpdate.project_type = body.project_type;
    if (body.zohoSalesOrderRef !== undefined) projectUpdate.zoho_sales_order_ref = body.zohoSalesOrderRef;
    if (body.zoho_sales_order_ref !== undefined) projectUpdate.zoho_sales_order_ref = body.zoho_sales_order_ref;
    if (body.poDetails !== undefined) projectUpdate.po_details = body.poDetails;
    if (body.po_details !== undefined) projectUpdate.po_details = body.po_details;

    if (Object.keys(projectUpdate).length > 1) {
      await projectDb("projects").where("id", projectId).update(projectUpdate);
    }

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

    try {
      revalidatePath(`/pmt/${projectId}`);
      revalidatePath(`/pmt/${projectCode}`);
      revalidatePath(`/pmt/${projectId}/edit`);
      revalidatePath(`/pmt/${projectCode}/edit`);
      revalidatePath("/pmt");
    } catch (e) {
      // Ignore revalidatePath in non-Next environments
    }

    return NextResponse.json({ project: updatedProject ? redactFinancials(updatedProject, canSeeMoney) : updatedProject, phaseSynced: Boolean(newPhase && newPhase !== previousPhase) }, { status: 200 });
  } catch (error) {
    console.error("Failed to update project:", error);
    return NextResponse.json({ error: "Failed to update project" }, { status: 500 });
  }
}
