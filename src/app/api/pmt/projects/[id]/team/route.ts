import { NextResponse } from "next/server";
import { projectDb, identityDb } from "@/lib/db";
import { requireProjectCapability, can } from "@/lib/auth";
import {
  readJson,
  validationError,
  serverError,
  withoutTeamCost,
  pmAssignmentRefused,
  TEAM_ROLE_REQUIRED,
} from "@/lib/route-helpers";
import { canAssignProjectManagers } from "@/lib/permissions";
import { TEAM_ROLES, TEAM_ROLE_DESCRIPTIONS, PM, DEVELOPER, toTeamRole } from "@/lib/team-roles";
import {
  getProjectTeam,
  teamTotals,
  listRateBands,
  plannedCostFor,
  commitmentsFor,
  allocationPictureFor,
  describeOverallocation,
  suggestBandFor,
  describeBandSource,
  parseAllocationPeriods,
} from "@/lib/staffing";
import { rateForMargin } from "@/lib/margin";
import { toDateInput } from "@/lib/dates";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

// ─── GET — the team, and what it costs if you may see that ─────────

export async function GET(req: Request, context: Params) {
  try {
    const { id } = await context.params;
    const guard = await requireProjectCapability(id, "team.view");
    if (!guard.ok) return guard.response;

    const includeCost = can(guard.access, "team.viewCost");
    const url = new URL(req.url);
    const includeInactive = url.searchParams.get("includeInactive") === "true";

    const team = await getProjectTeam(guard.project.id, { includeCost, includeInactive });

    // What else each of these people is committed to (check both employeeId and userId)
    const allIdentifiers = Array.from(
      new Set([
        ...team.map((m) => m.employeeId ?? "").filter(Boolean),
        ...team.map((m) => m.userId ?? "").filter(Boolean),
      ])
    );

    const elsewhere = await commitmentsFor(allIdentifiers, {
      excludeProjectId: guard.project.id,
    });

    const withLoad = team.map((member) => {
      const others =
        (member.employeeId ? elsewhere.get(member.employeeId) : null) ||
        (member.userId ? elsewhere.get(member.userId) : null) ||
        [];
      const overlapping = others.filter((c) =>
        // Same overlap rule as the guard, applied to this member's window.
        !((c.endDate && member.startDate && c.endDate < member.startDate) ||
          (member.endDate && c.startDate && member.endDate < c.startDate))
      );
      const committedElsewhere = overlapping.reduce((sum, c) => sum + c.allocationPercent, 0);
      return {
        ...member,
        otherProjects: overlapping,
        committedElsewhere,
        totalAllocation: committedElsewhere + member.allocationPercent,
        overAllocated: committedElsewhere + member.allocationPercent > 100,
      };
    });

    // Custom roles for this project or global
    const customRolesRows = await projectDb("project_custom_roles")
      .where({ is_active: true })
      .andWhere(function () {
        this.whereNull("project_id").orWhere("project_id", guard.project.id);
      })
      .orderBy("name", "asc")
      .catch(() => []);

    const customRoles = customRolesRows.map((r: Record<string, unknown>) => ({
      value: String(r.name || r.role_name || ""),
      description: String(r.description || "Custom project role"),
      isCustom: true,
      projectId: r.project_id ? String(r.project_id) : null,
    }));

    const standardRoles = TEAM_ROLES.map((role) => ({
      value: role,
      description: TEAM_ROLE_DESCRIPTIONS[role],
      isCustom: false,
      projectId: null,
    }));

    const seenRoleValues = new Set<string>();
    const rolesList: Array<{ value: string; description: string; isCustom?: boolean; projectId?: string | null }> = [];
    for (const r of [...standardRoles, ...customRoles]) {
      const key = r.value.trim().toLowerCase();
      if (!seenRoleValues.has(key)) {
        seenRoleValues.add(key);
        rolesList.push(r);
      }
    }

    return NextResponse.json({
      success: true,
      team: withLoad,
      totals: includeCost ? teamTotals(team) : null,
      projectStartDate: guard.project.start_date ? String(guard.project.start_date).slice(0, 10) : null,
      projectEndDate: (guard.project.planned_end_date || guard.project.actual_end_date)
        ? String(guard.project.planned_end_date || guard.project.actual_end_date).slice(0, 10)
        : null,
      currency: guard.project.currency || "INR",
      // Bands are what the "add someone" form needs; a person who
      // cannot see cost gets the names without the rates.
      rateBands: includeCost
        ? await listRateBands()
        : (await listRateBands()).map(({ id: bandId, bandName, levelCode }) => ({
            id: bandId,
            bandName,
            levelCode,
            dailyCostInr: null,
            dailyBillableRateInr: null,
          })),
      canManage: can(guard.access, "team.manage"),
      canViewCost: includeCost,
      roles: rolesList,
      canAssignPm: canAssignProjectManagers(guard.access),
    });
  } catch (err) {
    return serverError("team.GET", err);
  }
}

