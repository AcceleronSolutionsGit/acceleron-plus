import React from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { MySkillsClient } from "./MySkillsClient";

export const dynamic = "force-dynamic";

export const metadata = { title: "My Skills | Acceleron Plus" };

export default async function MySkillsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return <MySkillsClient userName={session.fullName ?? session.email ?? "you"} />;
}
