import { Metadata } from "next";
import { requireSession } from "@/lib/auth";
import { identityDb, itsmDb } from "@/lib/db";
import { ItsmGroupFormClient } from "@/app/(app)/itsm/masters/groups/ItsmGroupFormClient";
import { notFound, redirect } from "next/navigation";

export const metadata: Metadata = { title: "Edit ITSM Group" };

export default async function EditItsmGroupPage({ params }: { params: { id: string } }) {
  const auth = await requireSession();
  if (!auth.ok) redirect("/auth/sign-in");

  const group = await itsmDb("service_groups").where({ id: params.id }).first();
  if (!group) return notFound();

  const members = await itsmDb("service_group_members").where({ group_id: params.id }).select("user_id");

  const users = await identityDb("users")
    .where("is_active", true)
    .select("id", "full_name as fullName", "email")
    .orderBy("full_name");

  const groupData = {
    id: group.id,
    name: group.name,
    description: group.description,
    teamLeadUserId: group.team_lead_user_id,
    members: members.map(m => m.user_id),
  };

  return (
    <main className="p-4 sm:p-8 max-w-4xl mx-auto min-h-screen">
      <ItsmGroupFormClient users={users} initialData={groupData} />
    </main>
  );
}
