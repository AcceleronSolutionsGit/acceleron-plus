import { NextRequest, NextResponse } from "next/server";
import { projectDb } from "@/lib/db";
import { serverError } from "@/lib/route-helpers";
import { randomUUID } from "crypto";
import { requireProjectCapability } from "@/lib/auth";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const guard = await requireProjectCapability(id, "invoice.view");
    if (!guard.ok) return guard.response;
    const projectId = guard.project.id;

    const invoices = await projectDb("invoices")
      .where("project_id", projectId)
      .orderBy("issue_date", "desc");

    return NextResponse.json({ success: true, data: invoices });
  } catch (error) {
    return serverError("invoices", error);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const guard = await requireProjectCapability(id, "invoice.manage");
    if (!guard.ok) return guard.response;
    const projectId = guard.project.id;

    const body = await req.json();

    const {
      invoice_number,
      client_name,
      amount_inr,
      tax_amount_inr,
      total_amount_inr,
      issue_date,
      due_date,
      status = "draft",
      notes,
    } = body;

    if (!invoice_number || !client_name || !amount_inr) {
      return NextResponse.json(
        { success: false, error: "Missing required fields (invoice_number, client_name, amount_inr)" },
        { status: 400 }
      );
    }

    const newInvoice = {
      id: randomUUID(),
      project_id: projectId,
      invoice_number,
      client_name,
      amount_inr: parseFloat(amount_inr).toFixed(2),
      tax_amount_inr: tax_amount_inr ? parseFloat(tax_amount_inr).toFixed(2) : (parseFloat(amount_inr) * 0.18).toFixed(2),
      total_amount_inr: total_amount_inr
        ? parseFloat(total_amount_inr).toFixed(2)
        : (parseFloat(amount_inr) * 1.18).toFixed(2),
      currency: "INR",
      status,
      issue_date: issue_date ? new Date(issue_date).toISOString() : new Date().toISOString(),
      due_date: due_date ? new Date(due_date).toISOString() : new Date(Date.now() + 30 * 86400000).toISOString(),
      notes: notes || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await projectDb("invoices").insert(newInvoice);

    return NextResponse.json({ success: true, data: newInvoice });
  } catch (error) {
    return serverError("invoices", error);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const guard = await requireProjectCapability(id, "invoice.manage");
    if (!guard.ok) return guard.response;

    const body = await req.json();
    const { invoiceId, status, paid_at, notes } = body;

    if (!invoiceId) {
      return NextResponse.json({ success: false, error: "Missing invoiceId" }, { status: 400 });
    }

    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (status !== undefined) {
      updates.status = status;
      if (status === "paid" && !paid_at) {
        updates.paid_at = new Date().toISOString();
      }
    }
    if (notes !== undefined) updates.notes = notes;

    const changed = await projectDb("invoices")
      .where({ id: invoiceId, project_id: guard.project.id })
      .update(updates);

    if (changed === 0) {
      return NextResponse.json(
        { success: false, error: "That invoice does not belong to this project." },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, message: "Invoice updated successfully" });
  } catch (error) {
    return serverError("invoices", error);
  }
}
