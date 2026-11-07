import { NextRequest, NextResponse } from "next/server";
import { identityDb } from "@/lib/db";
import { requireSalaryManager } from "@/lib/salary-auth";
import {
  parseSalaryPasteText,
  parseSalaryExcelBuffer,
  applySalaryUpdates,
  ParsedSalaryRow,
} from "@/lib/salary-service";

export const runtime = "nodejs";

/**
 * GET /api/admin/salaries
 * Exclusively for Arindam Hari to view all employee individual salaries.
 */
export async function GET() {
  const auth = await requireSalaryManager();
  if (!auth.ok) return auth.response;

  try {
    const [employees, standaloneSalaries] = await Promise.all([
      identityDb("employee_master as e")
        .leftJoin("employee_salaries as s", "e.employee_id", "s.employee_id")
        .select(
          "e.employee_id",
          "e.full_name",
          "e.designation",
          "e.department",
          "e.job_level",
          "e.office_location",
          "e.is_active",
          "e.cost_rate_inr",
          "s.cost_per_day",
          "s.updated_at as salary_updated_at",
          "s.updated_by_email"
        )
        .orderBy("e.full_name", "asc"),
      identityDb("employee_salaries as s")
        .whereNotExists(
          identityDb("employee_master as e").whereRaw("e.employee_id = s.employee_id")
        )
        .select(
          "s.employee_id",
          "s.employee_name as full_name",
          "s.cost_per_day",
          "s.updated_at as salary_updated_at",
          "s.updated_by_email"
        ),
    ]);

    const formattedEmps = employees.map((emp) => {
      const effectiveCost =
        emp.cost_per_day !== null && emp.cost_per_day !== undefined
          ? Number(emp.cost_per_day)
          : emp.cost_rate_inr !== null && emp.cost_rate_inr !== undefined
          ? Number(emp.cost_rate_inr)
          : null;

      return {
        empCode: emp.employee_id,
        name: emp.full_name || emp.employee_id,
        designation: emp.designation || "—",
        department: emp.department || "—",
        jobLevel: emp.job_level || "—",
        officeLocation: emp.office_location || "—",
        isActive: emp.is_active !== false,
        costOfEmployee: effectiveCost,
        updatedAt: emp.salary_updated_at,
        updatedBy: emp.updated_by_email,
        isNewJoiner: false,
      };
    });

    const formattedJoiners = standaloneSalaries.map((s) => ({
      empCode: s.employee_id,
      name: s.full_name || s.employee_id,
      designation: "New Joiner (Pending Darwinbox)",
      department: "—",
      jobLevel: "—",
      officeLocation: "—",
      isActive: true,
      costOfEmployee: Number(s.cost_per_day),
      updatedAt: s.salary_updated_at,
      updatedBy: s.updated_by_email,
      isNewJoiner: true,
    }));

    const allRecords = [...formattedEmps, ...formattedJoiners];
    const configuredCount = allRecords.filter((r) => r.costOfEmployee !== null && r.costOfEmployee > 0).length;

    return NextResponse.json({
      success: true,
      summary: {
        totalEmployees: allRecords.length,
        configuredCount,
        missingCount: allRecords.length - configuredCount,
      },
      employees: allRecords,
    });
  } catch (error: any) {
    console.error("Failed to load salaries:", error);
    return NextResponse.json({ success: false, error: "Failed to load salaries directory." }, { status: 500 });
  }
}

/**
 * POST /api/admin/salaries
 * Bulk update / paste handler for Arindam Hari.
 * Accepts:
 *   - Multipart Form Data with file (Excel / CSV)
 *   - JSON { pasteText: string } (pasted rows from Excel)
 *   - JSON { items: ParsedSalaryRow[] }
 */
export async function POST(req: NextRequest) {
  const auth = await requireSalaryManager();
  if (!auth.ok) return auth.response;

  try {
    const contentType = req.headers.get("content-type") || "";
    let rowsToApply: ParsedSalaryRow[] = [];
    let parseErrors: string[] = [];

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return NextResponse.json({ success: false, error: "No file was uploaded." }, { status: 400 });
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
        const parsed = await parseSalaryExcelBuffer(buffer);
        rowsToApply = parsed.rows;
        parseErrors = parsed.errors;
      } else {
        const text = buffer.toString("utf-8");
        const parsed = parseSalaryPasteText(text);
        rowsToApply = parsed.rows;
        parseErrors = parsed.errors;
      }
    } else {
      const body = await req.json().catch(() => null);
      if (!body) {
        return NextResponse.json({ success: false, error: "Invalid request payload." }, { status: 400 });
      }

      if (typeof body.pasteText === "string") {
        const parsed = parseSalaryPasteText(body.pasteText);
        rowsToApply = parsed.rows;
        parseErrors = parsed.errors;
      } else if (Array.isArray(body.items)) {
        rowsToApply = body.items.map((item: any, idx: number) => ({
          empCode: String(item.empCode || "").trim(),
          name: String(item.name || "").trim(),
          cost: Number(item.cost || 0),
          rowNumber: idx + 1,
        }));
      } else {
        return NextResponse.json({ success: false, error: "Provide either pasteText or an uploaded file." }, { status: 400 });
      }
    }

    if (rowsToApply.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "No valid rows could be parsed. Check that your data has 3 columns: emp code, name, cost of employee.",
          details: parseErrors,
        },
        { status: 400 }
      );
    }

    const outcome = await applySalaryUpdates(rowsToApply, auth.session.email || "arindam.hari@acceleronsolutions.io");

    return NextResponse.json({
      success: true,
      message: `Successfully processed ${rowsToApply.length} employee salaries. ${outcome.affectedAllocationsCount} project allocation(s) updated across ${outcome.affectedProjectsCount} project(s).`,
      outcome,
      parseErrors,
    });
  } catch (error: any) {
    console.error("Salary bulk update failed:", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to update employee salaries." }, { status: 500 });
  }
}
