import { NextResponse } from "next/server";
import { identityDb } from "@/lib/db";
import { requireSession, requireCapabilityGlobally } from "@/lib/auth";
import { readJson, validationError, serverError } from "@/lib/route-helpers";

export const runtime = "nodejs";

type Params = { params: Promise<{ employeeId: string }> };

export const PROFICIENCY_LABELS: Record<number, string> = {
  1: "Aware",
  2: "Working",
  3: "Proficient",
  4: "Advanced",
  5: "Expert",
};

// ─── GET — one person's skills ─────────────────────────────────────

export async function GET(_req: Request, context: Params) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const { employeeId } = await context.params;

    const rows = (await identityDb("employee_skills as es")
      .join("skills as s", "s.id", "es.skill_id")
      .where("es.employee_id", employeeId)
      .select(
        "es.id",
        "es.proficiency",
        "es.years_experience",
        "es.is_primary",
        "es.last_used_on_project",
        "s.id as skill_id",
        "s.name",
        "s.category",
        "s.is_active"
      )
      .orderBy([
        { column: "es.is_primary", order: "desc" },
        { column: "s.name" },
      ])) as Record<string, unknown>[];

    return NextResponse.json({
      success: true,
      skills: rows.map((row) => ({
        id: String(row.id),
        skillId: String(row.skill_id),
        name: String(row.name ?? ""),
        category: row.category ? String(row.category) : null,
        proficiency: Number(row.proficiency ?? 3),
        proficiencyLabel: PROFICIENCY_LABELS[Number(row.proficiency ?? 3)] ?? "Proficient",
        yearsExperience:
          row.years_experience === null || row.years_experience === undefined
            ? null
            : Number(row.years_experience),
        isPrimary: Boolean(row.is_primary),
        lastUsedOnProject: row.last_used_on_project ? String(row.last_used_on_project) : null,
        skillRetired: row.is_active === false,
      })),
    });
  } catch (err) {
    return serverError("employeeSkills.GET", err);
  }
}

// ─── PUT — set them, replacing what was there ──────────────────────

export async function PUT(req: Request, context: Params) {
  try {
    const auth = await requireCapabilityGlobally("skill.manage");
    if (!auth.ok) return auth.response;

    const { employeeId } = await context.params;

    const employee = await identityDb("employee_master")
      .where("employee_id", employeeId)
      .first<{ employee_id: string } | undefined>();
    if (!employee) {
      return NextResponse.json(
        { success: false, error: "That employee is not in the master." },
        { status: 404 }
      );
    }

    const parsed = await readJson(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.body as Record<string, unknown>;

    if (!Array.isArray(body.skills)) {
      return validationError(['Send a "skills" array, even an empty one.']);
    }

    const incoming = body.skills as Record<string, unknown>[];
    const errors: string[] = [];
    const rows: Record<string, unknown>[] = [];
    const seen = new Set<string>();

    for (const entry of incoming) {
      const skillId = String(entry.skillId ?? "").trim();
      if (!skillId) {
        errors.push("Every entry needs a skillId.");
        continue;
      }
      if (seen.has(skillId)) {
        errors.push("The same skill was listed twice.");
        continue;
      }
      seen.add(skillId);

      const proficiency = Number(entry.proficiency ?? 3);
      if (!Number.isInteger(proficiency) || proficiency < 1 || proficiency > 5) {
        errors.push("Proficiency must be a whole number from 1 (aware) to 5 (expert).");
        continue;
      }

      const years = entry.yearsExperience;
      if (years !== undefined && years !== null && years !== "") {
        const value = Number(years);
        if (!Number.isFinite(value) || value < 0 || value > 60) {
          errors.push("Years of experience must be between 0 and 60.");
          continue;
        }
      }

      rows.push({
        employee_id: employeeId,
        skill_id: skillId,
        proficiency,
        years_experience:
          years === undefined || years === null || years === "" ? null : Number(years),
        is_primary: Boolean(entry.isPrimary),
        last_used_on_project: String(entry.lastUsedOnProject ?? "").trim() || null,
        created_at: new Date(),
        updated_at: new Date(),
      });
    }

    if (errors.length > 0) return validationError([...new Set(errors)]);

    if (rows.length > 0) {
      const known = await identityDb("skills")
        .whereIn("id", [...seen])
        .select("id");
      if (known.length !== seen.size) {
        return validationError(["One of those skills is not in the catalogue."]);
      }
    }

    // Replace wholesale inside a transaction: a half-applied skill set
    // is worse than the old one.
    await identityDb.transaction(async (trx) => {
      await trx("employee_skills").where("employee_id", employeeId).del();
      if (rows.length > 0) await trx("employee_skills").insert(rows);
    });

    return NextResponse.json({ success: true, count: rows.length });
  } catch (err) {
    return serverError("employeeSkills.PUT", err);
  }
}
