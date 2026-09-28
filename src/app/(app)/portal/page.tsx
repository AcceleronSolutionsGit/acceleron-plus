import React from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { PortalClient } from "./PortalClient";

export const dynamic = "force-dynamic";

export const metadata = { title: "Your projects | Acceleron" };

export default async function PortalPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return <PortalClient />;
}
