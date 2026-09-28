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
} from "@/lib/staffing";
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

    // What else each of these people is committed to, so the screen can
    // flag anybody carrying more than a full week across the portfolio.
    const elsewhere = await commitmentsFor(
      team.map((m) => m.employeeId ?? "").filter(Boolean),
      { excludeProjectId: guard.project.id }
    );

    const withLoad = team.map((member) => {
      const others = member.employeeId ? (elsewhere.get(member.employeeId) ?? []) : [];
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

    return NextResponse.json({
      success: true,
      team: withLoad,
      totals: includeCost ? teamTotals(team) : null,
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
      // The three roles a team member can hold, and whether this person
      // may hand out (or take away) the PM one.
      roles: TEAM_ROLES.map((role) => ({ value: role, description: TEAM_ROLE_DESCRIPTIONS[role] })),
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

    const employeeId = String(body.employeeId ?? "").trim();
    if (!employeeId) {
      return validationError(["Choose somebody from the employee master."]);
    }

    const employee = await identityDb("employee_master")
      .where("employee_id", employeeId)
      .first<Record<string, unknown> | undefined>();
    if (!employee) {
      return validationError(["That employee is not in the master. Run the Darwinbox sync first."]);
    }

    // One row per person per project — the table enforces it, but a
    // clear message beats a constraint violation.
    const existing = await projectDb("project_team_members")
      .where({ project_id: project.id })
      .andWhere(function () {
        this.where("employee_id", employeeId).orWhere("user_id", employeeId);
      })
      .first();
    if (existing) {
      return NextResponse.json(
        {
          success: false,
          error: `${employee.full_name ?? "That person"} is already on this project.`,
        },
        { status: 409 }
      );
    }

    const validation = validateAssignment(body);
    // Developer, Team Lead or PM — any number of each. Blank is Developer.
    const roleRaw = String(body.roleInProject ?? "").trim();
    const role = roleRaw ? toTeamRole(roleRaw) : DEVELOPER;
    if (!role) validation.push(TEAM_ROLE_REQUIRED);
    if (validation.length > 0) return validationError(validation);
    if (role === PM && !canAssignProjectManagers(guard.access)) return pmAssignmentRefused();

    let band = await resolveBand(body.rateBandId);
    if (body.rateBandId && !band) {
      return validationError(["That rate band does not exist or is no longer active."]);
    }

    // No band chosen? Their grade decides it. Asking a PM to pick one by
    // hand is a chance to get it wrong, and a chance to price the same
    // grade two ways on two projects.
    let bandNote: string | null = null;
    if (!band) {
      const suggestion = suggestBandFor(employee as { job_level?: string | null }, await listRateBands());
      bandNote = describeBandSource(suggestion);
      band = {
        id: suggestion.rateBandId ?? "",
        bandName: suggestion.bandName,
        dailyCostInr: suggestion.dailyCostInr,
        dailyBillableRateInr: suggestion.dailyBillableRateInr,
      };
    }

    const startDate = toDateInput(body.startDate as string) || null;
    const endDate = toDateInput(body.endDate as string) || null;
    const allocationPercent = Number(body.allocationPercent ?? 100);

    // Allocation is a claim on somebody's whole week, not just this
    // project's. Putting them at 50% here when they are already at 80%
    // elsewhere is usually a mistake — so it is refused once, with the
    // clashes named, and allowed only if the PM says so deliberately.
    const picture = await allocationPictureFor(employeeId, {
      allocationPercent,
      startDate,
      endDate,
      excludeProjectId: project.id,
    });

    if (picture.overAllocated && body.allowOverallocation !== true) {
      return NextResponse.json(
        {
          success: false,
          error: describeOverallocation(
            String(employee.full_name ?? "That person"),
            picture
          ),
          overAllocation: picture,
          // The client re-sends with this set once somebody has read the
          // clash and still wants it.
          resolution: "allowOverallocation",
        },
        { status: 409 }
      );
    }

    const planned = plannedCostFor({
      startDate,
      endDate,
      allocationPercent,
      dailyCostInr: band?.dailyCostInr ?? null,
      dailyBillableRateInr: band?.dailyBillableRateInr ?? null,
      plannedDays: body.plannedDays === undefined ? null : Number(body.plannedDays),
    });

    // The identity row is how permissions and timesheets find them; it
    // may not exist for somebody who has never signed in.
    const userId = await resolveUserId(employee);

    const [member] = await projectDb("project_team_members")
      .insert({
        project_id: project.id,
        user_id: userId,
        employee_id: employeeId,
        user_name: employee.full_name ?? null,
        rate_band_id: band?.id || null,
        rate_band_name: band?.bandName ?? null,
        role_in_project: role,
        allocation_percent: allocationPercent,
        start_date: startDate,
        end_date: endDate,
        daily_cost_inr: band?.dailyCostInr ?? null,
        daily_billable_rate_inr: band?.dailyBillableRateInr ?? null,
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
