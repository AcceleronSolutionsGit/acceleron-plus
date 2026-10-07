import React from "react";
import { AuditLogsClient } from "./AuditLogsClient";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Audit Logs | Administration",
};

export default async function AuditLogsPage() {
  const session = await getSession();
  if (!session || session.role !== "admin") redirect("/");

  return <AuditLogsClient />;
}
