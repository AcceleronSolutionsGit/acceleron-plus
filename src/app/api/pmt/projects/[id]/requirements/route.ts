import { NextResponse } from "next/server";
import { projectDb, identityDb } from "@/lib/db";
import { requireProjectCapability } from "@/lib/auth";
import type { Requirement, RequirementFolder } from "@/lib/types";
import { serverError } from "@/lib/route-helpers";

export const runtime = "nodejs";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const guard = await requireProjectCapability(id, "plan.view");
    if (!guard.ok) return guard.response;

    const [rawRequirements, folders] = await Promise.all([
      projectDb("requirements")
        .where("project_id", guard.project.id)
        .orderBy("created_at", "asc"),
      projectDb("requirement_folders")
        .where("project_id", guard.project.id)
        .orderBy("name", "asc"),
    ]);

    // Attach owners
    const userIds = [...new Set(rawRequirements.map(r => r.owner_user_id).filter(Boolean))];
    let usersMap: Record<string, any> = {};
    if (userIds.length > 0) {
      const users = await identityDb("users")
        .whereIn("id", userIds)
        .select("id", "first_name", "last_name", "email", "job_level", "designation");
      usersMap = Object.fromEntries(
        users.map(u => [
          u.id, 
          {
            id: u.id,
            firstName: u.first_name,
            lastName: u.last_name,
            fullName: `${u.first_name} ${u.last_name}`,
            email: u.email,
            jobLevel: u.job_level,
            designation: u.designation,
          }
        ])
      );
    }

    const requirements = rawRequirements.map(r => ({
      id: r.id,
      projectId: r.project_id,
      folderId: r.folder_id,
      title: r.title,
      description: r.description,
      state: r.state,
      priority: r.priority,
      type: r.type,
      ownerUserId: r.owner_user_id,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      owner: r.owner_user_id ? usersMap[r.owner_user_id] : undefined,
    })) as Requirement[];

    const reqFolders = folders.map(f => ({
      id: f.id,
      projectId: f.project_id,
      parentId: f.parent_id,
      name: f.name,
      createdAt: f.created_at,
      updatedAt: f.updated_at,
    })) as RequirementFolder[];

    return NextResponse.json({ success: true, requirements, folders: reqFolders });
  } catch (err) {
    return serverError("requirements.GET", err);
  }
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const guard = await requireProjectCapability(id, "plan.create"); // Or a new permission "qa.manage"
    if (!guard.ok) return guard.response;

    const body = await req.json().catch(() => null);
    if (!body || !body.title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const [newItem] = await projectDb("requirements")
      .insert({
        project_id: guard.project.id,
        folder_id: body.folderId || null,
        title: body.title,
        description: body.description || null,
        state: body.state || "draft",
        priority: body.priority || "medium",
        type: body.type || "functional",
        owner_user_id: body.ownerUserId || null,
      })
      .returning("*");

    return NextResponse.json({ success: true, requirement: {
      id: newItem.id,
      projectId: newItem.project_id,
      folderId: newItem.folder_id,
      title: newItem.title,
      description: newItem.description,
      state: newItem.state,
      priority: newItem.priority,
      type: newItem.type,
      ownerUserId: newItem.owner_user_id,
      createdAt: newItem.created_at,
      updatedAt: newItem.updated_at,
    } }, { status: 201 });
  } catch (err) {
    return serverError("requirements.POST", err);
  }
}
