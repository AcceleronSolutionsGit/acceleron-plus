import { NextRequest, NextResponse } from "next/server";
import { projectDb } from "@/lib/db";
import { requireProjectCapability } from "@/lib/auth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireProjectCapability(id, "project.view");
  if (!guard.ok) return guard.response;
  
  const contacts = await projectDb("project_client_contacts")
    .where("project_id", guard.project.id)
    .orderBy("created_at", "desc");

  // Fetch magic links
  const contactIds = contacts.map((c: any) => c.id);
  const links = contactIds.length > 0 
    ? await projectDb("client_magic_links")
        .whereIn("client_contact_id", contactIds)
        .where("is_revoked", false)
        .orderBy("created_at", "desc")
    : [];

  const groupedLinks = links.reduce((acc: any, link: any) => {
    if (!acc[link.client_contact_id]) {
      acc[link.client_contact_id] = [];
    }
    acc[link.client_contact_id].push(link);
    return acc;
  }, {});

  const data = contacts.map((c: any) => ({
    ...c,
    magicLinks: groupedLinks[c.id] || []
  }));

  return NextResponse.json({ success: true, data });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireProjectCapability(id, "project.edit");
  if (!guard.ok) return guard.response;

  const body = await req.json();
  const { name, email, designation, phone, isPrimary } = body;

  if (!name || !email) {
    return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
  }

  const [contact] = await projectDb("project_client_contacts").insert({
    project_id: guard.project.id,
    name,
    email,
    designation,
    phone,
    is_primary: isPrimary || false
  }).returning("*");

  return NextResponse.json({ success: true, contact });
}
