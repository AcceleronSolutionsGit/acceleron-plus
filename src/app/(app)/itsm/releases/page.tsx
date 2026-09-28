import React from "react";
import { getReleases } from "@/lib/api";
import { ReleasesClient } from "./ReleasesClient";

export default async function ReleasesPage() {
  const releases = await getReleases();

  return <ReleasesClient releases={releases} />;
}
