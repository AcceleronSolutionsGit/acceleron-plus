import { NextResponse } from "next/server";
import { itsmDb } from "@/lib/db";
import { requireSession } from "@/lib/auth";

export const runtime = "nodejs";

let tableEnsured = false;
async function ensureServiceGroupMembers() {
  if (tableEnsured) return;
  try {
    const exists = await itsmDb.schema.hasTable("service_group_members");
    if (!exists) {
      await itsmDb.schema.createTable("service_group_members", (t) => {
        t.uuid("group_id").notNullable().references("id").inTable("service_groups").onDelete("CASCADE");
        t.uuid("user_id").notNullable();
        t.primary(["group_id", "user_id"]);
        t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(itsmDb.fn.now());
      });
      console.log("✚ Auto-created service_group_members table.");
    }
    tableEnsured = true;
  } catch (err) {
    console.warn("Could not ensure service_group_members table:", err);
  }
}

export async function GET() {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  try {
    await ensureServiceGroupMembers();

    const groups = await itsmDb("service_groups").select("*").orderBy("name");
    
    let members: Array<{ group_id: string; user_id: string }> = [];
    try {
      members = await itsmDb("service_group_members").select("*");
    } catch (e: unknown) {
      const dbErr = e as { code?: string };
      if (dbErr?.code === "42P01") {
        await ensureServiceGroupMembers();
        try {
          members = await itsmDb("service_group_members").select("*");
        } catch {
          members = [];
        }
      } else {
        throw e;
      }
    }

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
    await ensureServiceGroupMembers();
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
