import { NextResponse } from "next/server";
import { identityDb, describeSetupError } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { GLOBAL_ROLE_LABELS } from "@/lib/permissions";
import { deriveAppRole } from "@/lib/session";
import { readJson } from "@/lib/route-helpers";

export const runtime = "nodejs";

/**
 * Who can sign in, and as what.
 *
 * Admin only — this is where roles are handed out, so it is the most
 * sensitive screen in the app after the employee master.
 */
export async function GET(req: Request) {
  const auth = await requireRole(["admin"]);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q")?.trim().toLowerCase();
    const roleFilter = searchParams.get("role")?.trim();
    const includeInactive = searchParams.get("includeInactive") === "1";
    // The skills screen works off the employee master rather than the
    // sign-in list: somebody can have skills worth staffing long before
    // they ever log in.
    const includeEmployees = searchParams.get("includeEmployees") === "true";

    let builder = identityDb("users as u")
      .leftJoin("roles as r", "r.id", "u.role_id")
      .leftJoin("employee_master as e", "e.employee_id", "u.darwinbox_ref")
      .select(
        "u.id",
        "u.email",
        "u.full_name",
        "u.is_active",
        "u.darwinbox_ref",
        "u.last_login_at",
        identityDb.ref("r.code").as("role_code"),
        identityDb.ref("r.name").as("role_name"),
        identityDb.ref("e.designation").as("designation"),
        identityDb.ref("e.department").as("darwinbox_department"),
        identityDb.ref("e.internal_department").as("internal_department"),
        identityDb.ref("e.office_location").as("office_location"),
        identityDb.ref("e.job_level").as("job_level")
      )
      .orderBy("u.full_name");

    if (!includeInactive) builder = builder.where("u.is_active", true);
    if (roleFilter) builder = builder.where("r.code", roleFilter);
    if (query) {
      builder = builder.where((q) =>
        q
          .whereRaw("lower(u.email) like ?", [`%${query}%`])
          .orWhereRaw("lower(u.full_name) like ?", [`%${query}%`])
      );
    }

    const [rows, roles] = await Promise.all([
      builder,
      identityDb("roles").select("id", "code", "name", "description").orderBy("code"),
    ]);

    return NextResponse.json({
      success: true,
      users: rows.map((row) => ({
        id: row.id,
        email: row.email,
        fullName: row.full_name,
        isActive: row.is_active,
        darwinboxRef: row.darwinbox_ref,
        lastLoginAt: row.last_login_at,
        roleCode: row.role_code,
        roleName: row.role_name,
        appRole: deriveAppRole(row.role_code),
        designation: row.designation,
        // Prefer the admin-assigned internal_department; fall back to Darwinbox raw value
        department: row.internal_department || row.darwinbox_department || null,
        officeLocation: row.office_location,
        jobLevel: row.job_level,
      })),
      roles,
      roleLabels: GLOBAL_ROLE_LABELS,
      employees: includeEmployees ? await employeeDirectory() : undefined,
    });
  } catch (err) {
    const setup = describeSetupError(err);
    if (setup) return NextResponse.json({ error: setup, setup: true }, { status: 500 });
    console.error("[admin.users.GET]", err);
    return NextResponse.json({ error: "Could not load users." }, { status: 500 });
  }
}

/** Everyone in the employee master, with how many skills are on file. */
async function employeeDirectory() {
  const rows = (await identityDb("employee_master as e")
    .leftJoin("employee_skills as es", "es.employee_id", "e.employee_id")
    .where("e.is_active", true)
    .groupBy("e.employee_id", "e.full_name", "e.company_email_id", "e.designation", "e.department")
    .select(
      "e.employee_id",
      "e.full_name",
      "e.company_email_id",
      "e.designation",
      "e.department"
    )
    .count({ skillCount: "es.id" })
    .orderBy("e.full_name")
    .catch(() => [])) as Record<string, unknown>[];

  return rows.map((row) => ({
    employeeId: String(row.employee_id),
    fullName: row.full_name ? String(row.full_name) : String(row.employee_id),
    email: row.company_email_id ? String(row.company_email_id) : null,
    designation: row.designation ? String(row.designation) : null,
    department: row.department ? String(row.department) : null,
    skillCount: Number(row.skillCount ?? 0),
  }));
}

