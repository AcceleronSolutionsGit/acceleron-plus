import { NextResponse } from "next/server";
import { projectDb } from "@/lib/db";
import { requireProjectCapability, can } from "@/lib/auth";
import { readJson, validationError, serverError, withoutTeamCost } from "@/lib/route-helpers";
import { plannedCostFor, allocationPictureFor, describeOverallocation } from "@/lib/staffing";
import { toDateInput } from "@/lib/dates";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string; memberId: string }> };

// ─── PATCH — change an assignment ──────────────────────────────────

export async function PATCH(req: Request, context: Params) {
  try {
    const { id, memberId } = await context.params;
    const guard = await requireProjectCapability(id, "team.manage");
    if (!guard.ok) return guard.response;
    const { project } = guard;

    const existing = await projectDb("project_team_members")
      .where({ id: memberId, project_id: project.id })
      .first<Record<string, unknown> | undefined>();
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "That person is not on this project." },
        { status: 404 }
      );
    }

    const parsed = await readJson(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.body as Record<string, unknown>;

    const updates: Record<string, unknown> = { updated_at: new Date() };
    const errors: string[] = [];

    if (body.roleInProject !== undefined) {
      const role = String(body.roleInProject).trim();
      if (role.length > 120) errors.push("The project role is too long.");
      updates.role_in_project = role || null;
    }

    if (body.allocationPercent !== undefined) {
      const allocation = Number(body.allocationPercent);
      if (!Number.isFinite(allocation) || allocation <= 0 || allocation > 100) {
        errors.push("Allocation must be between 1 and 100 percent.");
      } else {
        updates.allocation_percent = allocation;
      }
    }

    if (body.startDate !== undefined) updates.start_date = toDateInput(body.startDate as string) || null;
    if (body.endDate !== undefined) updates.end_date = toDateInput(body.endDate as string) || null;
    if (body.notes !== undefined) updates.notes = String(body.notes).trim() || null;
    if (body.isActive !== undefined) updates.is_active = Boolean(body.isActive);

    if (body.plannedDays !== undefined && body.plannedDays !== null) {
      const days = Number(body.plannedDays);
      if (!Number.isFinite(days) || days < 0 || days > 10000) {
        errors.push("Planned days must be a number between 0 and 10000.");
      }
    }

    // Moving somebody to a different band re-prices the assignment from
    // that band's current rate. The old figures are replaced on purpose:
    // the change is a decision, not a drift.
    if (body.rateBandId !== undefined) {
      if (body.rateBandId === null || body.rateBandId === "") {
        updates.rate_band_id = null;
        updates.rate_band_name = null;
        updates.daily_cost_inr = null;
        updates.daily_billable_rate_inr = null;
      } else {
        const band = await projectDb("employee_rate_bands")
          .where({ id: String(body.rateBandId), is_active: true })
          .first<Record<string, unknown> | undefined>();
        if (!band) {
          errors.push("That rate band does not exist or is no longer active.");
        } else {
          updates.rate_band_id = String(band.id);
          updates.rate_band_name = String(band.band_name ?? "");
          updates.daily_cost_inr = Number(band.daily_cost_inr ?? 0);
          updates.daily_billable_rate_inr =
            band.daily_billable_rate_inr === null || band.daily_billable_rate_inr === undefined
              ? null
              : Number(band.daily_billable_rate_inr);
        }
      }
    }

    const start = (updates.start_date ?? toDateInput(existing.start_date as string)) as string | null;
    const end = (updates.end_date ?? toDateInput(existing.end_date as string)) as string | null;
    if (start && end && end < start) {
      errors.push("The end date cannot fall before the start date.");
    }

    if (errors.length > 0) return validationError(errors);
    if (Object.keys(updates).length === 1) {
      return validationError(["No editable fields were supplied."]);
    }

    // Widening the dates or raising the allocation can collide with
    // other projects just as adding somebody can. The row being edited
    // is excluded so it is not compared against its own old value.
    const nextAllocation =
      (updates.allocation_percent as number) ?? Number(existing.allocation_percent ?? 100);
    const stillActive = updates.is_active === undefined ? existing.is_active !== false : updates.is_active;

    if (existing.employee_id && stillActive) {
      const picture = await allocationPictureFor(String(existing.employee_id), {
        allocationPercent: nextAllocation,
        startDate: start,
        endDate: end,
        excludeProjectId: project.id,
        excludeMemberId: memberId,
      });

      if (picture.overAllocated && body.allowOverallocation !== true) {
        return NextResponse.json(
          {
            success: false,
            error: describeOverallocation(
              String(existing.user_name ?? "That person"),
              picture
            ),
            overAllocation: picture,
            resolution: "allowOverallocation",
          },
          { status: 409 }
        );
      }
    }

    // Anything that moves the dates, the allocation or the rate moves
    // the planned cost with it, or the two quietly disagree.
    const planned = plannedCostFor({
      startDate: start,
      endDate: end,
      allocationPercent:
        (updates.allocation_percent as number) ?? Number(existing.allocation_percent ?? 100),
      dailyCostInr:
        updates.daily_cost_inr !== undefined
          ? (updates.daily_cost_inr as number | null)
          : (existing.daily_cost_inr as number | null),
      dailyBillableRateInr:
        updates.daily_billable_rate_inr !== undefined
          ? (updates.daily_billable_rate_inr as number | null)
          : (existing.daily_billable_rate_inr as number | null),
      plannedDays: body.plannedDays === undefined ? null : Number(body.plannedDays),
    });
    updates.planned_days = planned.plannedDays;
    updates.planned_cost_inr = planned.plannedCostInr;
    updates.planned_billable_inr = planned.plannedBillableInr;

    const [updated] = await projectDb("project_team_members")
      .where({ id: memberId, project_id: project.id })
      .update(updates)
      .returning("*");

    return NextResponse.json({
      success: true,
      member: can(guard.access, "team.viewCost") ? updated : withoutTeamCost(updated),
    });
  } catch (err) {
    return serverError("team.item.PATCH", err);
  }
}

// ─── DELETE — take somebody off ────────────────────────────────────

export async function DELETE(_req: Request, context: Params) {
  try {
    const { id, memberId } = await context.params;
    const guard = await requireProjectCapability(id, "team.manage");
    if (!guard.ok) return guard.response;
    const { project } = guard;

    const existing = await projectDb("project_team_members")
      .where({ id: memberId, project_id: project.id })
      .first<Record<string, unknown> | undefined>();
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "That person is not on this project." },
        { status: 404 }
      );
    }

    // Time already booked against the project is a financial record.
    // Removing the row would orphan it and quietly change the cost
    // history, so somebody who has logged time is stood down instead.
    const logged = await projectDb("project_timesheets")
      .where({ project_id: project.id, user_id: String(existing.user_id) })
      .count("* as n")
      .first<{ n: string }>()
      .catch(() => ({ n: "0" }));

    if (Number(logged?.n ?? 0) > 0) {
      const [updated] = await projectDb("project_team_members")
        .where({ id: memberId, project_id: project.id })
        .update({ is_active: false, updated_at: new Date() })
        .returning("*");

      return NextResponse.json({
        success: true,
        member: updated,
        standDown: true,
        message: `${existing.user_name ?? "They"} logged ${logged!.n} timesheet entries here, so they have been marked inactive rather than removed. The hours and their cost are kept.`,
      });
    }

    await projectDb("project_team_members").where({ id: memberId, project_id: project.id }).del();
    return NextResponse.json({ success: true, deletedId: memberId });
  } catch (err) {
    return serverError("team.item.DELETE", err);
  }
}
