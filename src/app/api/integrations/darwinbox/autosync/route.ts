// POST /api/integrations/darwinbox/autosync — the scheduler's knock.
//
// scripts/darwinbox-autosync.js (a pm2 cron job, every 15 minutes) calls
// this with the shared scheduler token. It runs a sync only when auto-sync
// is on and one is due (see darwinbox-schedule.ts); otherwise it says why
// not and returns. Same token as the notification sweep — one secret for
// the scheduler, not one per job.

import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { runAutosyncIfDue } from "@/lib/darwinbox-autosync";
import { describeSetupError } from "@/lib/db";

export const runtime = "nodejs";

function tokenMatches(presented: string | null): boolean {
  const expected = process.env.NOTIFICATION_SWEEP_TOKEN;
  if (!expected || !presented) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(presented);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!tokenMatches(req.headers.get("x-sweep-token"))) {
    return NextResponse.json({ success: false, error: "Scheduler token missing or wrong." }, { status: 401 });
  }
  try {
    const outcome = await runAutosyncIfDue();
    if (!outcome.ran) {
      return NextResponse.json({ success: true, ran: false, reason: outcome.reason, nextRunAt: outcome.nextRunAt });
    }
    return NextResponse.json(
      { success: outcome.result.success, ran: true, message: outcome.result.message, run: outcome.run },
      { status: outcome.result.success ? 200 : 502 }
    );
  } catch (err) {
    const setup = describeSetupError(err);
    console.error("[darwinbox-autosync] tick failed:", err);
    return NextResponse.json(
      { success: false, error: setup ?? "Auto-sync check failed." },
      { status: setup ? 503 : 500 }
    );
  }
}
