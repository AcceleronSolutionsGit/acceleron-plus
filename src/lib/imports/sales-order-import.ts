// ═══════════════════════════════════════════════════════════════
// Zoho Books Sales Order → projects import
//
// Reads an Excel file in the Zoho Books sales-order export format:
//   SALESORDER_ID | Sales Order# | Sale Order Description |
//   Order Status  | Date         | Customer Name          |
//   Group#        | Reference#   | Amount                 |
//   Invoiced Amount | Invoiced
//
// Detects header row dynamically (handles Zoho Books Organization ID row).
// For each row not already in the `projects` table (matched by zoho_sales_order_ref),
// a new project is created with auto-assigned code ACC-XXX. Existing rows
// are updated if the status or amounts have changed.
// ═══════════════════════════════════════════════════════════════

import ExcelJS from "exceljs";
import type { Knex } from "knex";

export interface ZohoSalesOrderRow {
  rowNumber: number;
  salesorderId: string;
  salesOrderNumber: string;
  description: string;
  orderStatus: string;
  date: string | null;
  customerName: string;
  groupNumber: string | null;
  referenceNumber: string | null;
  amount: number | null;
  invoicedAmount: number | null;
  invoiced: string | null;
  outcome: "created" | "updated" | "skipped" | "error";
  message: string;
}

export interface SalesOrderImportSummary {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
}

export interface SalesOrderImportResult {
  ok: true;
  committed: boolean;
  rows: ZohoSalesOrderRow[];
  summary: SalesOrderImportSummary;
}

// ── Column name normalisation ──────────────────────────────────

const COL_ALIASES: Record<string, string[]> = {
  salesorderId:     ["salesorder_id", "sales order id", "salesorder id", "so id", "salesorder"],
  salesOrderNumber: ["sales order#", "sales order number", "so#", "so number", "salesorder#", "sales order"],
  description:      ["sale order description", "sales order description", "order description", "description", "so description", "item description"],
  orderStatus:      ["order status", "order stat", "status"],
  date:             ["date", "order date", "so date"],
  customerName:     ["customer name", "customer", "client name", "client"],
  groupNumber:      ["group/non-group (customer)", "group/non group", "group#", "group number", "group"],
  referenceNumber:  ["reference#", "reference number", "reference", "ref#"],
  amount:           ["amount", "total amount", "order amount", "so amount"],
  invoicedAmount:   ["invoiced amount", "invoiced am", "invoiced amt", "billed amount"],
  invoiced:         ["invoiced", "fully invoiced", "invoiced?"],
};

