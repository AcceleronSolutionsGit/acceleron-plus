// GET /api/me/skills — what I said I can do
// PUT /api/me/skills — set it
//
// Deliberately separate from the admin route. An admin maintaining
// somebody else's record and a person maintaining their own are
// different acts with different risks, and collapsing them into one
// endpoint with a "whose?" parameter is how somebody ends up editing a
// colleague's profile by changing a number in a URL.
//
// This one can only ever reach the caller's own row.

import { NextResponse } from "next/server";
import { identityDb } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { readJson, validationError, serverError } from "@/lib/route-helpers";

export const runtime = "nodejs";

const PROFICIENCY_LABELS: Record<number, string> = {
  1: "Aware",
  2: "Working",
  3: "Proficient",
  4: "Advanced",
  5: "Expert",
};

/**
 * Which employee-master row is mine.
 *
 * Skills hang off the employee master rather than the user account, so
 * somebody who has never been synced from Darwinbox has nowhere to put
 * them. That is a real state, and it should say so rather than fail.
 */
async function myEmployeeId(session: { userId: string; email: string }): Promise<string | null> {
  const user = await identityDb("users")
    .where("id", session.userId)
    .select("darwinbox_ref", "email")
    .first<{ darwinbox_ref: string | null; email: string } | undefined>();

  if (user?.darwinbox_ref) return String(user.darwinbox_ref);

  const byEmail = await identityDb("employee_master")
    .whereRaw("lower(company_email_id) = ?", [String(user?.email ?? session.email).toLowerCase()])
    .select("employee_id")
    .first<{ employee_id: string } | undefined>()
    .catch(() => undefined);

  return byEmail ? String(byEmail.employee_id) : null;
}

export async function GET() {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const employeeId = await myEmployeeId(auth.session);
    if (!employeeId) {
      return NextResponse.json({
        success: true,
        linked: false,
        skills: [],
        message:
          "Your sign-in is not linked to an employee record yet, so there is nowhere to keep your skills. An administrator can link it from People & Roles.",
      });
    }

    const rows = (await identityDb("employee_skills as es")
      .join("skills as s", "s.id", "es.skill_id")
      .where("es.employee_id", employeeId)
      .andWhere("s.is_active", true)
      .select(
        "es.id",
        "es.proficiency",
        "es.years_experience",
        "es.is_primary",
        "s.id as skill_id",
        "s.name",
        "s.category"
      )
      .orderBy([{ column: "es.is_primary", order: "desc" }, { column: "s.name" }])
      .catch(() => [])) as Record<string, unknown>[];

    return NextResponse.json({
      success: true,
      linked: true,
      employeeId,
      skills: rows.map((row) => ({
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
      })),
    });
  } catch (err) {
    return serverError("me.skills.GET", err);
  }
}

export async function PUT(req: Request) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const employeeId = await myEmployeeId(auth.session);
    if (!employeeId) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Your sign-in is not linked to an employee record, so your skills cannot be saved. Ask an administrator to link it.",
        },
        { status: 409 }
      );
    }

    const parsed = await readJson(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.body as Record<string, unknown>;

    if (!Array.isArray(body.skills)) {
      return validationError(['Send a "skills" array, even an empty one.']);
    }

    const errors: string[] = [];
    const rows: Record<string, unknown>[] = [];
    const seen = new Set<string>();

    for (const entry of body.skills as Record<string, unknown>[]) {
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
        errors.push("Proficiency must be a whole number from 1 to 5.");
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
        created_at: new Date(),
        updated_at: new Date(),
      });
    }

    if (errors.length > 0) return validationError([...new Set(errors)]);

    if (rows.length > 0) {
      const known = await identityDb("skills")
        .whereIn("id", [...seen])
        .andWhere("is_active", true)
        .select("id");
      if (known.length !== seen.size) {
        return validationError(["One of those skills is not in the catalogue."]);
      }
    }

    await identityDb.transaction(async (trx) => {
      await trx("employee_skills").where("employee_id", employeeId).del();
      if (rows.length > 0) await trx("employee_skills").insert(rows);
    });

    return NextResponse.json({ success: true, count: rows.length });
  } catch (err) {
    return serverError("me.skills.PUT", err);
  }
}
