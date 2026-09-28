import { NextResponse } from "next/server";
import { requireCapability, getProjectAccess } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { resolveProjectOr404, serverError } from "@/lib/route-helpers";
import { gatherPlan, exportFileStem } from "@/lib/exporters/plan-data";
import { buildWorkbook, buildCsv, type CsvTable } from "@/lib/exporters/workbook";
import { buildPdf } from "@/lib/exporters/pdf";
import { buildDeck } from "@/lib/exporters/deck";

export const runtime = "nodejs";
// Generating a deck or a large workbook can take a few seconds.
export const maxDuration = 60;

const CSV_TABLES: CsvTable[] = ["wbs", "milestones", "risks", "reviews", "team", "tickets"];

/**
 * Export a project plan.
 *
 *   GET .../export?format=xlsx
 *   GET .../export?format=pdf
 *   GET .../export?format=pptx
 *   GET .../export?format=csv&table=wbs
 *
 * Financial figures are included only for callers who may see them, so
 * a client exporting their own plan never receives our cost base.
 */
export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;

    const resolved = await resolveProjectOr404(id);
    if (!resolved.ok) return resolved.response;
    const projectId = resolved.project.id;

    const auth = await requireCapability(projectId, "export.plan");
    if (!auth.ok) return auth.response;

    const access = await getProjectAccess(projectId, auth.session);
    const includeFinancials = can(access, "export.financials");

    const { searchParams } = new URL(req.url);
    const format = (searchParams.get("format") ?? "xlsx").toLowerCase();

    const plan = await gatherPlan(projectId, { includeFinancials });
    if (!plan) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const stem = exportFileStem(plan);

    const send = (body: Buffer | string, type: string, filename: string) =>
      new NextResponse(body as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": type,
          // `filename*` carries non-ASCII names correctly; `filename` is the fallback.
          "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
          "Cache-Control": "no-store",
          "X-Financials-Included": includeFinancials ? "yes" : "no",
        },
      });

    switch (format) {
      case "xlsx":
        return send(
          await buildWorkbook(plan),
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          `${stem}.xlsx`
        );

      case "pdf":
        return send(await buildPdf(plan), "application/pdf", `${stem}.pdf`);

      case "pptx":
        return send(
          await buildDeck(plan),
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          `${stem}-status.pptx`
        );

      case "csv": {
        const table = (searchParams.get("table") ?? "wbs") as CsvTable;
        if (!CSV_TABLES.includes(table)) {
          return NextResponse.json(
            { error: `Unknown table "${table}". Choose one of: ${CSV_TABLES.join(", ")}.` },
            { status: 400 }
          );
        }
        // The BOM makes Excel open UTF-8 correctly on Windows.
        return send(`﻿${buildCsv(plan, table)}`, "text/csv; charset=utf-8", `${stem}-${table}.csv`);
      }

      default:
        return NextResponse.json(
          { error: `Unknown format "${format}". Choose xlsx, pdf, pptx or csv.` },
          { status: 400 }
        );
    }
  } catch (err) {
    return serverError("pmt.export", err);
  }
}
