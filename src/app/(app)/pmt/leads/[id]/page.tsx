import React from "react";
import { SolutioningClient } from "./SolutioningClient";
import { projectDb, identityDb } from "@/lib/db";
import { notFound } from "next/navigation";
import { mapLeadRow } from "@/lib/row-mapper";
import { DARWINBOX_GRADES_ORDER } from "@/lib/darwinbox";
import { getSession } from "@/lib/auth";
import { leadsWithHiddenFinancials, withoutLeadFinancials } from "@/lib/lead-finance";

export const metadata = {
  title: "Effort Estimation & Solutioning | PMT",
};

export default async function LeadSolutioningPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  const leadRow = await projectDb("leads")
    .where(isUuid ? "id" : "lead_number", id)
    .first();
  if (!leadRow) notFound();

  // A converted lead's value is its project's budget — hidden unless the
  // viewer is that project's PM or an admin.
  const session = await getSession();
  const hidden = await leadsWithHiddenFinancials(
    [leadRow.id],
    session ? { role: session.role, userId: session.userId } : null
  );
  const lead = hidden.has(leadRow.id) ? withoutLeadFinancials(mapLeadRow(leadRow)) : mapLeadRow(leadRow);

  // Fetch active rate bands
  const rawRateBands = await projectDb("employee_rate_bands")
    .where("is_active", true);

  // Sort strictly by Darwinbox grade hierarchy: M2, G1, SRG1, G2, SRG2, G3, SRG3, G4, SRG4, G5
  const rateBands = [...rawRateBands].sort((a, b) => {
    const idxA = DARWINBOX_GRADES_ORDER.indexOf(a.level_code as any);
    const idxB = DARWINBOX_GRADES_ORDER.indexOf(b.level_code as any);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.level_code.localeCompare(b.level_code);
  });

  // Fetch Darwinbox employees from employee_master for direct employee-level effort estimation
  const darwinboxEmployees = await identityDb("employee_master")
    .select(
      "employee_id",
      "full_name",
      "company_email_id",
      "job_level",
      "office_location",
      "employee_type"
    )
    .orderBy("full_name", "asc");

  const canSeeCosts = session?.role === "admin" || session?.userId === leadRow.pm_owner_user_id;
  const safeRateBands = canSeeCosts ? rateBands : rateBands.map(rb => ({ ...rb, daily_cost_inr: 0, daily_billable_rate_inr: 0 }));

  return (
    <div className="p-6 max-w-[1600px] mx-auto min-h-[calc(100vh-64px)] space-y-6">
      <SolutioningClient
        lead={lead}
        rateBands={JSON.parse(JSON.stringify(safeRateBands))}
        darwinboxEmployees={JSON.parse(JSON.stringify(darwinboxEmployees))}
        canSeeCosts={canSeeCosts}
      />
    </div>
  );
}
