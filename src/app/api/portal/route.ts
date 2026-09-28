// GET /api/portal — everything a client contact is allowed to see
//
// A client is outside the company. The safe way to build this is not to
// take the internal project payload and hide fields on the way out —
// that is one forgotten field away from leaking a cost — but to build
// a separate, smaller shape that only ever contains what a client may
// see. Nothing here selects a cost column at all.

import { NextResponse } from "next/server";
import { projectDb, itsmDb, identityDb } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { serverError } from "@/lib/route-helpers";
import { toDateInput } from "@/lib/dates";

export const runtime = "nodejs";

/**
 * Which projects belong to this client contact.
 *
 * Two ways in, because a client contact may be recorded either as a
 * team member on the project or simply as working for the client
 * company. Both are matched; neither is assumed.
 */
async function projectsForClient(session: { userId: string; email: string }) {
  const user = await identityDb("users")
    .where("id", session.userId)
    .select("email", "full_name")
    .first<{ email: string; full_name: string } | undefined>();

  const email = String(user?.email ?? session.email ?? "").toLowerCase();
  const domain = email.includes("@") ? email.split("@")[1] : "";

  const memberOf = await projectDb("project_team_members")
    .where({ user_id: session.userId, is_active: true })
    .pluck("project_id")
    .catch(() => [] as string[]);

  const rows = await projectDb("projects")
    // A scrapped project is not the client's to see either.
    .whereNull("scrapped_at")
    .where(function () {
      if (memberOf.length > 0) this.whereIn("id", memberOf);
      // A client's own company name is the other way in. Matched on the
      // domain's first label — "gainwellindia.com" → "gainwell" — which
      // is loose enough to be useful and scoped to their own domain.
      if (domain) {
        const label = domain.split(".")[0];
        if (label.length >= 4) {
          this.orWhere("client_company_name", "ilike", `%${label}%`);
        }
      }
    })
    .whereNot("status", "cancelled")
    .select(
      "id",
      "code",
      "name",
      "description",
      "status",
      "start_date",
      "planned_end_date",
      "client_company_name"
    )
    .orderBy("created_at", "desc")
    .catch(() => [] as Record<string, unknown>[]);

  return { rows: rows as Record<string, unknown>[], contactName: user?.full_name ?? null };
}

