import { NextResponse } from "next/server";
import { projectDb } from "@/lib/db";
import { requireProjectCapability } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string; costId: string }> }
) {
  try {
    const { id, costId } = await context.params;
    const guard = await requireProjectCapability(id, "financials.view");
    if (!guard.ok) return guard.response;
    const projectId = guard.project.id;
    const projectCode = guard.project.code;

    const existing = await projectDb("project_additional_costs")
      .where({ id: costId, project_id: projectId })
      .first();

    if (!existing) {
      return NextResponse.json({ success: false, error: "Cost item not found" }, { status: 404 });
    }

    const body = await req.json();
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (body.category !== undefined) updateData.category = String(body.category).trim();
    if (body.description !== undefined) {
      if (!body.description.trim()) {
        return NextResponse.json({ success: false, error: "Description cannot be empty" }, { status: 400 });
      }
      updateData.description = body.description.trim();
    }
    if (body.plannedAmountInr !== undefined) updateData.planned_amount_inr = Number(body.plannedAmountInr) || 0;
    if (body.actualAmountInr !== undefined) updateData.actual_amount_inr = Number(body.actualAmountInr) || 0;
    if (body.status !== undefined) updateData.status = String(body.status).trim();
    if (body.notes !== undefined) updateData.notes = body.notes ? String(body.notes).trim() : null;

    if (body.poNumber !== undefined) updateData.po_number = body.poNumber ? String(body.poNumber).trim() : null;
    if (body.poValueInr !== undefined) {
      updateData.po_value_inr = body.poValueInr !== null && body.poValueInr !== "" ? Number(body.poValueInr) : null;
      if (updateData.po_value_inr !== null) {
        updateData.planned_amount_inr = updateData.po_value_inr;
      }
    }
    if (body.invoiceNumber !== undefined) updateData.invoice_number = body.invoiceNumber ? String(body.invoiceNumber).trim() : null;
    if (body.invoiceValueInr !== undefined) {
      updateData.invoice_value_inr = body.invoiceValueInr !== null && body.invoiceValueInr !== "" ? Number(body.invoiceValueInr) : null;
      if (updateData.invoice_value_inr !== null) {
        updateData.actual_amount_inr = updateData.invoice_value_inr;
      }
    }
    if (body.invoiceDate !== undefined) updateData.invoice_date = body.invoiceDate || null;
    if (body.vendorName !== undefined) updateData.vendor_name = body.vendorName ? String(body.vendorName).trim() : null;

    const [updated] = await projectDb("project_additional_costs")
      .where({ id: costId, project_id: projectId })
      .update(updateData)
      .returning("*");

    revalidatePath(`/pmt/${projectId}`);
    revalidatePath(`/pmt/${projectCode}`);

    return NextResponse.json({
      success: true,
      cost: {
        id: updated.id,
        projectId: updated.project_id,
        category: updated.category,
        description: updated.description,
        plannedAmountInr: parseFloat(updated.planned_amount_inr || 0),
        actualAmountInr: parseFloat(updated.actual_amount_inr || 0),
        status: updated.status,
        notes: updated.notes,
        poNumber: updated.po_number || null,
        poValueInr: updated.po_value_inr !== null ? parseFloat(updated.po_value_inr) : null,
        invoiceNumber: updated.invoice_number || null,
        invoiceValueInr: updated.invoice_value_inr !== null ? parseFloat(updated.invoice_value_inr) : null,
        invoiceDate: updated.invoice_date || null,
        vendorName: updated.vendor_name || null,
        createdAt: updated.created_at,
        updatedAt: updated.updated_at,
      },
    });
  } catch (err: any) {
    console.error("additional-costs.[costId].PATCH", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string; costId: string }> }
) {
  try {
    const { id, costId } = await context.params;
    const guard = await requireProjectCapability(id, "financials.view");
    if (!guard.ok) return guard.response;
    const projectId = guard.project.id;
    const projectCode = guard.project.code;

    const deletedCount = await projectDb("project_additional_costs")
      .where({ id: costId, project_id: projectId })
      .del();

    if (!deletedCount) {
      return NextResponse.json({ success: false, error: "Cost item not found" }, { status: 404 });
    }

    revalidatePath(`/pmt/${projectId}`);
    revalidatePath(`/pmt/${projectCode}`);

    return NextResponse.json({ success: true, message: "Cost item deleted" });
  } catch (err: any) {
    console.error("additional-costs.[costId].DELETE", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
