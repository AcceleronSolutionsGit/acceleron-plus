import { NextResponse } from "next/server";
import { projectDb } from "@/lib/db";
import { requireProjectCapability } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const guard = await requireProjectCapability(id, "financials.view");
    if (!guard.ok) return guard.response;
    const projectId = guard.project.id;

    const costs = await projectDb("project_additional_costs")
      .where("project_id", projectId)
      .orderBy("created_at", "asc");

    const mapped = costs.map((c) => ({
      id: c.id,
      projectId: c.project_id,
      category: c.category,
      description: c.description,
      plannedAmountInr: parseFloat(c.planned_amount_inr || 0),
      actualAmountInr: parseFloat(c.actual_amount_inr || 0),
      status: c.status,
      notes: c.notes,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
    }));

    return NextResponse.json({ success: true, costs: mapped });
  } catch (err: any) {
    console.error("additional-costs.GET", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const guard = await requireProjectCapability(id, "financials.view");
    if (!guard.ok) return guard.response;
    const projectId = guard.project.id;
    const projectCode = guard.project.code;

    const body = await req.json();
    const {
      category = "other",
      description,
      plannedAmountInr = 0,
      actualAmountInr = 0,
      status = "planned",
      notes = null,
    } = body;

    if (!description || !description.trim()) {
      return NextResponse.json(
        { success: false, error: "Description is required" },
        { status: 400 }
      );
    }

    const [created] = await projectDb("project_additional_costs")
      .insert({
        project_id: projectId,
        category: category.trim(),
        description: description.trim(),
        planned_amount_inr: Number(plannedAmountInr) || 0,
        actual_amount_inr: Number(actualAmountInr) || 0,
        status: status || "planned",
        notes: notes ? String(notes).trim() : null,
      })
      .returning("*");

    revalidatePath(`/pmt/${projectId}`);
    revalidatePath(`/pmt/${projectCode}`);

    return NextResponse.json({
      success: true,
      cost: {
        id: created.id,
        projectId: created.project_id,
        category: created.category,
        description: created.description,
        plannedAmountInr: parseFloat(created.planned_amount_inr || 0),
        actualAmountInr: parseFloat(created.actual_amount_inr || 0),
        status: created.status,
        notes: created.notes,
        createdAt: created.created_at,
        updatedAt: created.updated_at,
      },
    });
  } catch (err: any) {
    console.error("additional-costs.POST", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
