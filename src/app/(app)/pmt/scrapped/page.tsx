import React from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ScrappedClient } from "./ScrappedClient";

export const dynamic = "force-dynamic";

export default async function ScrappedProjectsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // Only an admin acts on these. A PM can ask for a project to be
  // scrapped from the project itself, but the list of what has been
  // scrapped — and the ability to restore or delete — is admin work.
  if (session.role !== "admin") redirect("/pmt");

  return <ScrappedClient />;
}
