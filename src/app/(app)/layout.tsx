import React from "react";
import { redirect } from "next/navigation";
import { getCurrentUser, mustChangePassword } from "@/lib/auth";
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

  // Only a Phase 1 member's sidebar depends on this — admins and PMs
  // always see the approval screens — so nobody else pays for the lookup.
  const showApprovals = isPhase1Restricted(deriveAppRole(user.role?.code))
    ? await hasDirectReports(user.id)
    : false;

  return (
    <GuideProvider>
      <div className="flex h-screen overflow-hidden bg-canvas">
        <Sidebar user={user} hasDirectReports={showApprovals} />

        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar user={user} />

        {/* The content column is capped and centred so a 32-inch monitor
            does not stretch a table to two feet wide, and the page gets
            one orchestrated entrance rather than appearing all at once. */}
          <main className="flex-1 overflow-y-auto px-6 py-6">
            <div className="reveal reveal-1 mx-auto max-w-[1400px]">{children}</div>
          </main>
        </div>
      </div>
    </GuideProvider>
  );
}
