// GET /api/integrations/darwinbox/employees
//
// Returns synced Darwinbox employee profiles for use in:
//   - Effort estimation & solutioning
//   - Project team member assignment
//   - Timesheet resource picker
//   - Cost analysis band assignment
//
// Privacy: Returns grade mapping info (band name/level) — NO salary/CTC

import { NextRequest, NextResponse } from "next/server";
import { identityDb, projectDb } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { mapDarwinboxGradeToLevelCode, DARWINBOX_GRADE_DETAILS } from "@/lib/darwinbox";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "UNAUTHORIZED" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q          = searchParams.get("q");              // free-text search
  const location   = searchParams.get("location");
  const levelCode  = searchParams.get("levelCode");      // M2–G5
  const page       = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit      = Math.min(150, parseInt(searchParams.get("limit") ?? "100", 10));
  const offset     = (page - 1) * limit;

  let query = identityDb("employee_master");

  if (location) query = query.whereILike("office_location", `%${location}%`);
  if (levelCode) query = query.where("job_level", levelCode);
  if (q) {
    query = query.where(function () {
      this.whereILike("full_name", `%${q}%`)
          .orWhereILike("company_email_id", `%${q}%`)
          .orWhereILike("employee_id", `%${q}%`)
          .orWhereILike("office_location", `%${q}%`)
          .orWhereILike("job_level", `%${q}%`);
    });
  }

  // Load active rate bands from project_db to map rate bands
  const rateBands = await projectDb("employee_rate_bands")
    .where("is_active", true)
    .select("id", "band_name", "level_code", "daily_cost_inr", "daily_billable_rate_inr");

  const bandByCode = new Map(rateBands.map((b: any) => [b.level_code.toUpperCase(), b]));

  const [totalResult, rows] = await Promise.all([
    query.clone().count<{ count: string }>("* as count").first(),
    query
      .select("*")
      .orderBy("full_name", "asc")
      .limit(limit)
      .offset(offset),
  ]);

  const total = parseInt(totalResult?.count ?? "0", 10);

  return NextResponse.json({
    success: true,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
    data: rows.map((r: any) => {
      const normalizedGrade = mapDarwinboxGradeToLevelCode(r.job_level);
      const gradeMeta = DARWINBOX_GRADE_DETAILS[normalizedGrade];
      const matchedBand = bandByCode.get(normalizedGrade) || bandByCode.get(r.job_level?.toUpperCase());

      return {
        id: r.employee_id,
        darwinboxRef: r.employee_id,
        employeeCode: r.employee_id,
        email: r.company_email_id,
        fullName: r.full_name,
        designation: gradeMeta?.title || r.job_level,
        department: "ASPL Engineering & Consulting",
        location: r.office_location,
        darwinboxGrade: r.job_level,
        mappedLevelCode: normalizedGrade,
        gradeRank: gradeMeta?.rank ?? 5,
        rateBandId: matchedBand?.id ?? null,
        rateBandName: matchedBand?.band_name ?? (gradeMeta ? `${gradeMeta.title} (${normalizedGrade})` : null),
        dailyCostInr: matchedBand ? parseFloat(matchedBand.daily_cost_inr) : gradeMeta?.defaultCost,
        dailyBillableRateInr: matchedBand ? parseFloat(matchedBand.daily_billable_rate_inr) : gradeMeta?.defaultRate,
        employmentType: r.employee_type || "Full Time",
        isActive: true,
        dateOfJoining: r.date_of_joining,
        lastSyncedAt: r.last_synced_at,
      };
    }),
  });
}
