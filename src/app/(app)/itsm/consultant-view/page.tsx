import React from "react";
import { getConsultants } from "@/lib/api";
import { ConsultantViewClient } from "./ConsultantViewClient";

export default async function ConsultantViewPage() {
  const consultants = await getConsultants();

  return <ConsultantViewClient consultants={consultants} />;
}
