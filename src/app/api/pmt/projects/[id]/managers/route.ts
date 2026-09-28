import { NextResponse } from "next/server";
import { requireProjectCapability } from "@/lib/auth";
import { canAssignProjectManagers } from "@/lib/permissions";
import { readJson, validationError, serverError, pmAssignmentRefused } from "@/lib/route-helpers";
import { setProjectManagers, ManagerInputError } from "@/lib/project-managers";
import { getProjectManagers } from "@/lib/api";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** The project's PMs, lead first. */
export async function GET(_req: Request, context: Params) {
  try {
    const { id } = await context.params;
    const guard = await requireProjectCapability(id, "project.view");
    if (!guard.ok) return guard.response;
    return NextResponse.json({ success: true, managers: await getProjectManagers(guard.project.id) });
  } catch (err) {
    return serverError("managers.GET", err);
  }
}

/**
 * Replace the PM list. Body: `{ managers: ["emp:E123", "user:…"] }`,
 * ordered — the first is the lead PM. Being PM unlocks the project's
 * money, so only an admin or one of its current PMs may do this.
 */
export async function PUT(req: Request, context: Params) {
  try {
    const { id } = await context.params;
    const guard = await requireProjectCapability(id, "project.view");
    if (!guard.ok) return guard.response;
    if (!canAssignProjectManagers(guard.access)) return pmAssignmentRefused();

    const parsed = await readJson(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.body as { managers?: unknown };

    try {
      await setProjectManagers(guard.project.id, body.managers);
    } catch (err) {
      if (err instanceof ManagerInputError) return validationError([err.message]);
      throw err;
    }

    return NextResponse.json({ success: true, managers: await getProjectManagers(guard.project.id) });
  } catch (err) {
    return serverError("managers.PUT", err);
  }
}