export async function GET() {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const { rows, contactName } = await projectsForClient(auth.session);
    const ids = rows.map((r) => String(r.id));

    if (ids.length === 0) {
      return NextResponse.json({
        success: true,
        contactName,
        projects: [],
        message:
          "No projects are shared with you yet. Your project manager can add you to one as a client contact.",
      });
    }

    // Plan progress, milestones, shared documents and their tickets —
    // and nothing else. No rates, no team costs, no internal notes.
    const [wbs, milestones, documents, tickets, contexts] = await Promise.all([
      projectDb("wbs_items")
        .whereIn("project_id", ids)
        .select("project_id", "code", "name", "status", "progress_percent", "start_date", "end_date")
        .orderBy("sequence")
        .catch(() => []),
      projectDb("milestones")
        .whereIn("project_id", ids)
        .select("project_id", "name", "due_date", "status")
        .orderBy("due_date")
        .catch(() => []),
      projectDb("project_documents")
        .whereIn("project_id", ids)
        .andWhere("access_level", "client_visible")
        .andWhere("is_active", true)
        .select("id", "project_id", "title", "document_type", "file_name", "created_at")
        .orderBy("created_at", "desc")
        .catch(() => []),
      itsmDb("tickets")
        .whereIn(
          "project_code",
          rows.map((r) => String(r.code))
        )
        .select("ticket_number", "subject", "status", "priority", "project_code", "created_at")
        .orderBy("created_at", "desc")
        .limit(100)
        .catch(() => []),
      itsmDb("project_contexts")
        .whereIn("project_db_id", ids)
        .select("project_db_id", "current_phase")
        .catch(() => []),
    ]);

    const by = <T extends Record<string, unknown>>(list: T[], key: string) => {
      const map = new Map<string, T[]>();
      for (const row of list) {
        const k = String(row[key]);
        if (!map.has(k)) map.set(k, []);
        map.get(k)!.push(row);
      }
      return map;
    };

    const wbsBy = by(wbs as Record<string, unknown>[], "project_id");
    const msBy = by(milestones as Record<string, unknown>[], "project_id");
    const docsBy = by(documents as Record<string, unknown>[], "project_id");
    const ticketsBy = by(tickets as Record<string, unknown>[], "project_code");
    const phaseBy = new Map(
      (contexts as Record<string, unknown>[]).map((c) => [
        String(c.project_db_id),
        String(c.current_phase ?? ""),
      ])
    );

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const projects = rows.map((project) => {
      const id = String(project.id);
      const packages = wbsBy.get(id) ?? [];
      const ms = msBy.get(id) ?? [];

      // Progress weighted the same way the internal plan weights it, so
      // a client and a PM never read two different percentages.
      const scheduled = packages.filter((p) => p.start_date && p.end_date);
      const totalDays = scheduled.reduce((sum, p) => {
        const s = new Date(String(p.start_date));
        const e = new Date(String(p.end_date));
        return sum + Math.max(1, Math.round((e.getTime() - s.getTime()) / 86400000) + 1);
      }, 0);
      const progress =
        totalDays > 0
          ? Math.round(
              scheduled.reduce((sum, p) => {
                const s = new Date(String(p.start_date));
                const e = new Date(String(p.end_date));
                const days = Math.max(1, Math.round((e.getTime() - s.getTime()) / 86400000) + 1);
                return sum + Number(p.progress_percent ?? 0) * days;
              }, 0) / totalDays
            )
          : packages.length > 0
            ? Math.round(
                packages.reduce((sum, p) => sum + Number(p.progress_percent ?? 0), 0) /
                  packages.length
              )
            : 0;

      const openTickets = (ticketsBy.get(String(project.code)) ?? []).filter(
        (t) => !["closed", "resolved"].includes(String(t.status ?? "").toLowerCase())
      );

      return {
        code: String(project.code),
        name: String(project.name),
        description: project.description ? String(project.description) : null,
        status: String(project.status ?? ""),
        phase: phaseBy.get(id) || null,
        startDate: toDateInput(project.start_date as string) || null,
        plannedEndDate: toDateInput(project.planned_end_date as string) || null,
        progressPercent: progress,

        workPackages: packages.map((p) => ({
          code: p.code ? String(p.code) : null,
          name: String(p.name ?? ""),
          status: String(p.status ?? "not_started"),
          progressPercent: Number(p.progress_percent ?? 0),
          startDate: toDateInput(p.start_date as string) || null,
          endDate: toDateInput(p.end_date as string) || null,
        })),

        milestones: ms.map((m) => {
          const due = toDateInput(m.due_date as string) || null;
          const dueDate = due ? new Date(`${due}T00:00:00`) : null;
          return {
            name: String(m.name ?? ""),
            dueDate: due,
            status: String(m.status ?? "pending"),
            overdue:
              dueDate !== null && dueDate < today && String(m.status) !== "completed",
          };
        }),

        documents: (docsBy.get(id) ?? []).map((d) => ({
          id: String(d.id),
          title: String(d.title ?? d.file_name ?? "Document"),
          documentType: d.document_type ? String(d.document_type) : null,
          sharedOn: d.created_at ? new Date(String(d.created_at)).toISOString() : null,
        })),

        tickets: (ticketsBy.get(String(project.code)) ?? []).slice(0, 20).map((t) => ({
          ticketNumber: String(t.ticket_number ?? ""),
          subject: String(t.subject ?? ""),
          status: String(t.status ?? ""),
          priority: String(t.priority ?? ""),
          raisedOn: t.created_at ? new Date(String(t.created_at)).toISOString() : null,
        })),
        openTicketCount: openTickets.length,
      };
    });

    return NextResponse.json({ success: true, contactName, projects });
  } catch (err) {
    return serverError("portal.GET", err);
  }
}
