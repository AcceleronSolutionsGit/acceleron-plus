import React from "react";
import { requireRole } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SalesOrdersClient } from "./SalesOrdersClient";

export const dynamic = "force-dynamic";

export default async function AdminSalesOrdersPage() {
  const auth = await requireRole(["admin"]);
  if (!auth.ok) redirect("/auth/sign-in");

  return <SalesOrdersClient />;
}
