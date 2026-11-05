import React from "react";
import { redirect } from "next/navigation";
import { getCurrentUser, mustChangePassword, projectsManagedBy } from "@/lib/auth";
import { REQUIRE_PASSWORD } from "@/lib/auth-config";
import { deriveAppRole } from "@/lib/session";
import { isPhase1Restricted } from "@/lib/rollout";
import { hasDirectReports } from "@/lib/reportees";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { GuideProvider } from "@/components/guide/GuideProvider";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  // An admin-issued password has to be replaced before anything else —
  // but only while passwords are part of signing in. With one-time codes
  // this would strand every seeded user on a screen asking for a password
  // they never use.
  if (REQUIRE_PASSWORD && (await mustChangePassword())) {
    redirect("/change-password?required=1");
  }

  // Admins, PMs, and reporting managers see the approval screens.
  const appRole = deriveAppRole(user.role?.code);
  let showApprovals = false;
  if (isPhase1Restricted(appRole)) {
    const [hasReports, managedProjects] = await Promise.all([
      hasDirectReports(user.id),
      projectsManagedBy(user.id),
    ]);
    showApprovals = hasReports || managedProjects.size > 0;
  } else {
    showApprovals = true;
  }

  return (
    <GuideProvider>
      <div className="flex h-screen overflow-hidden bg-canvas">
        <Sidebar user={user} hasDirectReports={showApprovals} />

        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar user={user} />

        {/* The content column is capped and centred so a 32-inch monitor
            does not stretch a table to two feet wide, and the page gets
            one orchestrated entrance rather than appearing all at once. */}
          <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden px-6 py-6">
            <div className="reveal reveal-1 mx-auto max-w-[1400px] w-full min-w-0">{children}</div>
          </main>
        </div>
      </div>
    </GuideProvider>
  );
}
