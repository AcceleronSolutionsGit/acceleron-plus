// GET  /api/pmt/my-timesheet?week=YYYY-MM-DD — my week, across projects
// POST /api/pmt/my-timesheet                 — log or amend an entry
//
// Logging time is a daily chore, and making somebody open each project
// in turn to do it is how timesheets end up filled in on a Friday from
// memory. This is one week, every project they are allocated to, in one
// place — and it only ever touches the caller's own entries.

import { NextResponse } from "next/server";
import { projectDb } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { readJson, validationError, serverError } from "@/lib/route-helpers";
import { toISODate, toDateInput, parseISODate } from "@/lib/dates";
import { tasksForUser } from "@/lib/assignments";

export const runtime = "nodejs";

/** Monday of the week containing `date`. */
function weekStart(date: Date): Date {
  const day = date.getDay(); // 0 Sun … 6 Sat
  const offset = day === 0 ? -6 : 1 - day;
  const monday = new Date(date);
  monday.setDate(monday.getDate() + offset);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

const ACTIVITY_TYPES = [
  "development",
  "analysis",
  "testing",
  "meeting",
  "documentation",
  "support",
  "travel",
  "other",
] as const;

export async function GET(req: Request) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;
    const userId = auth.session.userId;

    const url = new URL(req.url);
    const anchor = parseISODate(url.searchParams.get("week")) ?? new Date();
    const monday = weekStart(anchor);
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(d.getDate() + i);
      return toISODate(d);
    });

    // Only the projects they are actually allocated to. A timesheet
    // that lets you book time to anything is a reconciliation problem
    // waiting to happen.
    const memberships = (await projectDb("project_team_members as m")
      .join("projects as p", "p.id", "m.project_id")
      .where({ "m.user_id": userId, "m.is_active": true })
      .whereNot("p.status", "cancelled")
      .select(
        "p.id",
        "p.code",
        "p.name",
        "m.role_in_project",
        "m.allocation_percent",
        "m.start_date",
        "m.end_date"
      )
      .orderBy("p.code")
      .catch(() => [])) as Record<string, unknown>[];

    const [entries, tasks] = await Promise.all([
      projectDb("project_timesheets")
        .where("user_id", userId)
        .whereBetween("log_date", [days[0], days[6]])
        .select("*")
        .catch(() => []),
      tasksForUser(userId).catch(() => []),
    ]);

    const rows = (entries as Record<string, unknown>[]).map((e) => ({
      id: String(e.id),
      projectId: String(e.project_id),
      wbsItemId: e.wbs_item_id ? String(e.wbs_item_id) : null,
      logDate: toDateInput(e.log_date as string),
      hours: Number(e.hours_logged ?? 0),
      activityType: e.activity_type ? String(e.activity_type) : "development",
      status: e.status ? String(e.status) : "draft",
      notes: e.notes ? String(e.notes) : null,
    }));

    const byDay: Record<string, number> = {};
    for (const day of days) byDay[day] = 0;
    for (const row of rows) if (row.logDate in byDay) byDay[row.logDate] += row.hours;

    return NextResponse.json({
      success: true,
      weekStart: days[0],
      days,
      projects: memberships.map((m) => ({
        id: String(m.id),
        code: String(m.code),
        name: String(m.name),
        roleInProject: m.role_in_project ? String(m.role_in_project) : null,
        allocationPercent: Number(m.allocation_percent ?? 100),
        // Their own work packages on this project, so time lands on
        // something specific rather than on the project as a whole.
        tasks: tasks
          .filter((t) => t.projectCode === String(m.code))
          .map((t) => ({ id: t.wbsItemId, code: t.wbsCode, name: t.wbsName })),
      })),
      entries: rows,
      totals: {
        byDay,
        week: Math.round(Object.values(byDay).reduce((a, b) => a + b, 0) * 100) / 100,
      },
      activityTypes: ACTIVITY_TYPES,
      /** Entries already approved are locked; the screen greys them out. */
      lockedStatuses: ["approved"],
    });
  } catch (err) {
    return serverError("myTimesheet.GET", err);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;
    const userId = auth.session.userId;

    const parsed = await readJson(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.body as Record<string, unknown>;

    const projectId = String(body.projectId ?? "").trim();
    const logDate = toDateInput(body.logDate as string);
    const hours = Number(body.hours ?? 0);

    const errors: string[] = [];
    if (!projectId) errors.push("Which project?");
    if (!logDate) errors.push("Which day?");
    if (!Number.isFinite(hours) || hours < 0 || hours > 24) {
      errors.push("Hours must be between 0 and 24.");
    }
    if (logDate && logDate > toISODate(new Date())) {
      errors.push("You cannot log time against a future date.");
    }
    if (errors.length > 0) return validationError(errors);

    // They must be on the project. This is the check that makes the
    // endpoint safe: without it, anybody could book time anywhere.
    const membership = await projectDb("project_team_members")
      .where({ project_id: projectId, user_id: userId, is_active: true })
      .first();
    if (!membership) {
      return NextResponse.json(
        {
          success: false,
          error: "You are not allocated to that project, so you cannot book time to it.",
        },
        { status: 403 }
      );
    }

    const wbsItemId = String(body.wbsItemId ?? "").trim() || null;
    if (wbsItemId) {
      const belongs = await projectDb("wbs_items")
        .where({ id: wbsItemId, project_id: projectId })
        .first();
      if (!belongs) {
        return validationError(["That work package is not on that project."]);
      }
    }

    const existing = await projectDb("project_timesheets")
      .where({ user_id: userId, project_id: projectId, log_date: logDate })
      .andWhere((qb) => {
        if (wbsItemId) qb.where("wbs_item_id", wbsItemId);
        else qb.whereNull("wbs_item_id");
      })
      .first<Record<string, unknown> | undefined>();

    // An approved entry is a financial record; amending it silently
    // would change a number somebody has already signed off.
    if (existing && String(existing.status) === "approved") {
      return NextResponse.json(
        {
          success: false,
          error:
            "That entry has been approved. Ask your project manager to reopen it before changing the hours.",
        },
        { status: 409 }
      );
    }

    // Zero hours means "I did not work on this" — remove the row rather
    // than leaving a 0 to reconcile later.
    if (hours === 0) {
      if (existing) await projectDb("project_timesheets").where("id", String(existing.id)).del();
      return NextResponse.json({ success: true, deleted: Boolean(existing) });
    }

    const values = {
      project_id: projectId,
      user_id: userId,
      user_name: auth.session.fullName ?? null,
      wbs_item_id: wbsItemId,
      log_date: logDate,
      hours_logged: hours,
      activity_type: String(body.activityType ?? "development"),
      notes: String(body.notes ?? "").trim() || null,
      status: String(body.submit === true ? "submitted" : existing?.status ?? "draft"),
      updated_at: new Date(),
    };

    if (existing) {
      const [updated] = await projectDb("project_timesheets")
        .where("id", String(existing.id))
        .update(values)
        .returning("*");
      return NextResponse.json({ success: true, entry: updated });
    }

    const [created] = await projectDb("project_timesheets")
      .insert({ ...values, created_at: new Date() })
      .returning("*");
    return NextResponse.json({ success: true, entry: created }, { status: 201 });
  } catch (err) {
    return serverError("myTimesheet.POST", err);
  }
}
