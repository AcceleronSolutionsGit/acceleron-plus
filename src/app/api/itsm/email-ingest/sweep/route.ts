/**
 * POST /api/itsm/email-ingest/sweep
 *
 * Polls the configured IMAP mailbox and converts unseen emails into ITSM tickets.
 * Protected by the same x-sweep-token as the notification sweep.
 *
 * Call from a scheduler (Windows Task Scheduler / cron / pm2):
 *
 *   curl -X POST http://localhost:3000/api/itsm/email-ingest/sweep \
 *        -H "x-sweep-token: <NOTIFICATION_SWEEP_TOKEN>"
 *
 * Response: JSON summary of tickets created / appended / errors.
 */

import { NextResponse } from "next/server";
import { runEmailPoller } from "@/lib/email-poller";

export const runtime = "nodejs";
// Increase timeout for slow mailboxes
export const maxDuration = 60;

function tokenMatches(presented: string | null): boolean {
  const expected = process.env.NOTIFICATION_SWEEP_TOKEN;
  if (!expected) return false;
  if (!presented) return false;
  // Constant-time compare
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(presented);
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    return diff === 0;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const token = req.headers.get("x-sweep-token");
  if (!tokenMatches(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = new Date().toISOString();

  try {
    const result = await runEmailPoller();

    return NextResponse.json({
      ok: true,
      startedAt,
      finishedAt: new Date().toISOString(),
      summary: {
        processed: result.processed,
        created: result.created,
        appended: result.appended,
        skipped: result.skipped,
        errors: result.errors,
      },
      details: result.details,
    });
  } catch (err: any) {
    console.error("Email ingest sweep failed:", err);
    return NextResponse.json(
      {
        ok: false,
        error: err.message || "Email sweep failed",
        startedAt,
        finishedAt: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/itsm/email-ingest/sweep
 * Returns IMAP configuration status (without revealing credentials).
 */
export async function GET(req: Request) {
  const token = req.headers.get("x-sweep-token");
  if (!tokenMatches(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const configured =
    !!process.env.IMAP_HOST &&
    !!process.env.IMAP_USER &&
    !!process.env.IMAP_PASS;

  return NextResponse.json({
    configured,
    host: process.env.IMAP_HOST || null,
    user: process.env.IMAP_USER || null,
    port: process.env.IMAP_PORT || "993",
    mailbox: process.env.IMAP_MAILBOX || "INBOX",
    markRead: process.env.IMAP_MARK_READ !== "false",
    maxPerRun: parseInt(process.env.IMAP_MAX_PER_RUN || "25", 10),
  });
}