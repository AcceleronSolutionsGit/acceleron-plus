import React from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AllocationsClient } from "./AllocationsClient";

export const dynamic = "force-dynamic";

export default async function AdminAllocationsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // The proxy already blocks /admin for non-admins; this is the second
  // lock, so the page is safe even if the matcher ever changes.
  if (session.role !== "admin") redirect("/pmt");

  return <AllocationsClient />;
}
