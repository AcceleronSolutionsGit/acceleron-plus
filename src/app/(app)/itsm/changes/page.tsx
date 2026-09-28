import React from "react";
import { getChangeRequests } from "@/lib/api";
import { ChangesClient } from "./ChangesClient";

export default async function ChangesPage() {
  const changes = await getChangeRequests();

  return <ChangesClient changes={changes} />;
}