/**
 * Change someone's role, or activate/deactivate them.
 *
 * PATCH { userId, roleCode?, isActive? }
 */
export async function PATCH(req: Request) {
  const auth = await requireRole(["admin"]);
  if (!auth.ok) return auth.response;

  const parsed = await readJson(req);
  if (!parsed.ok) return parsed.response;

  const body = parsed.body as { userId?: unknown; roleCode?: unknown; isActive?: unknown };
  const userId = typeof body.userId === "string" ? body.userId : "";
  const roleCode = typeof body.roleCode === "string" ? body.roleCode.trim() : undefined;
  const isActive = typeof body.isActive === "boolean" ? body.isActive : undefined;

  if (!userId) {
    return NextResponse.json({ error: "userId is required." }, { status: 400 });
  }
  if (roleCode === undefined && isActive === undefined) {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  }

  try {
    const target = await identityDb("users as u")
      .leftJoin("roles as r", "r.id", "u.role_id")
      .select("u.id", "u.email", "u.full_name", "u.is_active", identityDb.ref("r.code").as("role_code"))
      .where("u.id", userId)
      .first();

    if (!target) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const update: Record<string, unknown> = {};

    if (roleCode !== undefined) {
      const role = await identityDb("roles").where("code", roleCode).first();
      if (!role) {
        return NextResponse.json({ error: `Unknown role "${roleCode}".` }, { status: 400 });
      }

      // Don't let the last administrator remove their own access and
      // lock everyone out of role management.
      if (target.role_code === "admin" && roleCode !== "admin") {
        const admins = await identityDb("users as u")
          .join("roles as r", "r.id", "u.role_id")
          .where("r.code", "admin")
          .andWhere("u.is_active", true)
          .count("* as n")
          .first<{ n: string }>();

        if (Number(admins?.n ?? 0) <= 1) {
          return NextResponse.json(
            { error: "This is the only active administrator. Promote someone else first." },
            { status: 409 }
          );
        }
      }
      update.role_id = role.id;
    }

    if (isActive !== undefined) {
      if (!isActive && target.id === auth.session.userId) {
        return NextResponse.json(
          { error: "You cannot deactivate your own account." },
          { status: 409 }
        );
      }
      if (!isActive && target.role_code === "admin") {
        const admins = await identityDb("users as u")
          .join("roles as r", "r.id", "u.role_id")
          .where("r.code", "admin")
          .andWhere("u.is_active", true)
          .count("* as n")
          .first<{ n: string }>();
        if (Number(admins?.n ?? 0) <= 1) {
          return NextResponse.json(
            { error: "This is the only active administrator. Promote someone else first." },
            { status: 409 }
          );
        }
      }
      update.is_active = isActive;
    }

    // A change of role or status should bite immediately, not in 8 hours.
    try {
      if (await identityDb.schema.hasColumn("users", "sessions_valid_from")) {
        update.sessions_valid_from = new Date();
      }
    } catch {
      // Column check is best-effort.
    }

    await identityDb("users").where("id", userId).update(update);

    try {
      await identityDb("login_audit").insert({
        user_id: userId,
        email: target.email,
        success: true,
        reason: `role_changed_by:${auth.session.email}${roleCode ? ` to:${roleCode}` : ""}${
          isActive !== undefined ? ` active:${isActive}` : ""
        }`,
      });
    } catch {
      // Auditing is best-effort.
    }

    return NextResponse.json({
      success: true,
      userId,
      roleCode: roleCode ?? target.role_code,
      isActive: isActive ?? target.is_active,
      message:
        roleCode !== undefined
          ? `${target.full_name || target.email} is now ${GLOBAL_ROLE_LABELS[deriveAppRole(roleCode)]?.name ?? roleCode}.`
          : `${target.full_name || target.email} is now ${isActive ? "active" : "inactive"}.`,
    });
  } catch (err) {
    const setup = describeSetupError(err);
    if (setup) return NextResponse.json({ error: setup, setup: true }, { status: 500 });
    console.error("[admin.users.PATCH]", err);
    return NextResponse.json({ error: "Could not update the user." }, { status: 500 });
  }
}
