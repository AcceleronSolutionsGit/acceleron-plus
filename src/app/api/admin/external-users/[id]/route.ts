import { NextResponse } from "next/server";
import { identityDb, projectDb } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { readJson } from "@/lib/route-helpers";
import { toDateInput } from "@/lib/dates";

export const runtime = "nodejs";

/**
 * GET /api/admin/external-users/[id]
 * Returns single user info with their roles, project allocations, and available roles/projects.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(["admin", "pm"]);
  if (!auth.ok) return auth.response;

  const { id: userId } = await params;
  if (!userId) {
    return NextResponse.json({ error: "User ID is required." }, { status: 400 });
  }

  try {
    const user = await identityDb("users as u")
      .leftJoin("roles as r", "r.id", "u.role_id")
      .where("u.id", userId)
      .whereNull("u.darwinbox_ref")
      .select(
        "u.id",
        "u.email",
        "u.full_name",
        "u.mobile_phone",
        "u.is_active",
        "u.created_at",
        "u.last_login_at",
        identityDb.ref("r.code").as("primary_role_code"),
        identityDb.ref("r.name").as("primary_role_name")
      )
      .first();

    if (!user) {
      return NextResponse.json({ error: "Non-Darwinbox user not found." }, { status: 404 });
    }

    const [userRoles, allRoles, activeProjects, allocations] = await Promise.all([
      identityDb("user_roles")
        .join("roles", "roles.id", "user_roles.role_id")
        .where("user_roles.user_id", userId)
        .select("roles.id", "roles.code", "roles.name"),
      identityDb("roles")
        .select("id", "code", "name", "description")
        .where("is_active", true)
        .orderBy("name", "asc"),
      projectDb("projects")
        .select("id", "code", "name", "status", "category", "project_type", "start_date", "planned_end_date", "actual_end_date", "currency")
        .whereNotIn("status", ["cancelled", "scrapped"])
        .orderBy("name", "asc"),
      projectDb("project_team_members as ptm")
        .join("projects as p", "p.id", "ptm.project_id")
        .where("ptm.user_id", userId)
        .select(
          "ptm.id",
          "ptm.project_id",
          "ptm.role_in_project",
          "ptm.member_type",
          "ptm.allocation_percent",
          "ptm.custom_daily_cost_inr",
          "ptm.start_date",
          "ptm.end_date",
          "ptm.notes",
          "ptm.is_active",
          identityDb.ref("p.code").as("project_code"),
          identityDb.ref("p.name").as("project_name"),
          identityDb.ref("p.status").as("project_status"),
          identityDb.ref("p.category").as("project_category"),
          identityDb.ref("p.project_type").as("project_type")
        )
        .orderBy("ptm.is_active", "desc")
        .orderBy("ptm.created_at", "desc"),
    ]);

    const roleCodes = userRoles.length > 0
      ? userRoles.map((r) => r.code)
      : (user.primary_role_code ? [user.primary_role_code] : ["member"]);
    const roleNames = userRoles.length > 0
      ? userRoles.map((r) => r.name)
      : (user.primary_role_name ? [user.primary_role_name] : ["Member"]);

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        mobilePhone: user.mobile_phone,
        isActive: user.is_active,
        createdAt: user.created_at,
        lastLoginAt: user.last_login_at,
        roleCodes,
        roleNames,
        allocations: allocations.map((a) => ({
          id: a.id,
          projectId: a.project_id,
          projectCode: a.project_code,
          projectName: a.project_name,
          projectStatus: a.project_status,
          projectCategory: a.project_category,
          projectType: a.project_type,
          roleInProject: a.role_in_project,
          memberType: a.member_type || "consultant",
          allocationPercent: Number(a.allocation_percent ?? 100),
          customDailyCostInr: a.custom_daily_cost_inr !== null ? Number(a.custom_daily_cost_inr) : null,
          startDate: a.start_date,
          endDate: a.end_date,
          notes: a.notes,
          isActive: a.is_active,
        })),
      },
      roles: allRoles,
      projects: activeProjects.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        status: p.status,
        category: p.category,
        projectType: p.project_type,
        startDate: p.start_date ? toDateInput(p.start_date) : null,
        endDate: p.planned_end_date ? toDateInput(p.planned_end_date) : (p.actual_end_date ? toDateInput(p.actual_end_date) : null),
        currency: p.currency || "INR",
      })),
    });
  } catch (err) {
    console.error("[admin.external-users.id.GET]", err);
    return NextResponse.json({ error: "Could not load user details." }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/external-users/[id]
 * Deletes a non-Darwinbox user account and removes allocations.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(["admin"]);
  if (!auth.ok) return auth.response;

  const { id: userId } = await params;
  if (!userId) {
    return NextResponse.json({ error: "User ID is required." }, { status: 400 });
  }

  if (userId === auth.session.userId) {
    return NextResponse.json({ error: "You cannot delete your own account." }, { status: 409 });
  }

  try {
    const user = await identityDb("users").where("id", userId).first();
    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    if (user.darwinbox_ref) {
      return NextResponse.json(
        { error: "This is a Darwinbox employee account. Employees cannot be deleted here." },
        { status: 403 }
      );
    }

    // Check if user is lead PM on active projects
    const pmProject = await projectDb("projects")
      .where("project_manager_user_id", userId)
      .whereNotIn("status", ["closed", "cancelled", "scrapped"])
      .first("id", "code", "name");

    if (pmProject) {
      return NextResponse.json(
        {
          error: `Cannot delete ${user.full_name} because they are assigned as Lead Project Manager on active project ${pmProject.name} (${pmProject.code}). Please reassign the PM first.`,
        },
        { status: 409 }
      );
    }

    // Remove project allocations
    await projectDb("project_team_members").where("user_id", userId).delete();

    // Remove user roles
    await identityDb("user_roles").where("user_id", userId).delete();

    // Remove OTPs if table exists
    try {
      await identityDb("otps").where("user_id", userId).delete();
    } catch {
      // Best-effort
    }

    // Delete user record
    await identityDb("users").where("id", userId).delete();

    return NextResponse.json({
      success: true,
      message: `User ${user.full_name} has been deleted successfully.`,
    });
  } catch (err) {
    console.error("[admin.external-users.id.DELETE]", err);
    return NextResponse.json({ error: "Could not delete user." }, { status: 500 });
  }
}
