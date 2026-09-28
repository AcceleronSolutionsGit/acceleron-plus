import React from "react";
import { requireSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { MyProjectsClient } from "./MyProjectsClient";

export const dynamic = "force-dynamic";

export default async function MyProjectsPage() {
  const auth = await requireSession();
  if (!auth.ok) redirect("/auth/sign-in");
  return <MyProjectsClient userName={auth.session.fullName ?? "You"} />;
}
