import { NextResponse } from "next/server";
import { getProjects } from "@/lib/api";
import { projectDb, itsmDb } from "@/lib/db";
import { requireSession, requireCapabilityGlobally, projectsManagedBy } from "@/lib/auth";
import { notifyAsync, events } from "@/lib/notifications";
import { canSeeProjectFinancials, redactProjectFinancials } from "@/lib/permissions";
import { setProjectManagers, ManagerInputError } from "@/lib/project-managers";

export async function GET() {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const projects = await getProjects();
    // Budgets only on the projects this person manages (all of them for
    // an admin). The key is removed rather than blanked.
    const viewer = { role: auth.session.role, userId: auth.session.userId };
    const managed = await projectsManagedBy(auth.session.userId);
    const visible = projects.map((project) =>
      canSeeProjectFinancials(viewer, project, managed) ? project : redactProjectFinancials(project)
    );
    return NextResponse.json({ projects: visible }, { status: 200 });
  } catch (error) {
    console.error("Failed to fetch projects:", error);
    return NextResponse.json({ error: "Failed to fetch projects" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireCapabilityGlobally("project.create");
    if (!auth.ok) return auth.response;

    const body = await req.json();

    if (!body?.name || typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json({ error: "Project name is required" }, { status: 400 });
    }

    // Generate sequential project code
    // The highest PRJ number, not the newest row — imported projects are
    // not created in code order, and "newest + 1" can land on a code that
    // already exists.
    const lastProject = await projectDb("projects")
      .whereRaw("code ~ '^PRJ-[0-9]+$'")
      .orderByRaw("cast(substring(code from 5) as integer) desc")
      .first("code");
    const lastNum = lastProject?.code ? parseInt(lastProject.code.replace("PRJ-", "")) || 0 : 0;
    const projectCode = `PRJ-${String(lastNum + 1).padStart(4, "0")}`;

    // ── 1. Create project in project_db ────────────────────────────
    const [newProject] = await projectDb("projects")
      .insert({
        tenant_id:   body.tenantId ?? "acceleron",
        name:        body.name,
        description: body.description ?? null,
        code:        projectCode,
        status:      "initiated",
        lead_id:     body.leadId ?? null,
        client_company_name: body.clientCompanyName ?? null,
        project_manager_user_id: body.projectManagerUserId ?? null,
        sponsor_user_id: body.sponsorUserId ?? null,
        start_date:  body.startDate ?? null,
        planned_end_date: body.plannedEndDate ?? null,
        budget_inr:  body.budgetInr ?? null,
      })
      .returning("*");

    // ── 2. Auto-create ITSM project context (bidirectional sync) ───
    let itsmContextId: string | null = null;
    try {
      const [ctx] = await itsmDb("project_contexts").insert({
        tenant_id:           newProject.tenant_id,
        project_db_id:       newProject.id,
        project_code:        newProject.code,
        project_name:        newProject.name,
        client_company_name: newProject.client_company_name ?? null,
        pm_user_id:          newProject.project_manager_user_id ?? null,
        status:              "active",
        current_phase:       body.currentPhase ?? body.phase ?? "Discovery",
        is_active:           true,
      }).returning("id");
      itsmContextId = ctx.id;

      // ── 3. Write itsm_context_id back to project ────────────────
      await projectDb("projects")
        .where("id", newProject.id)
        .update({ itsm_context_id: itsmContextId });

      newProject.itsm_context_id = itsmContextId;
    } catch (itsmErr) {
      // Non-fatal: project is created, ITSM sync can be retried
      console.warn("ITSM project context sync failed (non-fatal):", itsmErr);
    }

    // PMs picked in the New Project dialog — the first is the lead. The
    // project exists either way; a bad pick is reported, not fatal.
    let managersError: string | null = null;
    if (Array.isArray(body.managers) && body.managers.length > 0) {
      try {
        await setProjectManagers(newProject.id, body.managers);
        const refreshed = await projectDb("projects").where("id", newProject.id).first("project_manager_user_id");
        newProject.project_manager_user_id = refreshed?.project_manager_user_id ?? null;
      } catch (err) {
        if (!(err instanceof ManagerInputError)) throw err;
        managersError = err.message;
      }
    }

    // Tell the PM and sponsor the project (and its ITSM context) now exists.
    notifyAsync(
      events.projectCreated(newProject.id, newProject.name, newProject.code, auth.session.userId)
    );

    return NextResponse.json({
      project: newProject,
      itsmContextId,
      itsmSynced: itsmContextId !== null,
      managersError,
    }, { status: 201 });
  } catch (error) {
    console.error("Failed to create project:", error);
    return NextResponse.json({ error: "Failed to create project" }, { status: 500 });
  }
}
