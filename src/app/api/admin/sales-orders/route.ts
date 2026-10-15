// ═══════════════════════════════════════════════════════════════
// /api/admin/sales-orders
//
// GET:  Fetch persisted sales orders with KPI summaries & filters
// POST: Preview or commit an imported Sales Orders Excel file (.xlsx)
// DELETE: Delete a specific sales order or clear imported records
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { projectDb } from "@/lib/db";
import { serverError } from "@/lib/route-helpers";
import { runSalesOrderImport } from "@/lib/imports/sales-order-import";

export const runtime = "nodejs";

const MAX_BYTES = 12 * 1024 * 1024;

// ── GET /api/admin/sales-orders ────────────────────────────────
export async function GET(req: Request) {
  try {
    const auth = await requireRole(["admin", "pm"]);
    if (!auth.ok) return auth.response;

    const url = new URL(req.url);
    const q = (url.searchParams.get("q") || "").trim().toLowerCase();
    const category = url.searchParams.get("category") || "all";
    const group = url.searchParams.get("group") || "all";
    const classification = url.searchParams.get("classification") || "all";
    const currency = url.searchParams.get("currency") || "all";
    const status = url.searchParams.get("status") || "all";
    const invoicedStatus = url.searchParams.get("invoicedStatus") || "all";
    const balanceFilter = url.searchParams.get("balanceFilter") || "all"; // all, negative, positive

    const query = projectDb("sales_orders")
      .leftJoin("projects", "sales_orders.project_id", "projects.id")
      .select(
        "sales_orders.*",
        "projects.code as current_project_code",
        "projects.name as current_project_name",
        "projects.status as current_project_status",
        "projects.classification as project_classification"
      )
      .orderBy("sales_orders.created_at", "desc");

    const rows = await query.catch(() => []);

    // Filter and compute statistics
    const categoriesSet = new Set<string>();
    const groupsSet = new Set<string>();

    let totalAmountINR = 0;
    let totalAmountUSD = 0;
    let totalInvoicedINR = 0;
    let totalInvoicedUSD = 0;
    let totalRemainingINR = 0;
    let totalRemainingUSD = 0;
    let negativeCount = 0;
    let groupOrdersCount = 0;
    let nonGroupOrdersCount = 0;

    const formattedRows = rows.map((r: any) => {
      const amt = parseFloat(r.amount) || 0;
      const inv = parseFloat(r.invoiced_amount) || 0;
      const bal = r.balance_amount !== null && r.balance_amount !== undefined
        ? parseFloat(r.balance_amount)
        : amt - inv;

      const rowClassification = (
        r.classification ||
        r.project_classification ||
        (r.row_label?.toLowerCase().includes("group") ? "group" : "non_group")
      ) === "group" ? "group" : "non_group";

      if (rowClassification === "group") {
        groupOrdersCount++;
      } else {
        nonGroupOrdersCount++;
      }

      if (r.category) categoriesSet.add(r.category);
      if (r.row_label) groupsSet.add(r.row_label);

      if (r.currency === "USD") {
        totalAmountUSD += amt;
        totalInvoicedUSD += inv;
        totalRemainingUSD += bal;
      } else {
        totalAmountINR += amt;
        totalInvoicedINR += inv;
        totalRemainingINR += bal;
      }

      if (bal < 0) {
        negativeCount++;
      }

      return {
        id: r.id,
        salesOrderNumber: r.sales_order_number,
        rowLabel: r.row_label,
        category: r.category,
        currency: r.currency || "INR",
        classification: rowClassification,
        materialInfo: r.material_info,
        productName: r.product_name,
        orderStatus: r.order_status || "Confirmed",
        orderDate: r.order_date ? String(r.order_date).slice(0, 10) : null,
        customerName: r.customer_name,
        purchaseOrder: r.purchase_order,
        invoicedStatus: r.invoiced_status,
        amount: amt,
        invoicedAmount: inv,
        balanceAmount: bal,
        projectId: r.project_id,
        projectCode: r.current_project_code || r.project_code,
        projectName: r.current_project_name,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      };
    });

    const filteredRows = formattedRows.filter((item) => {
      if (category !== "all" && item.category !== category) return false;
      if (group !== "all" && item.rowLabel !== group) return false;
      if (classification !== "all" && item.classification !== classification) return false;
      if (currency !== "all" && item.currency !== currency) return false;
      if (status !== "all" && item.orderStatus.toLowerCase() !== status.toLowerCase()) return false;
      if (invoicedStatus !== "all" && item.invoicedStatus?.toLowerCase() !== invoicedStatus.toLowerCase()) return false;
      if (balanceFilter === "negative" && item.balanceAmount >= 0) return false;
      if (balanceFilter === "positive" && item.balanceAmount < 0) return false;

      if (q) {
        const text = [
          item.salesOrderNumber,
          item.customerName,
          item.productName,
          item.materialInfo,
          item.purchaseOrder,
          item.projectCode,
          item.category,
          item.classification,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });

    return NextResponse.json({
      success: true,
      orders: filteredRows,
      summary: {
        total: formattedRows.length,
        filteredCount: filteredRows.length,
        totalAmountINR,
        totalAmountUSD,
        totalInvoicedINR,
        totalInvoicedUSD,
        totalRemainingINR,
        totalRemainingUSD,
        negativeCount,
        groupOrdersCount,
        nonGroupOrdersCount,
        categories: Array.from(categoriesSet).sort(),
        groups: Array.from(groupsSet).sort(),
      },
    });
  } catch (err) {
    return serverError("admin.salesOrders.GET", err);
  }
}

// ── POST /api/admin/sales-orders ───────────────────────────────
export async function POST(req: Request) {
  try {
    const auth = await requireRole(["admin", "pm"]);
    if (!auth.ok) return auth.response;

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json(
        { success: false, error: "Send the file as multipart form data." },
        { status: 400 }
      );
    }

    const file = form.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json(
        { success: false, error: "Choose the Sales Order Excel workbook to upload." },
        { status: 400 }
      );
    }

    if (!/\.xlsx$/i.test(file.name || "")) {
      return NextResponse.json(
        { success: false, error: "Only .xlsx files are supported." },
        { status: 400 }
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { success: false, error: "File is larger than 12 MB." },
        { status: 413 }
      );
    }

    const commit = form.get("commit") === "true";
    const buffer = Buffer.from(await file.arrayBuffer());

    const result = await runSalesOrderImport({ buffer, projectDb, commit });

    if (result.summary.total === 0 && result.summary.errors > 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Could not identify Sales Order headers in this file. Please verify that the sheet contains columns like Sales Order#, Customer Name, Description/Material Info, and Amount.",
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      committed: result.committed,
      rows: result.rows,
      summary: result.summary,
    });
  } catch (err) {
    return serverError("admin.salesOrders.POST", err);
  }
}

// ── DELETE /api/admin/sales-orders ─────────────────────────────
export async function DELETE(req: Request) {
  try {
    const auth = await requireRole(["admin", "pm"]);
    if (!auth.ok) return auth.response;

    const url = new URL(req.url);
    const id = url.searchParams.get("id");

    if (id) {
      await projectDb("sales_orders").where("id", id).delete();
      return NextResponse.json({ success: true, message: "Sales order deleted." });
    }

    return NextResponse.json({ success: false, error: "Specify an ID to delete." }, { status: 400 });
  } catch (err) {
    return serverError("admin.salesOrders.DELETE", err);
  }
}
