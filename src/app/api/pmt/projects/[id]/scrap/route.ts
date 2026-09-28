import { NextResponse } from "next/server";
import { getSession, requireProjectCapability } from "@/lib/auth";
import { resolveProjectOr404, serverError } from "@/lib/route-helpers";
import { projectDb } from "@/lib/db";
import {
  footprintOf,
  purgeBlockers,
  reasonProblem,
  scrapProject,
  restoreProject,
  requestScrap,
  withdrawScrapRequest,
  purgeProject,
  scrapStateOf,
  describeFootprint,
} from "@/lib/scrap";

export const runtime = "nodejs";

/**
 * Scrapping a project.
 *
 *   GET    — what is attached, and whether it can be purged
 *   POST   — scrap it (admin) or record a request (PM)
 *   DELETE — restore it, withdraw a request, or purge it
 *
 * Only an admin may actually scrap, restore or purge. A PM on the
 * project records a request instead: removing a project other people
 * are billing against should not be something one person can do quietly.
 */

async function adminOr403() {
  const session = await getSession();
  if (!session) {
    return { ok: false as const, response: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  }
  if (session.role !== "admin") {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Only an administrator can scrap, restore or delete a project." },
        { status: 403 }
      ),
    };
  }
  return { ok: true as const, session };
}

// ─── What would happen ─────────────────────────────────────────────

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;

    // Seeing what is attached is part of running the project.
    const guard = await requireProjectCapability(id, "project.view");
    if (!guard.ok) return guard.response;

    const resolved = await resolveProjectOr404(id);
    if (!resolved.ok) return resolved.response;

    const row = await projectDb("projects").where("id", resolved.project.id).first();
    const footprint = await footprintOf(resolved.project.id);
    const blockers = purgeBlockers(footprint);

    const session = await getSession();

    return NextResponse.json({
      success: true,
      state: scrapStateOf(row ?? {}),
      footprint,
      summary: describeFootprint(footprint),
      canPurge: blockers.length === 0,
      purgeBlockers: blockers,
      // What this particular caller is allowed to do, so the UI does not
      // have to reimplement the rule and get it subtly different.
      youCan: {
        scrap: session?.role === "admin",
        request: session?.role === "pm",
        restore: session?.role === "admin",
        purge: session?.role === "admin" && blockers.length === 0,
      },
    });
  } catch (err) {
    return serverError("pmt.scrap.get", err);
  }
}

// ─── Scrap it, or ask for it to be scrapped ────────────────────────

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;

    const guard = await requireProjectCapability(id, "project.edit");
    if (!guard.ok) return guard.response;
    const { session } = guard;

    const resolved = await resolveProjectOr404(id);
    if (!resolved.ok) return resolved.response;
    const projectId = resolved.project.id;

    const body = await req.json().catch(() => ({}));
    const reason = body?.reason;

    // The reason is the feature. A project that vanished with "asdf"
    // written against it is no more accountable than one that vanished
    // silently, so this is checked before anything else.
    const problem = reasonProblem(reason);
    if (problem) {
      return NextResponse.json({ error: problem }, { status: 400 });
    }

    const row = await projectDb("projects").where("id", projectId).first();
    const state = scrapStateOf(row ?? {});
    if (state.scrapped) {
      return NextResponse.json(
        { error: "This project has already been scrapped." },
        { status: 409 }
      );
    }

    const actor = { userId: session.userId, name: session.fullName };

    if (session.role === "admin") {
      await scrapProject(projectId, reason, actor);
      const footprint = await footprintOf(projectId);
      return NextResponse.json({
        success: true,
        outcome: "scrapped",
        message: `${resolved.project.code} has been scrapped. ${describeFootprint(
          footprint
        )} — all of it kept, and an administrator can restore it.`,
      });
    }

    if (session.role === "pm") {
      await requestScrap(projectId, reason, actor);
      return NextResponse.json({
        success: true,
        outcome: "requested",
        message: `Recorded. An administrator will see the request against ${resolved.project.code}, with your reason.`,
      });
    }

    return NextResponse.json(
      { error: "You do not have permission to scrap a project." },
      { status: 403 }
    );
  } catch (err) {
    return serverError("pmt.scrap.post", err);
  }
}

// ─── Restore, withdraw, or purge ───────────────────────────────────

export async function DELETE(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action") ?? "restore";

    const resolved = await resolveProjectOr404(id);
    if (!resolved.ok) return resolved.response;
    const projectId = resolved.project.id;

    // Withdrawing your own request is not an admin action — the PM who
    // asked is allowed to change their mind.
    if (action === "withdraw") {
      const guard = await requireProjectCapability(id, "project.edit");
      if (!guard.ok) return guard.response;
      await withdrawScrapRequest(projectId);
      return NextResponse.json({
        success: true,
        outcome: "withdrawn",
        message: `The request against ${resolved.project.code} has been withdrawn.`,
      });
    }

    const admin = await adminOr403();
    if (!admin.ok) return admin.response;

    if (action === "restore") {
      await restoreProject(projectId);
      return NextResponse.json({
        success: true,
        outcome: "restored",
        message: `${resolved.project.code} is back in the project list, exactly as it was.`,
      });
    }

    if (action === "purge") {
      const footprint = await footprintOf(projectId);
      const blockers = purgeBlockers(footprint);
      if (blockers.length > 0) {
        return NextResponse.json(
          {
            error: `${resolved.project.code} cannot be deleted permanently — it holds records somebody else relies on.`,
            blockers,
          },
          { status: 409 }
        );
      }

      // Purging is only ever offered on something already scrapped, so
      // deleting for good is always a second, separate decision.
      const row = await projectDb("projects").where("id", projectId).first();
      if (!scrapStateOf(row ?? {}).scrapped) {
        return NextResponse.json(
          { error: "Scrap the project first. Deleting for good is a separate decision." },
          { status: 409 }
        );
      }

      await purgeProject(projectId);
      return NextResponse.json({
        success: true,
        outcome: "purged",
        message: `${resolved.project.code} has been deleted permanently.`,
      });
    }

    return NextResponse.json(
      { error: `Unknown action "${action}". Choose restore, withdraw or purge.` },
      { status: 400 }
    );
  } catch (err) {
    return serverError("pmt.scrap.delete", err);
  }
}
