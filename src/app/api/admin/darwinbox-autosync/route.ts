// GET   /api/admin/darwinbox-autosync — schedule, next run, recent runs
// PATCH /api/admin/darwinbox-autosync — { enabled?, frequency?, dailyHour? }
//
// Admin only (the proxy also keeps /api/admin/* to admins).

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { getAutosyncOverview, updateAutosyncSettings } from "@/lib/darwinbox-autosync";
import { isFrequency, type AutosyncFrequency } from "@/lib/darwinbox-schedule";
import { readJson, validationError } from "@/lib/route-helpers";
import { describeSetupError } from "@/lib/db";

export const runtime = "nodejs";

function failure(err: unknown, context: string) {
  const setup = describeSetupError(err);
  console.error(`[darwinbox-autosync] ${context}:`, err);
  return NextResponse.json(
    { success: false, error: setup ?? "Could not load the auto-sync settings." },
    { status: setup ? 503 : 500 }
  );
}

export async function GET() {
  const auth = await requireRole(["admin"]);
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json({ success: true, ...(await getAutosyncOverview()) });
  } catch (err) {
    return failure(err, "GET");
  }
}

export async function PATCH(req: Request) {
  const auth = await requireRole(["admin"]);
  if (!auth.ok) return auth.response;

  const parsed = await readJson(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body as Record<string, unknown>;

  const errors: string[] = [];
  const input: { enabled?: boolean; frequency?: AutosyncFrequency; dailyHour?: number } = {};

  if (body.enabled !== undefined) {
    if (typeof body.enabled !== "boolean") errors.push("enabled must be true or false.");
    else input.enabled = body.enabled;
  }
  if (body.frequency !== undefined) {
    if (!isFrequency(body.frequency)) errors.push("How often must be every hour, every 6 hours, every 12 hours or once a day.");
    else input.frequency = body.frequency;
  }
  if (body.dailyHour !== undefined) {
    const hour = Number(body.dailyHour);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) errors.push("The time must be a whole hour between 0 and 23.");
    else input.dailyHour = hour;
  }
  if (errors.length > 0) return validationError(errors);

  try {
    await updateAutosyncSettings(input, auth.session.userId);
    return NextResponse.json({ success: true, ...(await getAutosyncOverview()) });
  } catch (err) {
    return failure(err, "PATCH");
  }
}
