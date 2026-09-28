import { NextResponse } from "next/server";
import { projectDb } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { mapSnakeToCamel } from "@/lib/row-mapper";
import { serverError, readJson } from "@/lib/route-helpers";

export const runtime = "nodejs";

/**
 * The signed-in user's notifications.
 *
 * GET /api/notifications?unread=1&limit=20
 */
export async function GET(req: Request) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(req.url);
    const unreadOnly = searchParams.get("unread") === "1";
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? 20)));

    let query = projectDb("project_notifications")
      .where("recipient_user_id", auth.session.userId)
      .orderBy("created_at", "desc")
      .limit(limit);

    if (unreadOnly) query = query.where("is_read", false);

    const [rows, unread] = await Promise.all([
      query,
      projectDb("project_notifications")
        .where({ recipient_user_id: auth.session.userId, is_read: false })
        .count("* as n")
        .first<{ n: string }>(),
    ]);

    return NextResponse.json({
      success: true,
      unreadCount: Number(unread?.n ?? 0),
      notifications: rows.map(mapSnakeToCamel),
    });
  } catch (err) {
    return serverError("notifications.GET", err);
  }
}

/**
 * Mark notifications read.
 *
 * PATCH { ids: string[] }  → those rows
 * PATCH { all: true }      → everything unread for this user
 *
 * Scoped to the caller's own rows, so one user can't clear another's.
 */
export async function PATCH(req: Request) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const parsed = await readJson(req);
    if (!parsed.ok) return parsed.response;

    const body = parsed.body as { ids?: unknown; all?: unknown };
    const now = new Date();

    let query = projectDb("project_notifications")
      .where("recipient_user_id", auth.session.userId)
      .andWhere("is_read", false);

    if (body.all !== true) {
      const ids = Array.isArray(body.ids) ? body.ids.filter((v): v is string => typeof v === "string") : [];
      if (ids.length === 0) {
        return NextResponse.json(
          { success: false, error: "Provide ids, or set all to true." },
          { status: 400 }
        );
      }
      query = query.whereIn("id", ids);
    }

    const updated = await query.update({ is_read: true, read_at: now, updated_at: now });

    const unread = await projectDb("project_notifications")
      .where({ recipient_user_id: auth.session.userId, is_read: false })
      .count("* as n")
      .first<{ n: string }>();

    return NextResponse.json({
      success: true,
      updated,
      unreadCount: Number(unread?.n ?? 0),
    });
  } catch (err) {
    return serverError("notifications.PATCH", err);
  }
}