// ─── POST — staff somebody ─────────────────────────────────────────

export async function POST(req: Request, context: Params) {
  try {
    const { id } = await context.params;
    const guard = await requireProjectCapability(id, "team.manage");
    if (!guard.ok) return guard.response;
    const { project } = guard;

    const parsed = await readJson(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.body as Record<string, unknown>;

    let isExternalUser = Boolean(body.isExternal || body.isNewExternal);
    let resolvedUserId: string | null = null;
    let personName: string = "";
    let employeeRecord: Record<string, unknown> | null = null;

    if (body.isNewExternal || (isExternalUser && body.fullName && body.email)) {
      // Create or find external user on the fly
      const fullName = String(body.fullName ?? "").trim();
      const email = String(body.email ?? "").trim().toLowerCase();
      const mobilePhone = body.mobilePhone ? String(body.mobilePhone).trim() : null;

      if (!fullName || !email) {
        return validationError(["Full name and email are required for an external resource."]);
      }

      let existingUser = await identityDb("users")
        .whereRaw("lower(email) = ?", [email])
        .first<{ id: string; full_name: string; email: string } | undefined>();

      if (!existingUser) {
        const defaultRole = await identityDb("roles")
          .where("code", "consultant")
          .orWhere("code", "member")
          .first();

        const [createdUser] = await identityDb("users")
          .insert({
            tenant_id: process.env.DEFAULT_TENANT_ID || "10000000-0000-0000-0000-000000000001",
            email,
            full_name: fullName,
            mobile_phone: mobilePhone,
            role_id: defaultRole?.id ?? null,
            darwinbox_ref: null, // explicit non-Darwinbox user
            is_active: true,
          })
          .returning("*");

        existingUser = createdUser;
      }

      if (!existingUser) {
        return validationError(["Could not register external user."]);
      }

      resolvedUserId = String(existingUser.id);
      personName = String(existingUser.full_name || fullName);
      isExternalUser = true;
    } else {
      const idOrEmployeeId = String(body.employeeId || body.userId || "").trim();
      if (!idOrEmployeeId) {
        return validationError(["Choose a person from the directory or add an external resource."]);
      }

      // Check employee_master first (Darwinbox)
      const employee = await identityDb("employee_master")
        .where("employee_id", idOrEmployeeId)
        .first<Record<string, unknown> | undefined>();

      if (employee) {
        employeeRecord = employee;
        personName = String(employee.full_name ?? idOrEmployeeId);
        resolvedUserId = await resolveUserId(employee);
      } else {
        // Check identity_db.users (non-Darwinbox external user)
        const extUser = await identityDb("users")
          .where("id", idOrEmployeeId)
          .first<{ id: string; full_name: string; email: string } | undefined>();

        if (extUser) {
          resolvedUserId = String(extUser.id);
          personName = extUser.full_name;
          isExternalUser = true;
        } else {
          return validationError(["That person was not found in the employee master or external users list."]);
        }
      }
    }

    // One row per person per project
    const existing = await projectDb("project_team_members")
      .where({ project_id: project.id })
      .andWhere(function () {
        if (resolvedUserId) this.where("user_id", resolvedUserId);
        if (employeeRecord?.employee_id) this.orWhere("employee_id", String(employeeRecord.employee_id));
      })
      .first();
    if (existing) {
      return NextResponse.json(
        {
          success: false,
          error: `${personName || "That person"} is already on this project.`,
        },
        { status: 409 }
      );
    }

    const validation = validateAssignment(body);
    // Developer, Team Lead or PM or any custom project role. Blank is Developer.
    const roleRaw = String(body.roleInProject ?? "").trim();
    let role: string | null = roleRaw ? toTeamRole(roleRaw) : (isExternalUser ? "Consultant" : DEVELOPER);
    if (!role && roleRaw) {
      // Check if it's an active custom role
      const customRole = await projectDb("project_custom_roles")
        .where(function () {
          this.whereRaw("lower(name) = ?", [roleRaw.toLowerCase()])
            .orWhereRaw("lower(code) = ?", [roleRaw.toLowerCase()]);
        })
        .andWhere({ is_active: true })
        .andWhere(function () {
          this.whereNull("project_id").orWhere("project_id", project.id);
        })
        .first()
        .catch(() => null);
      if (customRole) {
        role = customRole.name || customRole.code;
      }
    }
    if (!role) validation.push(TEAM_ROLE_REQUIRED);
    if (validation.length > 0) return validationError(validation);
    if (role === PM && !canAssignProjectManagers(guard.access)) return pmAssignmentRefused();

    let band = await resolveBand(body.rateBandId);
    if (body.rateBandId && !band) {
      return validationError(["That rate band does not exist or is no longer active."]);
    }

    // No band chosen? Their grade decides it if Darwinbox employee.
    let bandNote: string | null = null;
    if (!band && employeeRecord) {
      const suggestion = suggestBandFor(employeeRecord as { job_level?: string | null }, await listRateBands());
      bandNote = describeBandSource(suggestion);
      band = {
        id: suggestion.rateBandId ?? "",
        bandName: suggestion.bandName,
        dailyCostInr: suggestion.dailyCostInr,
        dailyBillableRateInr: suggestion.dailyBillableRateInr,
      };
    } else if (isExternalUser && !band) {
      bandNote = "Non-Darwinbox external resource (custom CTC / daily cost)";
    }

    // Default dates from project if not explicitly supplied
    const projectStart = project.start_date ? toDateInput(String(project.start_date)) : null;
    const projectEnd = (project.planned_end_date || project.actual_end_date)
      ? toDateInput(String(project.planned_end_date || project.actual_end_date))
      : null;

    let startDate = toDateInput(body.startDate as string) || projectStart || null;
    let endDate = toDateInput(body.endDate as string) || projectEnd || null;
    let allocationPercent = Number(body.allocationPercent ?? 100);
    const allocationPeriods = parseAllocationPeriods(body.allocationPeriods);
    const hasPeriods = Boolean(allocationPeriods && allocationPeriods.length > 0);

    if (hasPeriods && allocationPeriods) {
      const pStarts = allocationPeriods.map((p) => p.startDate).filter(Boolean).sort();
      const pEnds = allocationPeriods.map((p) => p.endDate).filter(Boolean).sort();
      if (pStarts.length > 0) startDate = pStarts[0];
      if (pEnds.length > 0) endDate = pEnds[pEnds.length - 1];
      const sumAlloc = allocationPeriods.reduce((sum, p) => sum + Number(p.allocationPercent || 0), 0);
      if (sumAlloc > 0) allocationPercent = sumAlloc;
    }

    // Allocation is a claim on somebody's whole week, not just this project's
    const identifierForAllocation = employeeRecord?.employee_id
      ? String(employeeRecord.employee_id)
      : (resolvedUserId || "");
    const picture = await allocationPictureFor(identifierForAllocation, {
      allocationPercent,
      startDate,
      endDate,
      excludeProjectId: project.id,
    });

    if (picture.overAllocated && body.allowOverallocation !== true) {
      return NextResponse.json(
        {
          success: false,
          error: describeOverallocation(personName || "That person", picture),
          overAllocation: picture,
          resolution: "allowOverallocation",
        },
        { status: 409 }
      );
    }

    const memberType = ["intern", "consultant"].includes(String(body.memberType))
      ? (String(body.memberType) as "intern" | "consultant")
      : isExternalUser
      ? "consultant"
      : "employee";

    const customDailyCostInr =
      body.customDailyCostInr !== undefined && body.customDailyCostInr !== null && body.customDailyCostInr !== ""
        ? Number(body.customDailyCostInr)
        : null;

    const effectiveDailyCost = customDailyCostInr !== null ? customDailyCostInr : (band?.dailyCostInr ?? null);

    let effectiveBillableRate =
      body.dailyBillableRateInr !== undefined && body.dailyBillableRateInr !== null && body.dailyBillableRateInr !== ""
        ? Number(body.dailyBillableRateInr)
        : (band?.dailyBillableRateInr ?? null);

    if (
      effectiveBillableRate === null &&
      effectiveDailyCost !== null &&
      project.target_margin_percent !== null &&
      project.target_margin_percent !== undefined
    ) {
      const derived = rateForMargin(effectiveDailyCost, Number(project.target_margin_percent));
      if (derived !== null) {
        effectiveBillableRate = derived;
      }
    }

    const planned = plannedCostFor({
      startDate,
      endDate,
      allocationPercent,
      allocationPeriods,
      dailyCostInr: effectiveDailyCost,
      dailyBillableRateInr: effectiveBillableRate,
      plannedDays: hasPeriods ? null : (body.plannedDays === undefined ? null : Number(body.plannedDays)),
    });

    const [member] = await projectDb("project_team_members")
      .insert({
        project_id: project.id,
        user_id: resolvedUserId,
        employee_id: employeeRecord?.employee_id ? String(employeeRecord.employee_id) : null,
        user_name: personName || null,
        rate_band_id: band?.id || null,
        rate_band_name: band?.bandName ?? null,
        role_in_project: role,
        allocation_percent: allocationPercent,
        start_date: startDate,
        end_date: endDate,
        allocation_periods: allocationPeriods ? JSON.stringify(allocationPeriods) : null,
        daily_cost_inr: effectiveDailyCost,
        daily_billable_rate_inr: effectiveBillableRate,
        member_type: memberType,
        custom_daily_cost_inr: customDailyCostInr,
        planned_days: planned.plannedDays,
        planned_cost_inr: planned.plannedCostInr,
        planned_billable_inr: planned.plannedBillableInr,
        notes: String(body.notes ?? "").trim() || null,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning("*");

    return NextResponse.json(
      {
        success: true,
        // Rates and planned cost only for the project's PM and admins.
        member: can(guard.access, "team.viewCost") ? member : withoutTeamCost(member),
        // Echoed so the screen can say "now at 130%" even when the PM
        // chose to go ahead.
        allocation: picture,
        // Set when the band came from their grade rather than a choice.
        // It quotes the default day rate, so it is money too.
        bandNote: can(guard.access, "team.viewCost") ? bandNote : null,
      },
      { status: 201 }
    );
  } catch (err) {
    return serverError("team.POST", err);
  }
}

// ─── helpers ───────────────────────────────────────────────────────

function validateAssignment(body: Record<string, unknown>): string[] {
  const errors: string[] = [];

  if (body.allocationPercent !== undefined) {
    const allocation = Number(body.allocationPercent);
    if (!Number.isFinite(allocation) || allocation <= 0 || allocation > 100) {
      errors.push("Allocation must be between 1 and 100 percent.");
    }
  }

  const start = toDateInput(body.startDate as string);
  const end = toDateInput(body.endDate as string);
  if (start && end && end < start) {
    errors.push("The end date cannot fall before the start date.");
  }

  if (body.plannedDays !== undefined && body.plannedDays !== null) {
    const days = Number(body.plannedDays);
    if (!Number.isFinite(days) || days < 0 || days > 10000) {
      errors.push("Planned days must be a number between 0 and 10000.");
    }
  }


  return errors;
}

async function resolveBand(rateBandId: unknown) {
  if (!rateBandId) return null;
  const row = await projectDb("employee_rate_bands")
    .where({ id: String(rateBandId), is_active: true })
    .first<Record<string, unknown> | undefined>();
  if (!row) return null;
  return {
    id: String(row.id),
    bandName: String(row.band_name ?? ""),
    dailyCostInr: Number(row.daily_cost_inr ?? 0),
    dailyBillableRateInr:
      row.daily_billable_rate_inr === null || row.daily_billable_rate_inr === undefined
        ? null
        : Number(row.daily_billable_rate_inr),
  };
}

/**
 * Timesheets and permissions key off identity_db.users.id. Somebody
 * staffed onto a project may never have signed in, so fall back to the
 * employee id rather than refusing to staff them.
 */
async function resolveUserId(employee: Record<string, unknown>): Promise<string> {
  const email = String(employee.company_email_id ?? "").trim().toLowerCase();
  if (email) {
    const user = await identityDb("users")
      .whereRaw("lower(email) = ?", [email])
      .first<{ id: string } | undefined>()
      .catch(() => undefined);
    if (user) return String(user.id);
  }
  return String(employee.employee_id);
}
