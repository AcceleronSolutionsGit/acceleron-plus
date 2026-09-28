import React from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ImportClient } from "./ImportClient";

export const dynamic = "force-dynamic";

export default async function AllocationImportPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // Reading the allocation report is open to PMs; writing allocations
  // across every project at once is not. The proxy blocks /admin as
  // well, so this is the second lock rather than the only one.
  if (session.role !== "admin") redirect("/pmt");

  return <ImportClient />;
}
