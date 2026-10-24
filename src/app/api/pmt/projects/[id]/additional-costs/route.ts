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
      poNumber: c.po_number || null,
      poValueInr: c.po_value_inr !== null && c.po_value_inr !== undefined ? parseFloat(c.po_value_inr) : null,
      invoiceNumber: c.invoice_number || null,
      invoiceValueInr: c.invoice_value_inr !== null && c.invoice_value_inr !== undefined ? parseFloat(c.invoice_value_inr) : null,
      invoiceDate: c.invoice_date || null,
      vendorName: c.vendor_name || null,
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
      status = "planned",
      notes = null,
      poNumber = null,
      poValueInr = null,
      invoiceNumber = null,
      invoiceValueInr = null,
      invoiceDate = null,
      vendorName = null,
    } = body;

    let plannedAmountInr = Number(body.plannedAmountInr) || 0;
    let actualAmountInr = Number(body.actualAmountInr) || 0;

    // Subcontractor PO: planned cost is PO value, actual cost is invoice value
    if (poValueInr !== null && poValueInr !== undefined && poValueInr !== "") {
      plannedAmountInr = Number(poValueInr) || 0;
    }
    if (invoiceValueInr !== null && invoiceValueInr !== undefined && invoiceValueInr !== "") {
      actualAmountInr = Number(invoiceValueInr) || 0;
    }

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
        planned_amount_inr: plannedAmountInr,
        actual_amount_inr: actualAmountInr,
        status: status || "planned",
        notes: notes ? String(notes).trim() : null,
        po_number: poNumber ? String(poNumber).trim() : null,
        po_value_inr: poValueInr !== null && poValueInr !== "" ? Number(poValueInr) : null,
        invoice_number: invoiceNumber ? String(invoiceNumber).trim() : null,
        invoice_value_inr: invoiceValueInr !== null && invoiceValueInr !== "" ? Number(invoiceValueInr) : null,
        invoice_date: invoiceDate || null,
        vendor_name: vendorName ? String(vendorName).trim() : null,
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
        poNumber: created.po_number || null,
        poValueInr: created.po_value_inr !== null ? parseFloat(created.po_value_inr) : null,
        invoiceNumber: created.invoice_number || null,
        invoiceValueInr: created.invoice_value_inr !== null ? parseFloat(created.invoice_value_inr) : null,
        invoiceDate: created.invoice_date || null,
        vendorName: created.vendor_name || null,
        createdAt: created.created_at,
        updatedAt: created.updated_at,
      },
    });
  } catch (err: any) {
    console.error("additional-costs.POST", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
