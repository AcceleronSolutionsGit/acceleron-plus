import { NextResponse } from "next/server";
import { identityDb, projectDb, describeSetupError } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { readJson } from "@/lib/route-helpers";

export const runtime = "nodejs";

/**
 * GET /api/admin/external-users
 * Lists all users managed outside of Darwinbox (darwinbox_ref is null)
 * along with their assigned roles and project allocations.
 */
export async function GET(req: Request) {
  const auth = await requireRole(["admin", "pm"]);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q")?.trim().toLowerCase();
    const roleFilter = searchParams.get("role")?.trim();
    const includeInactive = searchParams.get("includeInactive") === "1";

    let userQuery = identityDb("users as u")
      .leftJoin("roles as r", "r.id", "u.role_id")
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
      .orderBy("u.full_name", "asc");

    if (!includeInactive) {
      userQuery = userQuery.where("u.is_active", true);
    }

    if (query) {
      userQuery = userQuery.where((q) =>
        q
          .whereRaw("lower(u.email) like ?", [`%${query}%`])
          .orWhereRaw("lower(u.full_name) like ?", [`%${query}%`])
      );
    }

    const [userRows, allRoles, allUserRoles, activeProjects] = await Promise.all([
      userQuery,
      identityDb("roles")
        .select("id", "code", "name", "description")
        .where("is_active", true)
        .orderBy("name", "asc"),
      identityDb("user_roles")
        .join("roles", "roles.id", "user_roles.role_id")
        .select("user_roles.user_id", "roles.code", "roles.name"),
      projectDb("projects")
        .select("id", "code", "name", "status", "category", "project_type", "start_date", "planned_end_date", "actual_end_date", "currency")
        .whereNotIn("status", ["cancelled", "scrapped"])
        .orderBy("name", "asc"),
    ]);

    // Map user roles
    const userRolesMap = new Map<string, { code: string; name: string }[]>();
    for (const ur of allUserRoles) {
      if (!userRolesMap.has(ur.user_id)) userRolesMap.set(ur.user_id, []);
      userRolesMap.get(ur.user_id)!.push({ code: ur.code, name: ur.name });
    }

    const userIds = userRows.map((u) => u.id);

    // Fetch team allocations for these users
    const teamRows = userIds.length > 0
      ? await projectDb("project_team_members as ptm")
          .join("projects as p", "p.id", "ptm.project_id")
          .whereIn("ptm.user_id", userIds)
          .where("ptm.is_active", true)
          .select(
            "ptm.id",
            "ptm.project_id",
            "ptm.user_id",
            "ptm.role_in_project",
            "ptm.member_type",
            "ptm.allocation_percent",
            "ptm.custom_daily_cost_inr",
            "ptm.daily_cost_inr",
            "ptm.daily_billable_rate_inr",
            "ptm.start_date",
            "ptm.end_date",
            "ptm.is_active",
            identityDb.ref("p.code").as("project_code"),
            identityDb.ref("p.name").as("project_name"),
            identityDb.ref("p.status").as("project_status"),
            identityDb.ref("p.category").as("project_category"),
            identityDb.ref("p.project_type").as("project_type")
          )
      : [];

    const allocationsByUser = new Map<string, typeof teamRows>();
    for (const row of teamRows) {
      const uid = String(row.user_id);
      if (!allocationsByUser.has(uid)) allocationsByUser.set(uid, []);
      allocationsByUser.get(uid)!.push(row);
    }

    let users = userRows.map((row) => {
      const uRoles = userRolesMap.get(row.id) || [];
      const roleCodes = uRoles.length > 0
        ? uRoles.map((r) => r.code)
        : (row.primary_role_code ? [row.primary_role_code] : ["member"]);
      const roleNames = uRoles.length > 0
        ? uRoles.map((r) => r.name)
        : (row.primary_role_name ? [row.primary_role_name] : ["Member"]);

      const allocations = (allocationsByUser.get(row.id) || []).map((a) => ({
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
        customDailyCostInr: a.custom_daily_cost_inr !== null ? Number(a.custom_daily_cost_inr) : (a.daily_cost_inr !== null ? Number(a.daily_cost_inr) : null),
        dailyBillableRateInr: a.daily_billable_rate_inr !== null ? Number(a.daily_billable_rate_inr) : null,
        startDate: a.start_date,
        endDate: a.end_date,
        isActive: a.is_active,
      }));

      return {
        id: row.id,
        email: row.email,
        fullName: row.full_name,
        mobilePhone: row.mobile_phone,
        isActive: row.is_active,
        createdAt: row.created_at,
        lastLoginAt: row.last_login_at,
        roleCodes,
        roleNames,
        primaryRoleCode: roleCodes[0] || "member",
        primaryRoleName: roleNames[0] || "Member",
        allocations,
        allocationCount: allocations.length,
        totalAllocationPercent: allocations.reduce((sum, a) => sum + a.allocationPercent, 0),
      };
    });

    if (roleFilter && roleFilter !== "all") {
      users = users.filter((u) => u.roleCodes.includes(roleFilter));
    }

    return NextResponse.json({
      success: true,
      users,
      roles: allRoles,
      projects: activeProjects.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        status: p.status,
        category: p.category,
        projectType: p.project_type,
        startDate: p.start_date ? String(p.start_date).slice(0, 10) : null,
        endDate: p.planned_end_date ? String(p.planned_end_date).slice(0, 10) : (p.actual_end_date ? String(p.actual_end_date).slice(0, 10) : null),
        currency: p.currency || "INR",
      })),
    });
  } catch (err) {
    const setup = describeSetupError(err);
    if (setup) return NextResponse.json({ error: setup, setup: true }, { status: 500 });
    console.error("[admin.external-users.GET]", err);
    return NextResponse.json({ error: "Could not load external users." }, { status: 500 });
  }
}

