import React from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { MyTasksClient } from "./MyTasksClient";
import { ComingSoonPlaceholder } from "@/components/layout/ComingSoonPlaceholder";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "My Tasks | Acceleron Plus",
};

export default async function MyTasksPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  if (session.role !== "admin") {
    return <ComingSoonPlaceholder moduleName="My Tasks & Assignments" />;
  }

  return <MyTasksClient userName={session.fullName ?? session.email ?? "you"} />;
}
