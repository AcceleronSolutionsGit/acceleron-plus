import { NextRequest, NextResponse } from "next/server";
import { identityDb, projectDb } from "@/lib/db";
import { requireSalaryManager } from "@/lib/salary-auth";
import { cleanNumericCost } from "@/lib/salary-service";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ employeeId: string }>;
}

/**
 * PATCH /api/admin/salaries/[employeeId]
 * Allows Arindam Hari to edit an individual employee's salary or add cost for a new joiner.
 * Propagates the cost change immediately to all project allocations for this employee.
 */
export async function PATCH(req: NextRequest, context: RouteContext) {
  const auth = await requireSalaryManager();
  if (!auth.ok) return auth.response;

  const { employeeId } = await context.params;
  const empCode = String(employeeId || "").trim();

  if (!empCode) {
    return NextResponse.json(
      { success: false, error: "Employee code is required." },
      { status: 400 }
    );
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        { success: false, error: "Invalid JSON payload." },
        { status: 400 }
      );
    }

    const rawCost = body.costOfEmployee ?? body.cost;
    const cost = cleanNumericCost(rawCost);

    if (cost === null || cost < 0) {
      return NextResponse.json(
        { success: false, error: "Cost of employee must be a valid non-negative number." },
        { status: 400 }
      );
    }

    const name = typeof body.name === "string" ? body.name.trim() : "";

    // 1. Check or fetch existing employee in employee_master
    const masterEmp = await identityDb("employee_master")
      .where("employee_id", empCode)
      .first();

    const resolvedName = name || masterEmp?.full_name || empCode;

    // 2. Upsert into identity_db.employee_salaries
    const existingSalary = await identityDb("employee_salaries")
      .where("employee_id", empCode)
      .first();

    if (existingSalary) {
      await identityDb("employee_salaries")
        .where("employee_id", empCode)
        .update({
          employee_name: resolvedName,
          cost_per_day: cost,
          updated_by_email: auth.session.email || "arindam.hari@acceleronsolutions.io",
          updated_at: new Date(),
        });
    } else {
      await identityDb("employee_salaries").insert({
        employee_id: empCode,
        employee_name: resolvedName,
        cost_per_day: cost,
        currency: "INR",
        updated_by_email: auth.session.email || "arindam.hari@acceleronsolutions.io",
        created_at: new Date(),
        updated_at: new Date(),
      });
    }

    // 3. Update employee_master.cost_rate_inr if present
    if (masterEmp) {
      await identityDb("employee_master")
        .where("employee_id", empCode)
        .update({
          cost_rate_inr: cost,
          updated_at: new Date(),
        });
    }

    // 4. Propagate cost to project_team_members across all projects
    // Find matching user_id if any
    const matchedUser = await identityDb("users")
      .where("darwinbox_ref", empCode)
      .first();
    const userId = matchedUser ? String(matchedUser.id) : null;

    const allocations = await projectDb("project_team_members")
      .where(function () {
        this.where("employee_id", empCode);
        if (userId) this.orWhere("user_id", userId);
      })
      .select("id", "project_id", "planned_days");

    let allocationsUpdated = 0;
    const affectedProjects = new Set<string>();

    for (const alloc of allocations) {
      const plannedDays = Number(alloc.planned_days ?? 0);
      const newPlannedCost = Math.round((plannedDays * cost + Number.EPSILON) * 100) / 100;

      await projectDb("project_team_members")
        .where("id", alloc.id)
        .update({
          daily_cost_inr: cost,
          custom_daily_cost_inr: cost,
          planned_cost_inr: newPlannedCost,
          updated_at: new Date(),
        });

      affectedProjects.add(String(alloc.project_id));
      allocationsUpdated++;
    }

    return NextResponse.json({
      success: true,
      message: `Updated salary for ${resolvedName} (${empCode}) to ₹${cost.toLocaleString("en-IN")}/day. ${allocationsUpdated} project allocation(s) updated.`,
      employee: {
        empCode,
        name: resolvedName,
        costOfEmployee: cost,
        allocationsUpdated,
        affectedProjectsCount: affectedProjects.size,
      },
    });
  } catch (error: any) {
    console.error(`Failed to update salary for employee ${empCode}:`, error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to update employee salary." },
      { status: 500 }
    );
  }
}

