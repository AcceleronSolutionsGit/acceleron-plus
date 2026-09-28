import React from "react";
import { getProjects } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { ProjectListClient } from "./ProjectListClient";
import { ComingSoonPlaceholder } from "@/components/layout/ComingSoonPlaceholder";

export default async function PMTProjectsPage() {
  const [projects, session] = await Promise.all([getProjects(), getSession()]);

  if (session?.role !== "admin") {
    return <ComingSoonPlaceholder moduleName="Projects & Portfolio Management" />;
  }

  // Scrapped projects never reach here — `getProjects` excludes them —
  // so the list is always the live ones.
  return <ProjectListClient projects={projects} userRole={session?.role ?? "member"} />;
}
