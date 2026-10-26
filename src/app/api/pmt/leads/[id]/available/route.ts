import { NextResponse } from "next/server";
import { identityDb } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { serverError } from "@/lib/route-helpers";
import { skillsForEmployees, commitmentsFor, listRateBands, suggestBandFor, describeBandSource } from "@/lib/staffing";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * Who could be staffed for lead effort solutioning.
 *
 * Searches employee master by name, email, designation or department,
 * filtered by skills catalogue with minimum proficiency thresholds,
 * returning Darwinbox employees, their skills, current live project commitments,
 * bandwidth free %, and suggested rate bands.
 *
 * GET /api/pmt/leads/[id]/available?q=dev&skills=<uuid>,<uuid>&minProficiency=3
 */
export async function GET(req: Request, context: Params) {
  try {
    const { id } = await context.params;
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: "UNAUTHORIZED" }, { status: 401 });
    }

    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const windowStart = url.searchParams.get("startDate") || null;
    const windowEnd = url.searchParams.get("endDate") || null;
    const skillIds = (url.searchParams.get("skills") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const minProficiency = Number(url.searchParams.get("minProficiency") ?? 1);
    const matchAll = (url.searchParams.get("match") ?? "all") === "all";
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 50)));

    let query = identityDb("employee_master")
      .where("is_active", true)
      .andWhere(function () {
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
    const [skills, elsewhere, bands] = await Promise.all([
      skillsForEmployees(employeeIds),
      commitmentsFor(employeeIds, {
        startDate: windowStart,
        endDate: windowEnd,
      }),
      listRateBands(),
    ]);

    const people = rows.map((row) => {
      const employeeId = String(row.employee_id);
      const commitments = elsewhere.get(employeeId) ?? [];
      const committedElsewhere = commitments.reduce((sum, c) => sum + c.allocationPercent, 0);
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
        otherProjects: commitments,
        committedElsewhere,
        availablePercent: Math.max(0, 100 - committedElsewhere),
        suggestedBand,
        bandNote: describeBandSource(suggestedBand),
      };
    });

    return NextResponse.json({ success: true, people, count: people.length, limit });
  } catch (err) {
    return serverError("lead.team.available.GET", err);
  }
}
