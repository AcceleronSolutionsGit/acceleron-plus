import React from "react";
import { notFound } from "next/navigation";
import { identityDb } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { EmployeeEditClient } from "./EmployeeEditClient";

export default async function EmployeeEditPage({ params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["admin"]);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  
  const employee = await identityDb("employee_master as e")
    .leftJoin("employee_master as m", "e.direct_manager_employee_id", "m.employee_id")
    .select("e.*", "m.full_name as direct_manager_name")
    .where("e.employee_id", id)
    .first();

  if (!employee) notFound();

  return <EmployeeEditClient initialEmployee={JSON.parse(JSON.stringify(employee))} />;
}
