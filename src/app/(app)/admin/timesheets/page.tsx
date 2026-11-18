import React, { Suspense } from "react";
import { requireSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AdminTimesheetsClient } from "./AdminTimesheetsClient";

export const dynamic = "force-dynamic";

export default async function AdminTimesheetsPage() {
  const auth = await requireSession();
  if (!auth.ok) redirect("/login");
  // Admins, PMs, and Reporting Managers can reach this.
  // The API enforces what they can actually see and approve.
  return (
    <Suspense fallback={<div className="p-12 text-center text-sm text-navy-500">Loading timesheet approvals…</div>}>
      <AdminTimesheetsClient />
    </Suspense>
  );
}
