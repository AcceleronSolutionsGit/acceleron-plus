import React from "react";
import { requireSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AdminTimesheetsClient } from "./AdminTimesheetsClient";

export const dynamic = "force-dynamic";

export default async function AdminTimesheetsPage() {
  const auth = await requireSession();
  if (!auth.ok) redirect("/login");
  // Both admins and managers with direct reports can reach this.
  // The API enforces what they can actually see.
  return <AdminTimesheetsClient />;
}
