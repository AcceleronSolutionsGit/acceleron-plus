import { NextResponse } from "next/server";
import { identityDb, projectDb } from "@/lib/db";
import { requireProjectCapability } from "@/lib/auth";
import { serverError } from "@/lib/route-helpers";
import { skillsForEmployees, commitmentsFor, listRateBands, suggestBandFor, describeBandSource } from "@/lib/staffing";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * Who could be staffed onto this project.
 *
 * Searches the employee master by name, email, designation or
 * department, optionally narrowed to people holding given skills at or
 * above a proficiency. People already on the project are returned too,
 * flagged rather than hidden, so the list does not appear to be missing
 * somebody the PM knows is there.
 *
 * GET .../team/available?q=priya&skills=<uuid>,<uuid>&minProficiency=3&match=all
 */
export async function GET(req: Request, context: Params) {
  try {
    const { id } = await context.params;
    const guard = await requireProjectCapability(id, "team.manage");
    if (!guard.ok) return guard.response;

    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    // The window being staffed for, so "already busy" means busy *then*.
    const windowStart = url.searchParams.get("startDate") || null;
    const windowEnd = url.searchParams.get("endDate") || null;
    const skillIds = (url.searchParams.get("skills") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const minProficiency = Number(url.searchParams.get("minProficiency") ?? 1);
    // "all" means every skill listed; "any" means at least one.
    const matchAll = (url.searchParams.get("match") ?? "all") === "all";
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 40)));

    let query = identityDb("employee_master")
      .where("is_active", true)
      .andWhere(function () {
        // A leaver keeps their row; they should not appear as staffable.
        this.whereNull("date_of_exit").orWhere("date_of_exit", ">", new Date());
      });

    if (q) {
      const like = `%${q}%`;
      query = query.andWhere(function () {
        this.where("full_name", "ilike", like)
          .orWhere("company_email_id", "ilike", like)
          .orWhere("designation", "ilike", like)
          .orWhere("department", "ilike", like)
          .orWhere("employee_id", "ilike", like);
      });
    }

    if (skillIds.length > 0) {
      const holders = identityDb("employee_skills")
        .whereIn("skill_id", skillIds)
        .andWhere("proficiency", ">=", Number.isFinite(minProficiency) ? minProficiency : 1)
        .groupBy("employee_id")
        .select("employee_id");

      // "All of these skills" is a count of distinct matches, not a join.
      if (matchAll) holders.havingRaw("count(distinct skill_id) = ?", [skillIds.length]);

      query = query.whereIn("employee_id", holders);
    }

    const rows = (await query
      .select(
        "employee_id",
        "full_name",
        "company_email_id",
        "designation",
        "department",
        "job_level",
        "office_location",
        "avatar_url"
      )
      .orderBy("full_name")
      .limit(limit)) as Record<string, unknown>[];

    const employeeIds = rows.map((r) => String(r.employee_id));
    const [skills, staffed, elsewhere, bands] = await Promise.all([
      skillsForEmployees(employeeIds),
      projectDb("project_team_members")
        .where("project_id", guard.project.id)
        .select("employee_id", "is_active")
        .catch(() => [] as Record<string, unknown>[]),
      commitmentsFor(employeeIds, {
        startDate: windowStart,
        endDate: windowEnd,
        excludeProjectId: guard.project.id,
      }),
      // Fetched once for the whole list rather than per candidate.
      listRateBands(),
    ]);

    const alreadyOn = new Map(
      (staffed as Record<string, unknown>[])
        .filter((r) => r.employee_id)
        .map((r) => [String(r.employee_id), r.is_active !== false])
    );

    const people = rows.map((row) => {
      const employeeId = String(row.employee_id);
      const commitments = elsewhere.get(employeeId) ?? [];
      const committedElsewhere = commitments.reduce((sum, c) => sum + c.allocationPercent, 0);
      // Their grade decides their rate; the screen should not ask.
      const suggestedBand = suggestBandFor(row as { job_level?: string | null }, bands);
      return {
        employeeId,
        fullName: row.full_name ? String(row.full_name) : employeeId,
        email: row.company_email_id ? String(row.company_email_id) : null,
        designation: row.designation ? String(row.designation) : null,
        department: row.department ? String(row.department) : null,
        jobLevel: row.job_level ? String(row.job_level) : null,
        location: row.office_location ? String(row.office_location) : null,
        avatarUrl: row.avatar_url ? String(row.avatar_url) : null,
        skills: skills.get(employeeId) ?? [],
        onThisProject: alreadyOn.has(employeeId),
        standDown: alreadyOn.get(employeeId) === false,
        // What they are already committed to over the window, so a PM
        // can see who is free before picking rather than after.
        otherProjects: commitments,
        committedElsewhere,
        availablePercent: Math.max(0, 100 - committedElsewhere),
        suggestedBand,
        bandNote: describeBandSource(suggestedBand),
      };
    });

    return NextResponse.json({ success: true, people, count: people.length, limit });
  } catch (err) {
    return serverError("team.available.GET", err);
  }
}
