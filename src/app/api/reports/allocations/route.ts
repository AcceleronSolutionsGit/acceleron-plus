import { NextResponse } from "next/server";
import { requireCapabilityGlobally } from "@/lib/auth";
import { serverError } from "@/lib/route-helpers";
import { buildAllocationReport, type AllocationQuery } from "@/lib/allocations";

export const runtime = "nodejs";

/**
 * Who is on what, across every project at once.
 *
 *   GET /api/reports/allocations
 *   GET /api/reports/allocations?asOf=2026-10-01&department=Delivery
 *
 * Guarded on the capability rather than on the URL, so this stays
 * correct if the page ever moves out from under /admin. The report
 * names every employee and which projects they are on; it carries no
 * rates and no cost, so it is not gated on financials.
 */
export async function GET(req: Request) {
  try {
    const auth = await requireCapabilityGlobally("report.allocations");
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(req.url);

    const query: AllocationQuery = {
      asOf: searchParams.get("asOf"),
      department: searchParams.get("department"),
      location: searchParams.get("location"),
      search: searchParams.get("search"),
      includeInactive: searchParams.get("includeInactive") === "1",
    };

    return NextResponse.json({ success: true, report: await buildAllocationReport(query) });
  } catch (err) {
    return serverError("reports.allocations", err);
  }
}
