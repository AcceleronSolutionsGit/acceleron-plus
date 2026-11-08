import React from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { isSalaryManager } from "@/lib/salary-auth";
import { ensureSalarySchema } from "@/lib/salary-service";
import { SalariesManagerClient } from "./SalariesManagerClient";

export const dynamic = "force-dynamic";

export default async function AdminSalariesPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // Strict authorization: Only Arindam Hari is authorized to view or manage employee salaries
  if (!isSalaryManager(session)) {
    redirect("/pmt");
  }

  await ensureSalarySchema();

  return <SalariesManagerClient currentUserEmail={session.email || "arindam.hari@acceleronsolutions.io"} />;
}

