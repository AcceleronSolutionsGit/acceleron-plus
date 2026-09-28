import React from "react";
import { requireSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AdminAllocationRequestsClient } from "./AdminAllocationRequestsClient";

export const dynamic = "force-dynamic";

export default async function AllocationRequestsPage() {
  const auth = await requireSession();
  if (!auth.ok) redirect("/login");
  // Both admins and reporting managers can reach this page.
  // The API scopes what they actually see.
  return <AdminAllocationRequestsClient />;
}
