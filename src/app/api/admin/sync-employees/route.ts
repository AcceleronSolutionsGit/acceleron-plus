// POST /api/admin/sync-employees — "Sync with Darwinbox" on Master Data.
//
// Recorded and single-flight through runTrackedSync(): a click while the
// automatic sync is running is told so instead of starting a second
// import on top of it. (There used to be a GET here "for testing" — a
// state-changing GET can be fired by any link or prefetch, so it is gone.)

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { runTrackedSync } from "@/lib/darwinbox-autosync";
import { describeSetupError } from "@/lib/db";

export const runtime = "nodejs";

export async function POST() {
  const auth = await requireRole(["admin"]);
  if (!auth.ok) return auth.response;

  try {
    const outcome = await runTrackedSync("manual", auth.session.userId);
    if (outcome.busy) {
      return NextResponse.json(
        {
          success: false,
          busy: true,
          message: "A Darwinbox sync is already running. It usually takes a minute or two — try again shortly.",
          runningSince: outcome.runningSince,
        },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { ...outcome.result, run: outcome.run },
      { status: outcome.result.success ? 200 : 502 }
    );
  } catch (error) {
    const setup = describeSetupError(error);
    console.error("API error during Darwinbox sync:", error);
    return NextResponse.json(
      { success: false, error: setup ?? "Internal Server Error", message: setup ?? "The sync could not be started." },
      { status: setup ? 503 : 500 }
    );
  }
}
