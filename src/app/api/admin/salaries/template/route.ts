import { NextRequest, NextResponse } from "next/server";
import { requireSalaryManager } from "@/lib/salary-auth";
import {
  generateSalaryExcelTemplate,
  generateSalaryCsvTemplate,
} from "@/lib/salary-service";

export const runtime = "nodejs";

/**
 * GET /api/admin/salaries/template
 * Download template for salary upload with exact 3 columns:
 * 1. emp code
 * 2. name
 * 3. cost of employee
 *
 * Query param:
 *   ?format=csv for tab/comma-separated text
 *   Default: Excel (.xlsx) file
 */
export async function GET(req: NextRequest) {
  const auth = await requireSalaryManager();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format")?.toLowerCase();

  try {
    if (format === "csv" || format === "tsv") {
      const csv = await generateSalaryCsvTemplate();
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/tab-separated-values; charset=utf-8",
          "Content-Disposition": 'attachment; filename="employee_salaries_template.tsv"',
        },
      });
    }

    const excelBuffer = await generateSalaryExcelTemplate();
    return new NextResponse(new Uint8Array(excelBuffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="employee_salaries_template.xlsx"',
      },
    });
  } catch (error: any) {
    console.error("Failed to generate salary template:", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate salary template." },
      { status: 500 }
    );
  }
}
