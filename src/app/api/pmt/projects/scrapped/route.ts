import { NextResponse } from "next/server";
import { requireCapabilityGlobally } from "@/lib/auth";
import { serverError } from "@/lib/route-helpers";
import { getScrappedProjects } from "@/lib/api";
import { projectDb } from "@/lib/db";
import { footprintOf, purgeBlockers } from "@/lib/scrap";

export const runtime = "nodejs";

/**
 * The scrapped projects, and the ones a PM has asked to scrap.
 *
 * Gated on `project.delete`, which only an admin holds — this is the
 * list you act on, so seeing it and doing something about it should
 * require the same thing.
 */
export async function GET() {
  try {
    const auth = await requireCapabilityGlobally("project.delete");
    if (!auth.ok) return auth.response;

    const scrapped = await getScrappedProjects();

    // Whether each one can be purged, so the list can say so without a
    // round trip per row.
    const withPurge = await Promise.all(
      scrapped.map(async (p) => {
        const footprint = await footprintOf(p.id);
        const blockers = purgeBlockers(footprint);
        return { ...p, footprint, canPurge: blockers.length === 0, purgeBlockers: blockers };
      })
    );

    // Live projects a PM has asked an admin to scrap.
    const rows = await projectDb("projects")
      .whereNotNull("scrap_requested_at")
      .whereNull("scrapped_at")
      .select(
        "id",
        "code",
        "name",
        "client_company_name",
        "scrap_requested_at",
        "scrap_requested_by_name",
        "scrap_request_reason"
      )
      .orderBy("scrap_requested_at", "desc");

    const requests = rows.map((r: Record<string, unknown>) => ({
      id: String(r.id),
      code: String(r.code),
      name: String(r.name),
      clientCompanyName: (r.client_company_name as string) ?? null,
      requestedAt: r.scrap_requested_at
        ? new Date(r.scrap_requested_at as string).toISOString()
        : null,
      requestedByName: (r.scrap_requested_by_name as string) ?? null,
      reason: (r.scrap_request_reason as string) ?? null,
    }));

    return NextResponse.json({ success: true, scrapped: withPurge, requests });
  } catch (err) {
    return serverError("pmt.projects.scrapped", err);
  }
}
