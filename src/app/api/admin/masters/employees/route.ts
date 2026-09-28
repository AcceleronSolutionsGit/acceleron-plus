import { NextRequest, NextResponse } from "next/server";
import { identityDb } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requireRole(["admin"]);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.trim();
    const location = searchParams.get("location")?.trim();
    const jobLevel = searchParams.get("job_level")?.trim();
    const employeeType = searchParams.get("employee_type")?.trim();
    const department = searchParams.get("department")?.trim();
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "25", 10)));
    const offset = (page - 1) * limit;

    let baseQuery = identityDb("employee_master as e")
      .leftJoin("employee_master as m", "e.direct_manager_employee_id", "m.employee_id");

    if (search) {
      baseQuery = baseQuery.where((builder) => {
        builder
          .whereILike("e.full_name", `%${search}%`)
          .orWhereILike("e.company_email_id", `%${search}%`)
          .orWhereILike("e.employee_id", `%${search}%`)
          .orWhereILike("e.office_location", `%${search}%`)
          .orWhereILike("e.job_level", `%${search}%`)
          .orWhereILike("e.designation", `%${search}%`)
          .orWhereILike("m.full_name", `%${search}%`);
      });
    }

    if (location && location !== "all") {
      baseQuery = baseQuery.whereILike("e.office_location", `%${location}%`);
    }

    if (jobLevel && jobLevel !== "all") {
      baseQuery = baseQuery.where("e.job_level", jobLevel);
    }

    if (employeeType && employeeType !== "all") {
      baseQuery = baseQuery.where("e.employee_type", employeeType);
    }

    if (department && department !== "all") {
      // Match on the override first, fall back to Darwinbox department
      baseQuery = baseQuery.where((builder) => {
        builder
          .where("e.internal_department", department)
          .orWhere((b2) => {
            b2.whereNull("e.internal_department")
              .whereILike("e.department", `%${department}%`);
          });
      });
    }

    const countRes = await baseQuery.clone().count<{ count: string }>("* as count").first();
    const total = parseInt(countRes?.count ?? "0", 10);

    const employees = await baseQuery
      .clone()
      .select(
        "e.*",
        "m.full_name as direct_manager_name"
      )
      .orderBy("e.full_name", "asc")
      .limit(limit)
      .offset(offset);

    // Also get distinct filter options for the frontend UI
    const [locationsRes, levelsRes, typesRes, designationsRes] = await Promise.all([
      identityDb("employee_master")
        .distinct("office_location")
        .whereNotNull("office_location")
        .orderBy("office_location", "asc"),
      identityDb("employee_master")
        .distinct("job_level")
        .whereNotNull("job_level")
        .orderBy("job_level", "asc"),
      identityDb("employee_master")
        .distinct("employee_type")
        .whereNotNull("employee_type")
        .orderBy("employee_type", "asc"),
      identityDb("employee_master")
        .distinct("designation")
        .whereNotNull("designation")
        .where("designation", "!=", "")
        .orderBy("designation", "asc"),
    ]);

    const locations = locationsRes.map((r: any) => r.office_location).filter(Boolean);
    const jobLevels = levelsRes.map((r: any) => r.job_level).filter(Boolean);
    const employeeTypes = typesRes.map((r: any) => r.employee_type).filter(Boolean);
    const designations = designationsRes.map((r: any) => r.designation).filter(Boolean);

    return NextResponse.json({
      success: true,
      data: employees,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        locations,
        jobLevels,
        employeeTypes,
        designations,
      },
    });
  } catch (error) {
    console.error("Error fetching employee masters:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch employee master records" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(["admin"]);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const {
      employee_id,
      full_name,
      company_email_id,
      job_level,
      office_location,
      group_company_code = "ASPL",
      date_of_joining,
      employee_type = "Full Time",
      direct_manager_employee_id,
      designation,
      internal_department,
    } = body;

    if (!employee_id || !full_name) {
      return NextResponse.json(
        { success: false, error: "Employee ID and Full Name are required" },
        { status: 400 }
      );
    }

    const existing = await identityDb("employee_master").where("employee_id", employee_id).first();
    if (existing) {
      return NextResponse.json(
        { success: false, error: `Employee ID ${employee_id} already exists` },
        { status: 409 }
      );
    }

    const newRecord = {
      employee_id: String(employee_id).trim(),
      full_name: String(full_name).trim(),
      company_email_id: company_email_id ? String(company_email_id).trim() : null,
      job_level: job_level ? String(job_level).trim() : null,
      office_location: office_location ? String(office_location).trim() : null,
      group_company_code: group_company_code ? String(group_company_code).trim() : "ASPL",
      date_of_joining: date_of_joining ? String(date_of_joining).trim() : null,
      employee_type: employee_type ? String(employee_type).trim() : "Full Time",
      direct_manager_employee_id: direct_manager_employee_id ? String(direct_manager_employee_id).trim() : null,
      designation: designation ? String(designation).trim() : null,
      internal_department: internal_department ? String(internal_department).trim() : null,
      last_synced_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await identityDb("employee_master").insert(newRecord);

    return NextResponse.json({
      success: true,
      data: newRecord,
      message: "Employee master record created successfully",
    }, { status: 201 });
  } catch (error) {
    console.error("Error creating employee master record:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create employee master record" },
      { status: 500 }
    );
  }
}
