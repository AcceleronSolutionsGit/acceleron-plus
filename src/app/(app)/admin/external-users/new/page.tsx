import React from "react";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { CreateUserClient } from "./CreateUserClient";

export default async function NewExternalUserPage() {
  const session = await getSession();
  const isAdmin = session?.role === "admin" || Boolean(session?.additionalRoles?.includes("admin"));

  if (!session || !isAdmin) {
    redirect("/pmt");
  }

  return <CreateUserClient />;
}
