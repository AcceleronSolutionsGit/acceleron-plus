import { NextResponse } from "next/server";
import { requireCapabilityGlobally } from "@/lib/auth";
import { serverError } from "@/lib/route-helpers";
import { buildAllocationReport, type AllocationQuery } from "@/lib/allocations";
import {
  buildAllocationWorkbook,
  buildAllocationCsv,
  allocationFileStem,
} from "@/lib/exporters/allocations";

export const runtime = "nodejs";
// A workbook over a few thousand employees takes a moment.
export const maxDuration = 60;

/**
 * The same report as a file.
 *
 *   GET /api/reports/allocations/export?format=xlsx
 *   GET /api/reports/allocations/export?format=csv
 *
 * It takes the same filters as the JSON endpoint, so what downloads is
 * what was on screen — exporting a different set from the one somebody
 * was looking at is how a report gets argued about in a meeting.
 */
export async function GET(req: Request) {
  try {
    const auth = await requireCapabilityGlobally("report.allocations");
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(req.url);
    const format = (searchParams.get("format") ?? "xlsx").toLowerCase();

    const query: AllocationQuery = {
      asOf: searchParams.get("asOf"),
      department: searchParams.get("department"),
      location: searchParams.get("location"),
      search: searchParams.get("search"),
      includeInactive: searchParams.get("includeInactive") === "1",
    };

    const report = await buildAllocationReport(query);
    const stem = allocationFileStem(report);

    const send = (body: Buffer | string, contentType: string, filename: string) =>
      new NextResponse(body as BodyInit, {
        headers: {
          "Content-Type": contentType,
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
        },
      });

    switch (format) {
      case "xlsx":
        return send(
          await buildAllocationWorkbook(report),
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          `${stem}.xlsx`
        );

      case "csv":
        // The BOM makes Excel open UTF-8 correctly on Windows — without
        // it the rupee sign and every accented name arrive as mojibake.
        return send(
          `﻿${buildAllocationCsv(report)}`,
          "text/csv; charset=utf-8",
          `${stem}.csv`
        );

      default:
        return NextResponse.json(
          { error: `Unknown format "${format}". Choose xlsx or csv.` },
          { status: 400 }
        );
    }
  } catch (err) {
    return serverError("reports.allocations.export", err);
  }
}
