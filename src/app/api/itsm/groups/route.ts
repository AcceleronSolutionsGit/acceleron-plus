import { NextResponse } from "next/server";
import { itsmDb } from "@/lib/db";
import { requireSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  try {
    const groups = await itsmDb("service_groups").select("*").orderBy("name");
    const members = await itsmDb("service_group_members").select("*");

    const result = groups.map(g => ({
      id: g.id,
      name: g.name,
      description: g.description,
      teamLeadUserId: g.team_lead_user_id,
      members: members.filter(m => m.group_id === g.id).map(m => m.user_id)
    }));

    return NextResponse.json({ groups: result });
  } catch (error) {
    console.error("Failed to fetch groups:", error);
    return NextResponse.json({ error: "Failed to fetch groups" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  // Ideally verify capability for masters.manage or similar here
  // if (!auth.session.additionalRoles?.includes("admin") && auth.session.role !== "admin") {
  //   return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  // }

  try {
    const body = await req.json();
    const { id, name, description, teamLeadUserId, members } = body;
    
    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    let groupId = id;
    if (id) {
      await itsmDb("service_groups").where({ id }).update({
        name,
        description,
        team_lead_user_id: teamLeadUserId || null,
        updated_at: new Date()
      });
    } else {
      const [newGroup] = await itsmDb("service_groups").insert({
        name,
        description,
        team_lead_user_id: teamLeadUserId || null,
        tenant_id: auth.session.tenantId
      }).returning("id");
      groupId = newGroup?.id || newGroup;
    }

    // Update members
    await itsmDb("service_group_members").where({ group_id: groupId }).del();
    if (members && Array.isArray(members) && members.length > 0) {
      const inserts = members.map(m => ({ group_id: groupId, user_id: m }));
      await itsmDb("service_group_members").insert(inserts);
    }

    return NextResponse.json({ success: true, groupId });
  } catch (error) {
    console.error("Failed to save group:", error);
    return NextResponse.json({ error: "Failed to save group" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    await itsmDb("service_groups").where({ id }).del();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete group:", error);
    return NextResponse.json({ error: "Failed to delete group" }, { status: 500 });
  }
}
