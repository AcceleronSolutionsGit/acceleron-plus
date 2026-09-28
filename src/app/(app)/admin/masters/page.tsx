import React from "react";
import { identityDb, projectDb, itsmDb } from "@/lib/db";
import { AdminMastersClient } from "./AdminMastersClient";
import { DARWINBOX_GRADES_ORDER } from "@/lib/darwinbox";

export const dynamic = "force-dynamic";

export default async function AdminMastersPage() {
  // Fetch initial data in parallel
  const [
    employees,
    empCountRes,
    locationsRes,
    levelsRes,
    typesRes,
    rawRateBands,
    companies,
    lastSyncRes,
  ] = await Promise.all([
    identityDb("employee_master as e")
      .leftJoin("employee_master as m", "e.direct_manager_employee_id", "m.employee_id")
      .select(
        "e.*",
        "m.full_name as direct_manager_name"
      )
      .orderBy("e.full_name", "asc")
      .limit(25),
    identityDb("employee_master").count<{ count: string }>("* as count").first(),
    identityDb("employee_master")
      .distinct("office_location")
      .whereNotNull("office_location")
      .orderBy("office_location", "asc"),
    identityDb("employee_master")
      .distinct("job_level")
      .whereNotNull("job_level")
      .orderBy("job_level", "asc"),
    identityDb("employee_master")
      .distinct("employee_type")
      .whereNotNull("employee_type")
      .orderBy("employee_type", "asc"),
    projectDb("employee_rate_bands").select("*"),
    itsmDb("companies").select("*").orderBy("name", "asc"),
    identityDb("employee_master").max<{ max: string }>("last_synced_at as max").first(),
  ]);

  const totalEmployees = parseInt(empCountRes?.count ?? "0", 10);
  const locations = locationsRes.map((r: any) => r.office_location).filter(Boolean);

  // Sort job levels strictly by Darwinbox grade hierarchy: M2 -> G1 -> SRG1 -> G2 -> SRG2 -> G3 -> SRG3 -> G4 -> SRG4 -> G5
  const rawJobLevels = levelsRes.map((r: any) => r.job_level).filter(Boolean);
  const jobLevels = [...rawJobLevels].sort((a, b) => {
    const idxA = DARWINBOX_GRADES_ORDER.indexOf(a as any);
    const idxB = DARWINBOX_GRADES_ORDER.indexOf(b as any);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.localeCompare(b);
  });

  const employeeTypes = typesRes.map((r: any) => r.employee_type).filter(Boolean);
  const lastSyncedAt = lastSyncRes?.max ? new Date(lastSyncRes.max).toISOString() : null;

  // Sort rate bands strictly by Darwinbox grade hierarchy
  const rateBands = [...rawRateBands].sort((a, b) => {
    const idxA = DARWINBOX_GRADES_ORDER.indexOf(a.level_code as any);
    const idxB = DARWINBOX_GRADES_ORDER.indexOf(b.level_code as any);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.level_code.localeCompare(b.level_code);
  });

  // Plain JSON conversion for client component hydration
  const initialData = {
    employees: JSON.parse(JSON.stringify(employees)),
    totalEmployees,
    locations,
    jobLevels,
    employeeTypes,
    rateBands: JSON.parse(JSON.stringify(rateBands)),
    companies: JSON.parse(JSON.stringify(companies)),
    stats: {
      totalEmployees,
      totalRateBands: rateBands.filter((r) => r.is_active).length,
      totalCompanies: companies.length,
      locationsCount: locations.length,
      lastSyncedAt,
    },
  };

  return <AdminMastersClient initialData={initialData} />;
}
