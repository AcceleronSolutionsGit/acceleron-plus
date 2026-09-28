import { NextResponse } from "next/server";
import { identityDb } from "@/lib/db";
import { requireSession, requireCapabilityGlobally } from "@/lib/auth";
import { readJson, validationError, serverError } from "@/lib/route-helpers";

export const runtime = "nodejs";

/**
 * The skill catalogue.
 *
 * This sits outside /api/admin on purpose. The proxy reserves that
 * prefix for admins, but a PM staffing a project needs the list to
 * filter by — a skill name is not sensitive. Writing still needs
 * skill.manage, which the handlers below check for themselves.
 */
export async function GET(req: Request) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const url = new URL(req.url);
    const includeInactive = url.searchParams.get("includeInactive") === "true";

    let query = identityDb("skills as s")
      .leftJoin("employee_skills as es", "es.skill_id", "s.id")
      .groupBy("s.id")
      .select("s.id", "s.name", "s.category", "s.description", "s.is_active")
      .count({ peopleCount: "es.id" })
      .orderBy([{ column: "s.category" }, { column: "s.name" }]);

    if (!includeInactive) query = query.where("s.is_active", true);

    const rows = (await query) as Record<string, unknown>[];

    return NextResponse.json({
      success: true,
      skills: rows.map((row) => ({
        id: String(row.id),
        name: String(row.name ?? ""),
        category: row.category ? String(row.category) : null,
        description: row.description ? String(row.description) : null,
        isActive: row.is_active !== false,
        peopleCount: Number(row.peopleCount ?? 0),
      })),
    });
  } catch (err) {
    return serverError("skills.GET", err);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireCapabilityGlobally("skill.manage");
    if (!auth.ok) return auth.response;

    const parsed = await readJson(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.body as Record<string, unknown>;

    const name = String(body.name ?? "").trim();
    if (!name) return validationError(["A skill needs a name."]);
    if (name.length > 120) return validationError(["That skill name is too long."]);

    const clash = await identityDb("skills").whereRaw("lower(name) = ?", [name.toLowerCase()]).first();
    if (clash) {
      return NextResponse.json(
        { success: false, error: `"${name}" is already in the catalogue.` },
        { status: 409 }
      );
    }

    const [skill] = await identityDb("skills")
      .insert({
        name,
        category: String(body.category ?? "").trim() || null,
        description: String(body.description ?? "").trim() || null,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning("*");

    return NextResponse.json({ success: true, skill }, { status: 201 });
  } catch (err) {
    return serverError("skills.POST", err);
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await requireCapabilityGlobally("skill.manage");
    if (!auth.ok) return auth.response;

    const parsed = await readJson(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.body as Record<string, unknown>;

    const skillId = String(body.skillId ?? "").trim();
    if (!skillId) return validationError(["Which skill?"]);

    const updates: Record<string, unknown> = { updated_at: new Date() };
    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) return validationError(["A skill needs a name."]);
      updates.name = name;
    }
    if (body.category !== undefined) updates.category = String(body.category).trim() || null;
    if (body.description !== undefined) updates.description = String(body.description).trim() || null;
    // Retiring a skill keeps the history: people who hold it keep their
    // rows, it simply stops being offered.
    if (body.isActive !== undefined) updates.is_active = Boolean(body.isActive);

    if (Object.keys(updates).length === 1) {
      return validationError(["No editable fields were supplied."]);
    }

    const changed = await identityDb("skills").where("id", skillId).update(updates);
    if (changed === 0) {
      return NextResponse.json({ success: false, error: "Skill not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return serverError("skills.PATCH", err);
  }
}
