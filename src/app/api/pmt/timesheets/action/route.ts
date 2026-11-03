import { NextRequest, NextResponse } from "next/server";
import { POST as handleTimesheetsPost } from "../route";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const ids = Array.isArray(body.timesheetIds)
      ? body.timesheetIds
      : Array.isArray(body.ids)
      ? body.ids
      : [];

    const action = String(body.action ?? "").trim();
    const rejectionReason = body.rejectionReason || body.remarks || undefined;

    const proxyReq = new Request(req.url, {
      method: "POST",
      headers: req.headers,
      body: JSON.stringify({
        ids,
        action,
        rejectionReason,
      }),
    });

    return handleTimesheetsPost(proxyReq);
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || "Failed to process timesheet action." }, { status: 500 });
  }
}

