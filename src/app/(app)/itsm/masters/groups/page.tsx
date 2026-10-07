import { Metadata } from "next";
import { requireSession } from "@/lib/auth";
import { identityDb } from "@/lib/db";
import { ItsmGroupsClient } from "./ItsmGroupsClient";
import { notFound, redirect } from "next/navigation";

export const metadata: Metadata = { title: "ITSM Groups Master" };

export default async function ItsmGroupsPage() {
  const auth = await requireSession();
  if (!auth.ok) redirect("/auth/sign-in");

  // Restrict to admins or specific roles
  const allRoles = [auth.session.role, ...(auth.session.additionalRoleCodes || [])];
  if (!allRoles.includes("admin") && !allRoles.includes("sales") && !allRoles.includes("ticket_handler")) {
    return notFound();
  }

  const users = await identityDb("users")
    .where("is_active", true)
    .select("id", "full_name as fullName", "email")
    .orderBy("full_name");

  return (
    <main className="p-4 sm:p-8 max-w-7xl mx-auto min-h-screen">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-navy-900 tracking-tight font-[family-name:var(--font-league-spartan)]">
          ITSM Assignment Groups
        </h1>
        <p className="text-sm text-navy-500 font-medium mt-1">
          Manage support groups, map team leads, and configure members.
        </p>
      </div>
      <ItsmGroupsClient users={users} />
    </main>
  );
}