function normalise(header: string): string {
  return header.trim().toLowerCase().replace(/[^a-z0-9#]+/g, " ").trim();
}

function mapColumns(headers: string[]): Record<string, number> {
  const mapping: Record<string, number> = {};
  const normalised = headers.map(normalise);

  for (const [key, aliases] of Object.entries(COL_ALIASES)) {
    for (const alias of aliases) {
      const idx = normalised.indexOf(alias);
      if (idx !== -1) { mapping[key] = idx; break; }
    }
  }
  return mapping;
}

function cellStr(row: ExcelJS.Row, idx: number | undefined): string {
  if (idx === undefined) return "";
  const cell = row.getCell(idx + 1); // 1-indexed
  const v = cell.value;
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && "text" in v) return String((v as { text: string }).text).trim();
  return String(v).trim();
}

function cellNum(row: ExcelJS.Row, idx: number | undefined): number | null {
  if (idx === undefined) return null;
  const raw = cellStr(row, idx).replace(/[^\d.-]/g, ""); // strip currency symbols $, ₹, commas
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

function cellDate(row: ExcelJS.Row, idx: number | undefined): string | null {
  if (idx === undefined) return null;
  const cell = row.getCell(idx + 1);
  const v = cell.value;
  if (!v) return null;
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(v).trim();
  // Try ISO date YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // Try DD/MM/YYYY or DD-MM-YYYY
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  // Try verbal date like "13 Apr 2026"
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) {
    const y = dt.getFullYear();
    const mo = String(dt.getMonth() + 1).padStart(2, "0");
    const day = String(dt.getDate()).padStart(2, "0");
    return `${y}-${mo}-${day}`;
  }
  return null;
}

function mapStatus(zohoStatus: string): string {
  const s = zohoStatus.toLowerCase().trim();
  if (s === "confirmed" || s === "open") return "active";
  if (s === "draft") return "initiated";
  if (s === "closed" || s === "fulfilled") return "closed";
  if (s === "cancelled" || s === "void") return "cancelled";
  if (s === "on hold") return "on_hold";
  return "active";
}

// ── Main import function ───────────────────────────────────────

export async function runSalesOrderImport(opts: {
  buffer: Buffer;
  projectDb: Knex;
  commit: boolean;
}): Promise<SalesOrderImportResult> {
  const { buffer, projectDb, commit } = opts;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as any);

  const ws = wb.worksheets[0];
  if (!ws || ws.rowCount < 1) {
    return {
      ok: true,
      committed: false,
      rows: [],
      summary: { total: 0, created: 0, updated: 0, skipped: 0, errors: 0 },
    };
  }

  // Find the header row dynamically (scans first 10 rows for matching column names)
  let headerRowIndex = 1;
  let mapping: Record<string, number> = {};

  for (let r = 1; r <= Math.min(10, ws.rowCount); r++) {
    const row = ws.getRow(r);
    const headers: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      headers[colNumber - 1] = cell.value ? String(cell.value).trim() : "";
    });
    const currentMapping = mapColumns(headers);
    if (Object.keys(currentMapping).length >= 3) {
      headerRowIndex = r;
      mapping = currentMapping;
      break;
    }
  }

  // Check essential column presence
  const hasId = mapping.salesorderId !== undefined || mapping.salesOrderNumber !== undefined;
  const hasDescOrCustomer = mapping.description !== undefined || mapping.customerName !== undefined;

  if (!hasId || !hasDescOrCustomer) {
    return {
      ok: true,
      committed: false,
      rows: [],
      summary: { total: 0, created: 0, updated: 0, skipped: 0, errors: 1 },
    };
  }

  // Load existing projects keyed by zoho_sales_order_ref
  const existing = (await projectDb("projects")
    .whereNotNull("zoho_sales_order_ref")
    .select("id", "zoho_sales_order_ref", "status", "budget_inr")
    .catch(() => [])) as Record<string, unknown>[];
  const existingMap = new Map(
    existing.map((p) => [String(p.zoho_sales_order_ref), p])
  );

  // Get the highest project code number so we can auto-generate new ones
  const lastProject = await projectDb("projects")
    .whereRaw("code ~ '^ACC-\\d+$'")
    .orderByRaw("substring(code from 'ACC-(\\d+)')::int DESC")
    .select("code")
    .first<{ code: string } | undefined>()
    .catch(() => undefined);
  let nextNum = 1;
  if (lastProject?.code) {
    const m = lastProject.code.match(/ACC-(\d+)/);
    if (m) nextNum = parseInt(m[1], 10) + 1;
  }

  const results: ZohoSalesOrderRow[] = [];
  const summary: SalesOrderImportSummary = {
    total: 0, created: 0, updated: 0, skipped: 0, errors: 0,
  };

  // Iterate over data rows starting after headerRowIndex
  for (let rowNumber = headerRowIndex + 1; rowNumber <= ws.rowCount; rowNumber++) {
    const row = ws.getRow(rowNumber);
    const soId = cellStr(row, mapping.salesorderId);
    const soNum = cellStr(row, mapping.salesOrderNumber);
    const desc = cellStr(row, mapping.description);
    const customer = cellStr(row, mapping.customerName);

    // Skip blank rows
    if (!soId && !soNum && !desc && !customer) continue;

    const entry: ZohoSalesOrderRow = {
      rowNumber,
      salesorderId: soId,
      salesOrderNumber: soNum,
      description: desc,
      orderStatus: cellStr(row, mapping.orderStatus),
      date: cellDate(row, mapping.date),
      customerName: customer,
      groupNumber: cellStr(row, mapping.groupNumber) || null,
      referenceNumber: cellStr(row, mapping.referenceNumber) || null,
      amount: cellNum(row, mapping.amount),
      invoicedAmount: cellNum(row, mapping.invoicedAmount),
      invoiced: cellStr(row, mapping.invoiced) || null,
      outcome: "skipped",
      message: "",
    };

    summary.total++;

    if (!entry.salesorderId && !entry.salesOrderNumber) {
      entry.outcome = "error";
      entry.message = "No Sales Order ID or Number found.";
      summary.errors++;
      results.push(entry);
      continue;
    }

    const refKey = entry.salesorderId || entry.salesOrderNumber;
    if (existingMap.has(refKey)) {
      entry.outcome = "updated";
      entry.message = "Project already exists — will be synchronized.";
      summary.updated++;
    } else {
      entry.outcome = "created";
      entry.message = `New project → ACC-${String(nextNum).padStart(3, "0")}`;
      nextNum++;
      summary.created++;
    }

    results.push(entry);
  }

  // Commit phase
  if (commit && (summary.created > 0 || summary.updated > 0)) {
    let codeNum = nextNum - summary.created; // rewind to assign codes sequentially

    await projectDb.transaction(async (trx) => {
      for (const row of results) {
        if (row.outcome === "error" || row.outcome === "skipped") continue;

        const refKey = row.salesorderId || row.salesOrderNumber;

        if (row.outcome === "created") {
          const code = `ACC-${String(codeNum).padStart(3, "0")}`;
          codeNum++;

          await trx("projects").insert({
            tenant_id: "acceleron",
            code,
            name: row.description || row.salesOrderNumber || code,
            description: row.description,
            zoho_sales_order_ref: refKey,
            zoho_books_ref: row.referenceNumber,
            status: mapStatus(row.orderStatus),
            start_date: row.date,
            client_company_name: row.customerName,
            budget_inr: row.amount,
            created_at: new Date(),
            updated_at: new Date(),
          });
        } else if (row.outcome === "updated") {
          const updates: Record<string, unknown> = { updated_at: new Date() };
          if (row.orderStatus) updates.status = mapStatus(row.orderStatus);
          if (row.amount !== null) updates.budget_inr = row.amount;
          if (row.customerName) updates.client_company_name = row.customerName;
          if (row.referenceNumber) updates.zoho_books_ref = row.referenceNumber;
          if (row.description) updates.description = row.description;

          await trx("projects")
            .where("zoho_sales_order_ref", refKey)
            .update(updates);
        }
      }
    });
  }

  return {
    ok: true,
    committed: commit,
    rows: results,
    summary,
  };
}