/**
 * POST /api/admin/external-users
 * Creates a new user outside Darwinbox with specified role(s).
 */
export async function POST(req: Request) {
  const auth = await requireRole(["admin"]);
  if (!auth.ok) return auth.response;

  const parsed = await readJson(req);
  if (!parsed.ok) return parsed.response;

  const body = parsed.body as {
    fullName?: string;
    email?: string;
    mobilePhone?: string;
    roleCodes?: string[];
  };

  const fullName = body.fullName?.trim();
  const email = body.email?.trim().toLowerCase();
  const mobilePhone = body.mobilePhone?.trim() || null;
  const roleCodes = Array.isArray(body.roleCodes) && body.roleCodes.length > 0
    ? body.roleCodes.map(String)
    : ["member"];

  if (!fullName || !email) {
    return NextResponse.json({ error: "Full name and email are required." }, { status: 400 });
  }

  try {
    const existing = await identityDb("users").whereRaw("lower(email) = ?", [email]).first();
    if (existing) {
      return NextResponse.json({ error: `A user with email "${email}" already exists.` }, { status: 409 });
    }

    const dbRoles = await identityDb("roles").whereIn("code", roleCodes);
    const primaryRole = dbRoles.find((r) => r.code === roleCodes[0]) || dbRoles[0];

    const [newUser] = await identityDb("users")
      .insert({
        tenant_id: process.env.DEFAULT_TENANT_ID || "10000000-0000-0000-0000-000000000001",
        email,
        full_name: fullName,
        mobile_phone: mobilePhone,
        role_id: primaryRole?.id ?? null,
        darwinbox_ref: null, // explicit non-Darwinbox user
        is_active: true,
      })
      .returning("*");

    if (dbRoles.length > 0) {
      await identityDb("user_roles").insert(
        dbRoles.map((r) => ({
          user_id: newUser.id,
          role_id: r.id,
        }))
      );
    }

    return NextResponse.json({
      success: true,
      user: {
        id: newUser.id,
        email: newUser.email,
        fullName: newUser.full_name,
        roleCodes: dbRoles.map((r) => r.code),
        roleNames: dbRoles.map((r) => r.name),
      },
      message: `User ${fullName} created successfully.`,
    });
  } catch (err) {
    console.error("[admin.external-users.POST]", err);
    return NextResponse.json({ error: "Could not create external user." }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/external-users
 * Updates non-Darwinbox user info, status, or roles.
 */
export async function PATCH(req: Request) {
  const auth = await requireRole(["admin"]);
  if (!auth.ok) return auth.response;

  const parsed = await readJson(req);
  if (!parsed.ok) return parsed.response;

  const body = parsed.body as {
    userId?: string;
    fullName?: string;
    email?: string;
    mobilePhone?: string;
    roleCodes?: string[];
    isActive?: boolean;
  };

  const userId = body.userId?.trim();
  if (!userId) {
    return NextResponse.json({ error: "userId is required." }, { status: 400 });
  }

  try {
    const target = await identityDb("users").where("id", userId).first();
    if (!target) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date(),
    };

    if (body.fullName !== undefined) updates.full_name = body.fullName.trim();
    if (body.email !== undefined) updates.email = body.email.trim().toLowerCase();
    if (body.mobilePhone !== undefined) updates.mobile_phone = body.mobilePhone.trim() || null;
    if (body.isActive !== undefined) updates.is_active = body.isActive;

    if (body.roleCodes !== undefined && Array.isArray(body.roleCodes)) {
      const dbRoles = body.roleCodes.length > 0
        ? await identityDb("roles").whereIn("code", body.roleCodes)
        : [];
      const primaryRole = dbRoles.find((r) => r.code === body.roleCodes![0]) || dbRoles[0];
      updates.role_id = primaryRole?.id ?? null;

      await identityDb("user_roles").where("user_id", userId).delete();
      if (dbRoles.length > 0) {
        await identityDb("user_roles").insert(
          dbRoles.map((r) => ({
            user_id: userId,
            role_id: r.id,
          }))
        );
      }
    }

    await identityDb("users").where("id", userId).update(updates);

    return NextResponse.json({
      success: true,
      message: "User updated successfully.",
    });
  } catch (err) {
    console.error("[admin.external-users.PATCH]", err);
    return NextResponse.json({ error: "Could not update user." }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/external-users
 * Deletes a non-Darwinbox user account.
 */
export async function DELETE(req: Request) {
  const auth = await requireRole(["admin"]);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId")?.trim();
  if (!userId) {
    return NextResponse.json({ error: "userId is required." }, { status: 400 });
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

    await projectDb("project_team_members").where("user_id", userId).delete();
    await identityDb("user_roles").where("user_id", userId).delete();

    try {
      await identityDb("otps").where("user_id", userId).delete();
    } catch {
      // Best-effort
    }

    await identityDb("users").where("id", userId).delete();

    return NextResponse.json({
      success: true,
      message: `User ${user.full_name} has been deleted successfully.`,
    });
  } catch (err) {
    console.error("[admin.external-users.DELETE]", err);
    return NextResponse.json({ error: "Could not delete user." }, { status: 500 });
  }
}

