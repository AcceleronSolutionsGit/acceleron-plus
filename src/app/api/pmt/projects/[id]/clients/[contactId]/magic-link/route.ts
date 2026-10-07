import { NextRequest, NextResponse } from "next/server";
import { projectDb } from "@/lib/db";
import { requireProjectCapability } from "@/lib/auth";
import crypto from "crypto";

export async function POST(
  req: NextRequest, 
  { params }: { params: Promise<{ id: string, contactId: string }> }
) {
  const { id, contactId } = await params;
  const guard = await requireProjectCapability(id, "project.edit");
  if (!guard.ok) return guard.response;

  const contact = await projectDb("project_client_contacts")
    .where({ id: contactId, project_id: guard.project.id })
    .first();

  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  const token = crypto.randomUUID();
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 72); // 72 hours

  const [link] = await projectDb("client_magic_links").insert({
    project_id: guard.project.id,
    client_contact_id: contact.id,
    client_email: contact.email,
    token,
    expires_at: expiresAt,
    issued_by_user_id: guard.session.userId
  }).returning("*");

  return NextResponse.json({ success: true, link });
}

export async function DELETE(
  req: NextRequest, 
  { params }: { params: Promise<{ id: string, contactId: string }> }
) {
  const { id, contactId } = await params;
  const guard = await requireProjectCapability(id, "project.edit");
  if (!guard.ok) return guard.response;

  const { searchParams } = new URL(req.url);
  const linkId = searchParams.get("linkId");

  if (!linkId) {
    return NextResponse.json({ error: "linkId is required" }, { status: 400 });
  }

  await projectDb("client_magic_links")
    .where({ id: linkId, client_contact_id: contactId })
    .update({ is_revoked: true });

  return NextResponse.json({ success: true });
}
