import React from "react";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function LeadsLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  
  if (session?.role !== "admin" && session?.role !== "sales") {
    redirect("/pmt");
  }

  return <>{children}</>;
}
