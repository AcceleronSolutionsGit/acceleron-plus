import React from "react";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ExternalUsersClient } from "./ExternalUsersClient";

export default async function ExternalUsersPage() {
  const session = await getSession();
  const isAdmin = session?.role === "admin" || Boolean(session?.additionalRoles?.includes("admin"));

  if (!session || !isAdmin) {
    redirect("/pmt");
  }

  return <ExternalUsersClient currentUserId={session.userId} />;
}
