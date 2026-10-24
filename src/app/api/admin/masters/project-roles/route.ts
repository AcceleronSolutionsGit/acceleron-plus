import { NextRequest, NextResponse } from "next/server";
import { projectDb } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * GET /api/admin/masters/project-roles
 * Returns all custom project roles (both global and project-specific)
 * along with available active projects.
 */
export async function GET() {
  const auth = await requireRole(["admin", "pm"]);
  if (!auth.ok) return auth.response;

  try {
    const [roles, projects] = await Promise.all([
      projectDb("project_custom_roles as pcr")
        .leftJoin("projects as p", "p.id", "pcr.project_id")
        .select(
          "pcr.id",
          "pcr.project_id",
          "pcr.name",
          "pcr.code",
          "pcr.description",
          "pcr.base_role",
          "pcr.is_active",
          "pcr.created_at",
          "pcr.updated_at",
          "p.code as project_code",
          "p.name as project_name"
        )
        .orderBy("pcr.created_at", "desc"),
      projectDb("projects")
        .whereNull("scrapped_at")
        .whereNotIn("status", ["cancelled", "scrapped"])
        .select("id", "code", "name", "category", "project_type")
        .orderBy("name", "asc"),
    ]);

    return NextResponse.json({
      success: true,
      roles: roles.map((r: any) => ({
        id: r.id,
        projectId: r.project_id,
        projectCode: r.project_code,
        projectName: r.project_name,
        name: r.name,
        code: r.code,
        description: r.description,
        baseRole: r.base_role || "Developer",
        isActive: r.is_active !== false,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
      projects: projects.map((p: any) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        category: p.category,
        projectType: p.project_type,
      })),
    });
  } catch (err) {
    console.error("[admin.masters.project-roles.GET]", err);
    return NextResponse.json({ error: "Failed to fetch custom project roles." }, { status: 500 });
  }
}

/**
 * POST /api/admin/masters/project-roles
 * Create a new custom role (global or project-specific).
 */
export async function POST(req: NextRequest) {
  const auth = await requireRole(["admin"]);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const name = String(body.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ error: "Role name is required." }, { status: 400 });
    }

    const projectId = body.projectId ? String(body.projectId).trim() : null;
    const baseRole = ["Developer", "Team Lead", "PM"].includes(body.baseRole)
      ? body.baseRole
      : "Developer";
    const description = body.description ? String(body.description).trim() : null;
    const isActive = body.isActive !== false;

    // Generate code
    const code = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "role";

    // Check for duplicate in the same scope
    let existingQuery = projectDb("project_custom_roles")
      .whereRaw("lower(name) = ?", [name.toLowerCase()]);
    if (projectId) {
      existingQuery = existingQuery.where("project_id", projectId);
    } else {
      existingQuery = existingQuery.whereNull("project_id");
    }
    const existing = await existingQuery.first();
    if (existing) {
      return NextResponse.json(
        { error: `A role named "${name}" already exists in this scope.` },
        { status: 409 }
      );
    }

    const [created] = await projectDb("project_custom_roles")
      .insert({
        project_id: projectId,
        name,
        code,
        description,
        base_role: baseRole,
        is_active: isActive,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning("*");

    return NextResponse.json({
      success: true,
      role: {
        id: created.id,
        projectId: created.project_id,
        name: created.name,
        code: created.code,
        description: created.description,
        baseRole: created.base_role,
        isActive: created.is_active,
        createdAt: created.created_at,
        updatedAt: created.updated_at,
      },
      message: `Role "${name}" created successfully.`,
    }, { status: 201 });
  } catch (err) {
    console.error("[admin.masters.project-roles.POST]", err);
    return NextResponse.json({ error: "Failed to create custom project role." }, { status: 500 });
  }
}
