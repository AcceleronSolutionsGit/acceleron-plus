// GET   .../margin  — target, planned, actual and the variance
// PATCH .../margin  — set the target, or price the team to it
//
// Margin is commercial data, so it sits behind financials.view, and
// changing it behind invoice.manage — the same capability that governs
// anything else with money attached.

import { NextResponse } from "next/server";
import { projectDb } from "@/lib/db";
import { requireProjectCapability } from "@/lib/auth";
import { readJson, validationError, serverError } from "@/lib/route-helpers";
import { marginFor, repriceToTarget, rateForMargin } from "@/lib/margin";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, context: Params) {
  try {
    const { id } = await context.params;
    const guard = await requireProjectCapability(id, "financials.view");
    if (!guard.ok) return guard.response;

    return NextResponse.json({
      success: true,
      margin: await marginFor(guard.project.id),
    });
  } catch (err) {
    return serverError("margin.GET", err);
  }
}

export async function PATCH(req: Request, context: Params) {
  try {
    const { id } = await context.params;
    const guard = await requireProjectCapability(id, "invoice.manage");
    if (!guard.ok) return guard.response;
    const { project, session } = guard;

    const parsed = await readJson(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.body as Record<string, unknown>;

    const action = String(body.action ?? "set");

    // ── Price the team to the target ─────────────────────────
    //
    // Deliberately a separate action rather than a side effect of
    // setting the number. Recording what you are aiming for and
    // rewriting everybody's rates are different decisions, and doing
    // the second silently when somebody meant the first would be a
    // nasty surprise on a live project.
    if (action === "reprice") {
      const current = await projectDb("projects")
        .where("id", project.id)
        .select("target_margin_percent")
        .first<{ target_margin_percent: string | null } | undefined>();

      const target =
        body.targetMarginPercent !== undefined
          ? Number(body.targetMarginPercent)
          : current?.target_margin_percent === null || current?.target_margin_percent === undefined
            ? null
            : Number(current.target_margin_percent);

      if (target === null) {
        return validationError(["Set a target margin before pricing to it."]);
      }
      const check = rateForMargin(1000, target);
      if (check === null) {
        return validationError(["A margin of 100% or more cannot be reached at any price."]);
      }

      const result = await repriceToTarget(project.id, target);

      return NextResponse.json({
        success: true,
        repriced: result,
        margin: await marginFor(project.id),
        message:
          result.updated === 0
            ? "Nobody was repriced — no one on the team has a daily cost on file."
            : `Repriced ${result.updated} ${result.updated === 1 ? "person" : "people"} to ${target}%.` +
              (result.skipped.length > 0
                ? ` ${result.skipped.length} skipped: ${result.skipped
                    .map((s) => `${s.userName ?? "someone"} (${s.reason})`)
                    .join(", ")}.`
                : ""),
      });
    }

    // ── Set the target ───────────────────────────────────────
    const updates: Record<string, unknown> = { updated_at: new Date() };

    if (body.targetMarginPercent === null || body.targetMarginPercent === "") {
      updates.target_margin_percent = null;
      updates.margin_set_by_user_id = null;
      updates.margin_set_at = null;
    } else if (body.targetMarginPercent !== undefined) {
      const target = Number(body.targetMarginPercent);
      if (!Number.isFinite(target) || target <= -100 || target >= 100) {
        return validationError([
          "A target margin must be between -100 and 100 percent. 100% is unreachable at any price.",
        ]);
      }
      updates.target_margin_percent = target;
      updates.margin_set_by_user_id = session.userId;
      updates.margin_set_at = new Date();
    }

    if (body.notes !== undefined) updates.margin_notes = String(body.notes).trim() || null;

    if (Object.keys(updates).length === 1) {
      return validationError(["Send a target margin or a note."]);
    }

    await projectDb("projects").where("id", project.id).update(updates);

    return NextResponse.json({ success: true, margin: await marginFor(project.id) });
  } catch (err) {
    return serverError("margin.PATCH", err);
  }
}
