// POST /api/integrations/darwinbox/sync
//
// Triggers a full or incremental sync of employees from Darwinbox.
// Writes to: project_db.project_team_member_profiles (grade + band mapping)
// Updates:   identity_db-linked darwinbox_ref on users
//
// Privacy: salary/CTC is NEVER fetched or stored.
//          Only grade is synced → mapped to our rate_bands table.

import { NextRequest, NextResponse } from "next/server";
import { projectDb } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import {
  fetchAllDarwinboxEmployees,
  transformDarwinboxEmployee,
  mapDarwinboxGradeToLevelCode,
  DarwinboxConfigError,
  darwinboxCompanyCodes,
  type DarwinboxSyncedEmployee,
} from "@/lib/darwinbox";

export async function POST(req: NextRequest) {
  const auth = await requireRole(["admin"]);
  if (!auth.ok) return auth.response;

  const session = auth.session;

  const body = await req.json().catch(() => ({}));
  const {
    includeInactive = false,
    // Defaults to DARWINBOX_COMPANY_CODES (ASPL unless overridden).
    companyCodes,
  } = body as { includeInactive?: boolean; companyCodes?: string[] };

  const syncStart = new Date().toISOString();

  let rawEmployees;
  try {
    rawEmployees = await fetchAllDarwinboxEmployees({
      includeInactive,
      companyCodes: Array.isArray(companyCodes) && companyCodes.length > 0 ? companyCodes : undefined,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to connect to Darwinbox";
    const isConfig = err instanceof DarwinboxConfigError;
    return NextResponse.json({
      success: false,
      error: isConfig ? "DARWINBOX_NOT_CONFIGURED" : "DARWINBOX_API_ERROR",
      message,
    }, { status: isConfig ? 503 : 502 });
  }

  // ── Load rate bands for grade → band mapping ──────────────────
  const rateBands = await projectDb("employee_rate_bands")
    .where("is_active", true)
    .select("id", "band_name", "level_code");

  const bandByLevel: Record<string, { id: string; bandName: string }> = {};
  for (const b of rateBands) {
    bandByLevel[b.level_code] = { id: b.id, bandName: b.band_name };
  }

  // ── Transform + resolve band mapping ─────────────────────────
  const transformed: DarwinboxSyncedEmployee[] = rawEmployees.map((raw) => {
    const emp = transformDarwinboxEmployee(raw);
    const bandMatch = bandByLevel[emp.mappedLevelCode ?? "L2"];
    return {
      ...emp,
      mappedBandId:   bandMatch?.id,
      mappedBandName: bandMatch?.bandName,
    };
  });

  // ── Upsert into darwinbox_employee_profiles ──────────────────
  // This table is the bridge between Darwinbox and our system.
  // It is in project_db for now; can move to execution_db later.
  await ensureProfileTableExists();

  const results = {
    created:  0,
    updated:  0,
    skipped:  0,
    errors:   [] as { email: string; error: string }[],
  };

  for (const emp of transformed) {
    try {
      const existing = await projectDb("darwinbox_employee_profiles")
        .where("darwinbox_ref", emp.darwinboxRef)
        .first();

      const record = {
        darwinbox_ref:       emp.darwinboxRef,
        employee_code:       emp.employeeCode,
        email:               emp.email,
        full_name:           emp.fullName,
        designation:         emp.designation,
        department:          emp.department,
        department_id:       emp.departmentId,
        location:            emp.location,
        darwinbox_grade:     emp.grade,          // raw grade — for audit
        mapped_level_code:   emp.mappedLevelCode, // L1–L6
        rate_band_id:        emp.mappedBandId ?? null,
        rate_band_name:      emp.mappedBandName ?? null,
        employment_type:     emp.employmentType,
        is_active:           emp.isActive,
        date_of_joining:     emp.dateOfJoining,
        date_of_exit:        emp.dateOfExit ?? null,
        reporting_manager_darwinbox_ref: emp.reportingManagerId ?? null,
        cost_center:         emp.costCenter ?? null,
        avatar_url:          emp.avatarUrl ?? null,
        last_synced_at:      syncStart,
        updated_at:          new Date().toISOString(),
      };

      if (existing) {
        await projectDb("darwinbox_employee_profiles")
          .where("darwinbox_ref", emp.darwinboxRef)
          .update(record);
        results.updated++;
      } else {
        await projectDb("darwinbox_employee_profiles").insert({
          ...record,
          created_at: new Date().toISOString(),
        });
        results.created++;
      }
    } catch (err: any) {
      results.errors.push({ email: emp.email, error: err?.message ?? "unknown" });
      results.skipped++;
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      // The master endpoint always returns the full dataset, so there is
      // no incremental mode to report.
      mode: "full",
      companyCodes:
        Array.isArray(companyCodes) && companyCodes.length > 0
          ? companyCodes
          : darwinboxCompanyCodes(),
      includeInactive,
      syncStartedAt: syncStart,
      syncCompletedAt: new Date().toISOString(),
      totalFetchedFromDarwinbox: rawEmployees.length,
      results,
    },
  });
}

// ─── GET /api/integrations/darwinbox/sync — latest sync status ─────

export async function GET(req: NextRequest) {
  // Read-only sync status: admins and project managers.
  const auth = await requireRole(["admin", "pm"]);
  if (!auth.ok) return auth.response;

  await ensureProfileTableExists();

  const [total, active, lastSync] = await Promise.all([
    projectDb("darwinbox_employee_profiles").count("id as c").first(),
    projectDb("darwinbox_employee_profiles").where("is_active", true).count("id as c").first(),
    projectDb("darwinbox_employee_profiles").max("last_synced_at as t").first(),
  ]);

  // Band distribution (privacy-safe: count per band, no names/salaries)
  const bandDist = await projectDb("darwinbox_employee_profiles")
    .where("is_active", true)
    .select("rate_band_name", "mapped_level_code")
    .count("id as headcount")
    .groupBy("rate_band_name", "mapped_level_code")
    .orderBy("mapped_level_code");

  return NextResponse.json({
    success: true,
    data: {
      totalEmployees:  parseInt((total as any)?.c ?? 0),
      activeEmployees: parseInt((active as any)?.c ?? 0),
      lastSyncedAt:    (lastSync as any)?.t ?? null,
      bandDistribution: bandDist.map((b: any) => ({
        rateBandName: b.rate_band_name,
        levelCode:    b.mapped_level_code,
        headcount:    parseInt(b.headcount),
      })),
    },
  });
}

// ─── Ensure darwinbox_employee_profiles table exists ───────────────

async function ensureProfileTableExists() {
  if (!(await projectDb.schema.hasTable("darwinbox_employee_profiles"))) {
    await projectDb.schema.createTable("darwinbox_employee_profiles", (t) => {
      t.uuid("id").primary().defaultTo(projectDb.raw("gen_random_uuid()"));
      t.string("darwinbox_ref").notNullable().unique();
      t.string("employee_code").notNullable();
      t.string("email").notNullable();
      t.string("full_name").notNullable();
      t.string("designation");
      t.string("department");
      t.string("department_id");
      t.string("location");
      t.string("darwinbox_grade");       // raw grade from Darwinbox (audit)
      t.string("mapped_level_code");     // our L1–L6 mapping
      t.uuid("rate_band_id").references("id").inTable("employee_rate_bands");
      t.string("rate_band_name");        // denormalized
      t.string("employment_type");
      t.boolean("is_active").defaultTo(true);
      t.date("date_of_joining");
      t.date("date_of_exit");
      t.string("reporting_manager_darwinbox_ref");
      t.string("cost_center");
      t.string("avatar_url");
      t.timestamp("last_synced_at");
      t.timestamps(true, true);
    });
  }
}
