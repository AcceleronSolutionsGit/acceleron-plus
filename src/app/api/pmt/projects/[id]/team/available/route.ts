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

    let extQuery = identityDb("users as u")
      .leftJoin("roles as r", "r.id", "u.role_id")
      .whereNull("u.darwinbox_ref")
      .where("u.is_active", true);

    if (q) {
      const like = `%${q}%`;
      extQuery = extQuery.andWhere(function () {
        this.where("u.full_name", "ilike", like)
          .orWhere("u.email", "ilike", like)
          .orWhere("u.mobile_phone", "ilike", like)
          .orWhere("r.name", "ilike", like);
      });
    }

    const [rows, extRows] = await Promise.all([
      (query
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
        .limit(limit)) as Promise<Record<string, unknown>[]>,
      // Non-Darwinbox external users (only when skill filter is empty, or filtered by query)
      skillIds.length === 0
        ? ((extQuery
            .select(
              "u.id",
              "u.full_name",
              "u.email",
              "u.mobile_phone",
              identityDb.ref("r.name").as("role_name"),
              identityDb.ref("r.code").as("role_code")
            )
            .orderBy("u.full_name")
            .limit(limit)) as Promise<Record<string, unknown>[]>)
        : Promise.resolve([] as Record<string, unknown>[]),
    ]);

    const employeeIds = rows.map((r) => String(r.employee_id));
    const externalIds = extRows.map((r) => String(r.id));
    const allIdsForCommitments = [...employeeIds, ...externalIds];

    const [skills, staffed, elsewhere, bands] = await Promise.all([
      skillsForEmployees(employeeIds),
      projectDb("project_team_members")
        .where("project_id", guard.project.id)
        .select("employee_id", "user_id", "is_active")
        .catch(() => [] as Record<string, unknown>[]),
      commitmentsFor(allIdsForCommitments, {
        startDate: windowStart,
        endDate: windowEnd,
        excludeProjectId: guard.project.id,
      }),
      // Fetched once for the whole list rather than per candidate.
      listRateBands(),
    ]);

    const staffedList = staffed as Record<string, unknown>[];
    const alreadyOnEmp = new Map(
      staffedList
        .filter((r) => r.employee_id)
        .map((r) => [String(r.employee_id), r.is_active !== false])
    );
    const alreadyOnUser = new Map(
      staffedList
        .filter((r) => r.user_id)
        .map((r) => [String(r.user_id), r.is_active !== false])
    );

    const darwinboxPeople = rows.map((row) => {
      const employeeId = String(row.employee_id);
      const commitments = elsewhere.get(employeeId) ?? [];
      const committedElsewhere = commitments.reduce((sum, c) => sum + c.allocationPercent, 0);
      // Their grade decides their rate; the screen should not ask.
      const suggestedBand = suggestBandFor(row as { job_level?: string | null }, bands);
      return {
        employeeId,
        userId: null,
        isExternal: false,
        fullName: row.full_name ? String(row.full_name) : employeeId,
        email: row.company_email_id ? String(row.company_email_id) : null,
        designation: row.designation ? String(row.designation) : null,
        department: row.department ? String(row.department) : null,
        jobLevel: row.job_level ? String(row.job_level) : null,
        location: row.office_location ? String(row.office_location) : null,
        avatarUrl: row.avatar_url ? String(row.avatar_url) : null,
        skills: skills.get(employeeId) ?? [],
        onThisProject: alreadyOnEmp.has(employeeId),
        standDown: alreadyOnEmp.get(employeeId) === false,
        // What they are already committed to over the window, so a PM
        // can see who is free before picking rather than after.
        otherProjects: commitments,
        committedElsewhere,
        availablePercent: Math.max(0, 100 - committedElsewhere),
        suggestedBand,
        bandNote: describeBandSource(suggestedBand),
      };
    });

    const externalPeople = extRows.map((row) => {
      const userId = String(row.id);
      const commitments = elsewhere.get(userId) ?? [];
      const committedElsewhere = commitments.reduce((sum, c) => sum + c.allocationPercent, 0);
      const isOnProject = alreadyOnUser.has(userId);
      const isStandDown = alreadyOnUser.get(userId) === false;

      return {
        employeeId: userId,
        userId: userId,
        isExternal: true,
        fullName: row.full_name ? String(row.full_name) : "External Resource",
        email: row.email ? String(row.email) : null,
        designation: row.role_name ? String(row.role_name) : "Consultant / External",
        department: "Non-Darwinbox / External",
        jobLevel: "External",
        location: null,
        avatarUrl: null,
        skills: [],
        onThisProject: isOnProject,
        standDown: isStandDown,
        otherProjects: commitments,
        committedElsewhere,
        availablePercent: Math.max(0, 100 - committedElsewhere),
        suggestedBand: null,
        bandNote: "Non-Darwinbox external resource (set custom daily CTC budget)",
      };
    });

    const people = [...darwinboxPeople, ...externalPeople];

    return NextResponse.json({ success: true, people, count: people.length, limit });
  } catch (err) {
    return serverError("team.available.GET", err);
  }
}
