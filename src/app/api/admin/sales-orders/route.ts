// POST /api/admin/sales-orders  — import Zoho Books sales order Excel
//
// Admin-only. Accepts multipart form data with a single .xlsx file.
// Two-pass: first without commit (preview), then with commit=true.

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { projectDb } from "@/lib/db";
import { serverError } from "@/lib/route-helpers";
import { runSalesOrderImport } from "@/lib/imports/sales-order-import";

export const runtime = "nodejs";

const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(req: Request) {
  try {
    const auth = await requireRole(["admin"]);
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
        { success: false, error: "Choose the Zoho Sales Order export file." },
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
        { success: false, error: "File is larger than 8 MB." },
        { status: 413 }
      );
    }

    const commit = form.get("commit") === "true";
    const buffer = Buffer.from(await file.arrayBuffer());

    const result = await runSalesOrderImport({ buffer, projectDb, commit });

    if (result.summary.total === 0 && result.summary.errors > 0) {
      return NextResponse.json({
        success: false,
        error: "Could not identify Zoho Books Sales Order headers in this file. Please verify that the sheet contains columns like Sales Order#, Customer Name, and Description.",
      }, { status: 400 });
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
