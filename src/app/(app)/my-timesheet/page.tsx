import React from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { MyTimesheetClient } from "./MyTimesheetClient";

export const dynamic = "force-dynamic";

export const metadata = { title: "My Timesheet | Acceleron Plus" };

export default async function MyTimesheetPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return <MyTimesheetClient />;
}
