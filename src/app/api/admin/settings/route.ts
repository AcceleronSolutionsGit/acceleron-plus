import { NextResponse } from "next/server";
import { identityDb } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { serverError } from "@/lib/route-helpers";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await getSession();
    if (session?.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const settings = await identityDb("app_settings").where({ id: "global" }).first();
    return NextResponse.json({ success: true, settings });
  } catch (err) {
    return serverError("settings.GET", err);
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await getSession();
    if (session?.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date(),
    };
    if (body.currency) updates.currency = body.currency;
    if (body.date_format) updates.date_format = body.date_format;
    if (body.timezone) updates.timezone = body.timezone;

    const [updated] = await identityDb("app_settings")
      .where({ id: "global" })
      .update(updates)
      .returning("*");

    return NextResponse.json({ success: true, settings: updated }, { status: 200 });
  } catch (err) {
    return serverError("settings.PATCH", err);
  }
}
