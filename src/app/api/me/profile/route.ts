// GET  /api/me/profile  — my own designation & department
// PATCH /api/me/profile  — update them
//
// Same philosophy as /api/me/skills: this route can only ever
// touch the caller's own employee_master row. The two fields an
// employee is allowed to self-edit are designation and
// internal_department — nothing that affects access or payroll.

import { NextResponse } from "next/server";
import { identityDb } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { readJson, serverError } from "@/lib/route-helpers";

export const runtime = "nodejs";

const INTERNAL_DEPARTMENTS = [
  "SAP",
  "Non-SAP",
  "Director",
  "Account",
  "HR",
  "Operations",
  "IT Infra",
  "Sales",
  "Zoho",
] as const;

/** Resolve the caller's employee_master row (same logic as me/skills). */
async function myEmployeeId(session: { userId: string; email: string }): Promise<string | null> {
  const user = await identityDb("users")
    .where("id", session.userId)
    .select("darwinbox_ref", "email")
    .first<{ darwinbox_ref: string | null; email: string } | undefined>();

  if (user?.darwinbox_ref) return String(user.darwinbox_ref);

  const byEmail = await identityDb("employee_master")
    .whereRaw("lower(company_email_id) = ?", [
      String(user?.email ?? session.email).toLowerCase(),
    ])
    .select("employee_id")
    .first<{ employee_id: string } | undefined>()
    .catch(() => undefined);

  return byEmail ? String(byEmail.employee_id) : null;
}

export async function GET() {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const employeeId = await myEmployeeId(auth.session);
    if (!employeeId) {
      return NextResponse.json({
        success: true,
        linked: false,
        designation: null,
        department: null,
        darwinboxDepartment: null,
        message:
          "Your account is not linked to an employee record yet. An administrator can link it from People & Roles.",
      });
    }

    const row = await identityDb("employee_master")
      .where("employee_id", employeeId)
      .select("designation", "department", "internal_department")
      .first<{
        designation: string | null;
        department: string | null;
        internal_department: string | null;
      } | undefined>();

    return NextResponse.json({
      success: true,
      linked: true,
      employeeId,
      designation: row?.designation ?? null,
      department: row?.internal_department ?? null,
      darwinboxDepartment: row?.department ?? null,
    });
  } catch (err) {
    return serverError("me.profile.GET", err);
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const employeeId = await myEmployeeId(auth.session);
    if (!employeeId) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Your account is not linked to an employee record. Ask an administrator to link it.",
        },
        { status: 409 }
      );
    }

    const parsed = await readJson(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.body as Record<string, unknown>;

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    // Designation — free-text, max 200 chars
    if ("designation" in body) {
      const val = body.designation === null || body.designation === ""
        ? null
        : String(body.designation).trim().slice(0, 200);
      updates.designation = val;
    }

    // Internal department — must be one of the canonical values or null/empty to clear
    if ("department" in body) {
      const val = body.department === null || body.department === ""
        ? null
        : String(body.department).trim();
      if (val && !(INTERNAL_DEPARTMENTS as readonly string[]).includes(val)) {
        return NextResponse.json(
          { success: false, error: `"${val}" is not a valid department.` },
          { status: 400 }
        );
      }
      updates.internal_department = val ?? null;
    }

    if (Object.keys(updates).length <= 1) {
      return NextResponse.json(
        { success: false, error: "Nothing to update. Send designation and/or department." },
        { status: 400 }
      );
    }

    await identityDb("employee_master")
      .where("employee_id", employeeId)
      .update(updates);

    const updated = await identityDb("employee_master")
      .where("employee_id", employeeId)
      .select("designation", "department", "internal_department")
      .first<{
        designation: string | null;
        department: string | null;
        internal_department: string | null;
      } | undefined>();

    return NextResponse.json({
      success: true,
      designation: updated?.designation ?? null,
      department: updated?.internal_department ?? null,
      darwinboxDepartment: updated?.department ?? null,
      message: "Profile updated successfully.",
    });
  } catch (err) {
    return serverError("me.profile.PATCH", err);
  }
}
