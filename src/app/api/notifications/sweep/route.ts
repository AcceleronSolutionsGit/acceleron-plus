import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { sweepOverdueMilestones } from "@/lib/notifications";
import { serverError } from "@/lib/route-helpers";

export const runtime = "nodejs";

/**
 * Raise an alert for every milestone that has slipped past its due date.
 *
 * Time-based events have no request to hang off, so something has to ask.
 * Call this from a scheduled task (Windows Task Scheduler, cron, or a
 * platform scheduler) once a morning:
 *
 *   curl -X POST http://localhost:3000/api/notifications/sweep \
 *        -H "x-sweep-token: $NOTIFICATION_SWEEP_TOKEN"
 *
 * Authorised either by a signed-in admin/PM session, or by the shared
 * token so a scheduler can run it without a browser login.
 */
export async function POST(req: Request) {
  try {
    const token = process.env.NOTIFICATION_SWEEP_TOKEN;
    const presented = req.headers.get("x-sweep-token");
    const tokenOk = Boolean(token && presented && token === presented);

    if (!tokenOk) {
      const auth = await requireRole(["admin", "pm"]);
      if (!auth.ok) return auth.response;
    }

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId") ?? undefined;

    const alerted = await sweepOverdueMilestones(projectId);

    return NextResponse.json({
      success: true,
      alerted,
      message:
        alerted === 0
          ? "No newly overdue milestones."
          : `Raised ${alerted} overdue milestone alert${alerted === 1 ? "" : "s"}.`,
    });
  } catch (err) {
    return serverError("notifications.sweep", err);
  }
}
