import { Metadata } from "next";
import { requireSession } from "@/lib/auth";
import { identityDb } from "@/lib/db";
import { ItsmGroupFormClient } from "@/app/(app)/itsm/masters/groups/ItsmGroupFormClient";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "New ITSM Group" };

export default async function NewItsmGroupPage() {
  const auth = await requireSession();
  if (!auth.ok) redirect("/auth/sign-in");

  const users = await identityDb("users")
    .where("is_active", true)
    .select("id", "full_name as fullName", "email")
    .orderBy("full_name");

  return (
    <main className="p-4 sm:p-8 max-w-4xl mx-auto min-h-screen">
      <ItsmGroupFormClient users={users} />
    </main>
  );
}
