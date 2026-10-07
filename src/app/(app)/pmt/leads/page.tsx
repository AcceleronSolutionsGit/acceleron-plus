import React from "react";
import { LeadsClient } from "./LeadsClient";

import { getSession } from "@/lib/auth";

export const metadata = {
  title: "Leads Pipeline | PMT",
};

export default async function LeadsPage() {
  const session = await getSession();
  return <LeadsClient userRole={session?.role ?? "member"} />;
}
