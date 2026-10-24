import React from "react";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { EditUserClient } from "./EditUserClient";

export default async function EditExternalUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  const isAdmin = session?.role === "admin" || Boolean(session?.additionalRoles?.includes("admin"));

  if (!session || !isAdmin) {
    redirect("/pmt");
  }

  const { id } = await params;
  return <EditUserClient userId={id} currentUserId={session.userId} />;
}
