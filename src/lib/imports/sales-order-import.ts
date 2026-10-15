// ═══════════════════════════════════════════════════════════════
// Zoho Books / Invoicing Excel Import Engine
//
// Reads an Excel file in either:
// 1) Consolidated Sales Orders & Invoicing report:
//    Row Labels / Group | Category | Currency | Sales Order |
//    Material Info | Product Name | Order Status | Date | Customer Name |
//    Purchase Order | Invoiced | Sum of Amount | Sum of Invoiced Amount | Sum of Balance
// 2) Classic Zoho Books Sales Order export:
//    SALESORDER_ID | Sales Order# | Sale Order Description |
//    Order Status  | Date         | Customer Name          |
//    Group#        | Reference#   | Amount                 |
//    Invoiced Amount | Invoiced
//
// Auto-detects header row dynamically.
// Upserts into `sales_orders` table and synchronizes/creates `projects`
// records with auto-assigned code ACC-XXX.
// ═══════════════════════════════════════════════════════════════

import ExcelJS from "exceljs";
import type { Knex } from "knex";

export interface ZohoSalesOrderRow {
  rowNumber: number;
  salesorderId: string;
  salesOrderNumber: string;
  rowLabel: string | null;
  category: string | null;
  currency: string;
  materialInfo: string | null;
  productName: string | null;
  description: string;
  orderStatus: string;
  date: string | null;
  customerName: string;
  purchaseOrder: string | null;
  groupNumber: string | null;
  referenceNumber: string | null;
  amount: number | null;
  invoicedAmount: number | null;
  balanceAmount: number | null;
  invoiced: string | null;
  classification: "group" | "non_group";
  outcome: "created" | "updated" | "skipped" | "error";
  message: string;
  projectId?: string | null;
  projectCode?: string | null;
}

export interface SalesOrderImportSummary {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  totalAmountINR: number;
  totalAmountUSD: number;
  totalInvoicedINR: number;
  totalInvoicedUSD: number;
  totalRemainingINR: number;
  totalRemainingUSD: number;
  negativeCount: number;
}

export interface SalesOrderImportResult {
  ok: true;
  committed: boolean;
  rows: ZohoSalesOrderRow[];
  summary: SalesOrderImportSummary;
}

// ── Column name normalisation ──────────────────────────────────

const COL_ALIASES: Record<string, string[]> = {
  rowLabel:         ["row labels", "row label", "group", "group#", "group number", "group/non group", "group/non-group (customer)", "internal_external", "internal external"],
  category:         ["category", "project category", "cat"],
  currency:         ["currency", "curr"],
  salesorderId:     ["salesorder_id", "sales order id", "salesorder id", "so id", "salesorder"],
  salesOrderNumber: ["sales order#", "sales order number", "so#", "so number", "salesorder#", "sales order"],
  materialInfo:     ["material info", "material information", "contract period", "material", "nature of job"],
  productName:      ["product name", "product", "item name", "item"],
  description:      ["sale order description", "sales order description", "order description", "description", "so description", "item description", "scope", "nature of job"],
  orderStatus:      ["order status", "order stat", "status"],
  date:             ["date", "order date", "so date"],
  customerName:     ["customer name", "customer", "client name", "client"],
  purchaseOrder:    ["purchase order", "purchase order#", "po#", "po number", "po details", "customer po"],
  groupNumber:      ["group/non-group (customer)", "group/non group", "group#", "group number", "group"],
  referenceNumber:  ["reference#", "reference number", "reference", "ref#"],
  amount:           ["sum of amount", "amount", "total amount", "order amount", "so amount", "contract value"],
  invoicedAmount:   ["sum of invoiced amount", "invoiced amount", "invoiced am", "invoiced amt", "billed amount", "total invoiced"],
  balanceAmount:    ["sum of balance", "balance", "balance amount", "remaining amount", "remaining amt", "remaining balance", "net balance", "unbilled amount"],
  invoiced:         ["invoiced", "fully invoiced", "invoiced?", "invoiced status"],
  classification:   ["classification", "group / non-group", "group/non-group", "group / non group", "group/non group", "group or non group", "group/non-group (customer)", "client type", "customer type", "internal_external", "internal external"],
};

function normalise(header: string): string {
  return header.trim().toLowerCase().replace(/[^a-z0-9#]+/g, " ").trim();
}

function mapColumns(headers: string[]): Record<string, number> {
  const mapping: Record<string, number> = {};
  const normalised = headers.map(normalise);

  for (const [key, aliases] of Object.entries(COL_ALIASES)) {
    for (const alias of aliases) {
      const target = normalise(alias);
      const idx = normalised.indexOf(target);
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
  // Try verbal date like "29-Oct-2025" or "13 Apr 2026"
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

function deriveClassification(
  explicit?: string | null,
  rowLabel?: string | null,
  groupNum?: string | null
): "group" | "non_group" {
  const raw = (explicit || rowLabel || groupNum || "").trim().toLowerCase();
  if (!raw) return "non_group";
  if (raw.includes("non-group") || raw.includes("non group") || raw.includes("nongroup") || raw.includes("external")) {
    return "non_group";
  }
  if (raw.includes("group") || raw === "internal") {
    return "group";
  }
  return "non_group";
}

function deriveCategory(
  explicit?: string | null,
  description?: string | null,
  productName?: string | null
): string {
  if (explicit && explicit.trim()) {
    const raw = explicit.trim().toUpperCase();
    if (["SAP", "SOFTWARE", "SUPPORT", "INFRA", "LICENCE", "LICENSE", "AUDIT", "OTHER"].includes(raw)) {
      return raw === "LICENSE" ? "LICENCE" : raw;
    }
    return explicit.trim().toUpperCase();
  }
  const text = `${description || ""} ${productName || ""}`.toUpperCase();
  if (text.includes("SAP") || text.includes("S/4") || text.includes("S4") || text.includes("ABAP") || text.includes("BASIS") || text.includes("FICO") || text.includes("EWM") || text.includes("FIORI")) return "SAP";
  if (text.includes("CCTV") || text.includes("NETWORK") || text.includes("INFRA") || text.includes("CABLING") || text.includes("RF DEVICE") || text.includes("ROUTER")) return "INFRA";
  if (text.includes("LICEN") || text.includes("POWER BI") || text.includes("ZSCALER") || text.includes("WORK DRIVE") || text.includes("WORKDRIVE") || text.includes("MICROSOFT 365") || text.includes("M365")) return "LICENCE";
  if (text.includes("AUDIT") || text.includes("ISMS") || text.includes("VAPT") || text.includes("SOD REVIEW") || text.includes("SECURITY CONFIGURATION")) return "AUDIT";
  if (text.includes("SUPPORT") || text.includes("AMC") || text.includes("MANPOWER") || text.includes("AMS") || text.includes("MAINTENANCE") || text.includes("END USER")) return "SUPPORT";
  if (text.includes("APP") || text.includes("SOFTWARE") || text.includes("DEVELOPMENT") || text.includes("PORTAL") || text.includes("INTEGRATION") || text.includes("ZOHO") || text.includes("CRM") || text.includes("SYSTEM")) return "SOFTWARE";
  return "OTHER";
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
      summary: {
        total: 0, created: 0, updated: 0, skipped: 0, errors: 0,
        totalAmountINR: 0, totalAmountUSD: 0,
        totalInvoicedINR: 0, totalInvoicedUSD: 0,
        totalRemainingINR: 0, totalRemainingUSD: 0,
        negativeCount: 0,
      },
    };
  }

  // Find header row dynamically (scans first 12 rows)
  let headerRowIndex = 1;
  let mapping: Record<string, number> = {};

  for (let r = 1; r <= Math.min(12, ws.rowCount); r++) {
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
  const hasDescOrCustomer = mapping.description !== undefined || mapping.customerName !== undefined || mapping.materialInfo !== undefined;

  if (!hasId || !hasDescOrCustomer) {
    return {
      ok: true,
      committed: false,
      rows: [],
      summary: {
        total: 0, created: 0, updated: 0, skipped: 0, errors: 1,
        totalAmountINR: 0, totalAmountUSD: 0,
        totalInvoicedINR: 0, totalInvoicedUSD: 0,
        totalRemainingINR: 0, totalRemainingUSD: 0,
        negativeCount: 0,
      },
    };
  }

  // Load existing projects keyed by zoho_sales_order_ref, code, and normalized name
  const existingProjects = (await projectDb("projects")
    .select("id", "code", "name", "zoho_sales_order_ref", "status", "budget_inr")
    .catch(() => [])) as Record<string, unknown>[];
  const projectMap = new Map<string, Record<string, unknown>>();
  const projectNameMap = new Map<string, Record<string, unknown>>();
  const projectById = new Map<string, Record<string, unknown>>();

  for (const p of existingProjects) {
    if (p.id) projectById.set(String(p.id), p);
    if (p.zoho_sales_order_ref) projectMap.set(String(p.zoho_sales_order_ref).trim(), p);
    if (p.code) projectMap.set(String(p.code).trim(), p);
    if (p.name) projectNameMap.set(String(p.name).trim().toLowerCase(), p);
  }

  // Load existing sales_orders keyed by sales_order_number
  const existingOrders = (await projectDb("sales_orders")
    .select("id", "sales_order_number", "customer_name", "amount", "project_id", "project_code")
    .catch(() => [])) as Record<string, unknown>[];
  const orderMap = new Map<string, Record<string, unknown>>();
  for (const o of existingOrders) {
    if (o.sales_order_number) orderMap.set(String(o.sales_order_number).trim(), o);
  }

  // Highest project code ACC-XXX
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
    totalAmountINR: 0, totalAmountUSD: 0,
    totalInvoicedINR: 0, totalInvoicedUSD: 0,
    totalRemainingINR: 0, totalRemainingUSD: 0,
    negativeCount: 0,
  };

  let currentGroupLabel: string | null = null;
  let currentCategory: string | null = null;
  let currentCurrency = "INR";

  // Iterate over data rows
  for (let rowNumber = headerRowIndex + 1; rowNumber <= ws.rowCount; rowNumber++) {
    const row = ws.getRow(rowNumber);
    const soId = cellStr(row, mapping.salesorderId);
    const soNum = cellStr(row, mapping.salesOrderNumber);
    const desc = cellStr(row, mapping.description);
    const matInfo = cellStr(row, mapping.materialInfo);
    const customer = cellStr(row, mapping.customerName);
    const prodName = cellStr(row, mapping.productName);
    const rawRowLabel = cellStr(row, mapping.rowLabel);
    const rawCategory = cellStr(row, mapping.category);
    const rawCurrency = cellStr(row, mapping.currency);

    // Track hierarchy contexts if the file is a pivot / tree structure
    if (rawRowLabel && !rawRowLabel.toLowerCase().includes("total")) {
      currentGroupLabel = rawRowLabel;
    }
    if (rawCategory && !rawCategory.toLowerCase().includes("total")) {
      currentCategory = rawCategory;
    }
    if (rawCurrency && !rawCurrency.toLowerCase().includes("total")) {
      currentCurrency = rawCurrency.toUpperCase().includes("USD") ? "USD" : "INR";
    }

    // Skip empty lines, summary/total rows (e.g. "Grand Total", "Total")
    if (!soId && !soNum && !desc && !customer && !matInfo) continue;
    const isTotalRow = [soNum, customer, desc, matInfo, rawRowLabel].some(
      (v) => v && (v.toLowerCase().includes("grand total") || v.toLowerCase().includes("sub total") || v.toLowerCase().endsWith(" total"))
    );
    if (isTotalRow && !soNum) continue;

    const effectiveSoNum = soNum || soId;
    if (!effectiveSoNum && !customer) continue;

    // Currency parsing
    let effectiveCurrency = rawCurrency ? (rawCurrency.toUpperCase().includes("USD") ? "USD" : "INR") : currentCurrency;
    const amountVal = cellNum(row, mapping.amount);
    const invoicedVal = cellNum(row, mapping.invoicedAmount);
    let balanceVal = cellNum(row, mapping.balanceAmount);

    // Compute balance if missing
    if (balanceVal === null && amountVal !== null && invoicedVal !== null) {
      balanceVal = Math.round((amountVal - invoicedVal) * 100) / 100;
    }

    const effectiveDesc = desc || matInfo || prodName || "";
    const rawClassification = cellStr(row, mapping.classification);
    const effectiveClassification = deriveClassification(
      rawClassification,
      rawRowLabel || currentGroupLabel,
      cellStr(row, mapping.groupNumber)
    );

    const entry: ZohoSalesOrderRow = {
      rowNumber,
      salesorderId: soId,
      salesOrderNumber: effectiveSoNum,
      rowLabel: rawRowLabel || currentGroupLabel,
      category: deriveCategory(rawCategory || currentCategory, effectiveDesc, prodName),
      currency: effectiveCurrency,
      materialInfo: matInfo || null,
      productName: prodName || null,
      description: effectiveDesc,
      orderStatus: cellStr(row, mapping.orderStatus) || "Confirmed",
      date: cellDate(row, mapping.date),
      customerName: customer,
      purchaseOrder: cellStr(row, mapping.purchaseOrder) || null,
      groupNumber: cellStr(row, mapping.groupNumber) || currentGroupLabel || null,
      referenceNumber: cellStr(row, mapping.referenceNumber) || cellStr(row, mapping.purchaseOrder) || null,
      amount: amountVal,
      invoicedAmount: invoicedVal,
      balanceAmount: balanceVal,
      invoiced: cellStr(row, mapping.invoiced) || null,
      classification: effectiveClassification,
      outcome: "skipped",
      message: "",
    };

    summary.total++;

    if (!entry.salesOrderNumber) {
      entry.outcome = "error";
      entry.message = "No Sales Order reference found on this row.";
      summary.errors++;
      results.push(entry);
      continue;
    }

    // Tally financial totals
    const amt = entry.amount ?? 0;
    const inv = entry.invoicedAmount ?? 0;
    const bal = entry.balanceAmount ?? (amt - inv);

    if (entry.currency === "USD") {
      summary.totalAmountUSD += amt;
      summary.totalInvoicedUSD += inv;
      summary.totalRemainingUSD += bal;
    } else {
      summary.totalAmountINR += amt;
      summary.totalInvoicedINR += inv;
      summary.totalRemainingINR += bal;
    }

    if (bal < 0) {
      summary.negativeCount++;
    }

    const matchSoRef = entry.salesorderId?.trim();
    const matchSoNum = entry.salesOrderNumber?.trim();
    const poRef = entry.purchaseOrder?.trim();
    const refNum = entry.referenceNumber?.trim();
    const descKey = (entry.description || entry.productName || "").trim().toLowerCase();

    // Look for existing project by SO ID, SO Number, Ref/PO, or Name
    const existingProj =
      (matchSoRef ? projectMap.get(matchSoRef) : undefined) ||
      (matchSoNum ? projectMap.get(matchSoNum) : undefined) ||
      (poRef ? projectMap.get(poRef) : undefined) ||
      (refNum ? projectMap.get(refNum) : undefined) ||
      (descKey ? projectNameMap.get(descKey) : undefined);

    const existingOrd =
      (matchSoNum ? orderMap.get(matchSoNum) : undefined) ||
      (matchSoRef ? orderMap.get(matchSoRef) : undefined);

    if (existingOrd || existingProj) {
      entry.outcome = "updated";
      const projCode = existingProj ? (existingProj.code as string) : existingOrd ? (existingOrd.project_code as string) : null;
      entry.projectCode = projCode || null;
      entry.projectId = (existingProj?.id as string) || (existingOrd ? (existingOrd.project_id as string) : null) || null;
      entry.message = projCode
        ? `Existing project (${projCode}) — amounts & balance will sync.`
        : "Existing sales order — updated in database.";
      summary.updated++;
    } else {
      entry.outcome = "created";
      const code = `ACC-${String(nextNum).padStart(3, "0")}`;
      entry.projectCode = code;
      entry.message = `New project & sales order → ${code}`;
      nextNum++;
      summary.created++;
    }

    results.push(entry);
  }

  // ── Commit Phase ──────────────────────────────────────────────
  if (commit && results.length > 0) {
    let codeNum = nextNum - summary.created;

    await projectDb.transaction(async (trx) => {
      for (const row of results) {
        if (row.outcome === "error" || row.outcome === "skipped") continue;

        const refKey = row.salesOrderNumber.trim();
        const amt = row.amount ?? 0;
        const inv = row.invoicedAmount ?? 0;
        const bal = row.balanceAmount !== null && row.balanceAmount !== undefined ? row.balanceAmount : (amt - inv);

        let projectId: string | null = null;
        let projectCode: string | null = null;

        const soRef = row.salesorderId?.trim();
        const soNum = row.salesOrderNumber?.trim();
        const poRef = row.purchaseOrder?.trim();
        const refNum = row.referenceNumber?.trim();
        const descKey = (row.description || row.productName || "").trim().toLowerCase();

        // 1. Sync or Create Project (match by ID, SO#, PO#, or name)
        const existingProj =
          (row.projectId && projectById.get(row.projectId)) ||
          (soRef && projectMap.get(soRef)) ||
          (soNum && projectMap.get(soNum)) ||
          (poRef && projectMap.get(poRef)) ||
          (refNum && projectMap.get(refNum)) ||
          (descKey && projectNameMap.get(descKey));

        if (existingProj) {
          projectId = existingProj.id as string;
          projectCode = existingProj.code as string;

          await trx("projects")
            .where("id", projectId)
            .update({
              name: row.description || row.productName || existingProj.name,
              description: row.description || row.materialInfo || existingProj.description,
              budget_inr: row.currency === "INR" ? amt : existingProj.budget_inr,
              invoiced_amount: inv,
              balance_amount: bal,
              category: row.category || existingProj.category,
              currency: row.currency,
              product_name: row.productName,
              material_info: row.materialInfo,
              group_name: row.rowLabel || row.groupNumber,
              invoiced_status: row.invoiced,
              classification: row.classification,
              client_company_name: row.customerName || existingProj.client_company_name,
              po_details: row.purchaseOrder || existingProj.po_details,
              zoho_books_ref: row.referenceNumber || existingProj.zoho_books_ref,
              status: mapStatus(row.orderStatus),
              updated_at: new Date(),
            });
        } else {
          projectCode = `ACC-${String(codeNum).padStart(3, "0")}`;
          codeNum++;

          const [insertedProj] = await trx("projects")
            .insert({
              tenant_id: "acceleron",
              code: projectCode,
              name: row.productName || row.description || refKey,
              description: row.materialInfo || row.description,
              zoho_sales_order_ref: refKey,
              zoho_books_ref: row.referenceNumber || row.purchaseOrder,
              status: mapStatus(row.orderStatus),
              start_date: row.date,
              client_company_name: row.customerName,
              budget_inr: row.currency === "INR" ? amt : null,
              invoiced_amount: inv,
              balance_amount: bal,
              category: row.category,
              currency: row.currency,
              product_name: row.productName,
              material_info: row.materialInfo,
              group_name: row.rowLabel || row.groupNumber,
              invoiced_status: row.invoiced,
              classification: row.classification,
              po_details: row.purchaseOrder,
              created_at: new Date(),
              updated_at: new Date(),
            })
            .returning(["id", "code"]);

          if (insertedProj) {
            projectId = insertedProj.id;
            projectCode = insertedProj.code;
          }
        }

        // 2. Upsert into sales_orders table
        const existingOrder = await trx("sales_orders")
          .where("sales_order_number", refKey)
          .first();

        if (existingOrder) {
          await trx("sales_orders")
            .where("id", existingOrder.id)
            .update({
              row_label: row.rowLabel,
              category: row.category,
              currency: row.currency,
              material_info: row.materialInfo,
              product_name: row.productName,
              order_status: row.orderStatus,
              order_date: row.date,
              customer_name: row.customerName,
              purchase_order: row.purchaseOrder,
              invoiced_status: row.invoiced,
              classification: row.classification,
              amount: amt,
              invoiced_amount: inv,
              balance_amount: bal,
              project_id: projectId || existingOrder.project_id,
              project_code: projectCode || existingOrder.project_code,
              updated_at: new Date(),
            });
          row.projectId = projectId || existingOrder.project_id;
          row.projectCode = projectCode || existingOrder.project_code;
        } else {
          const [insertedOrder] = await trx("sales_orders")
            .insert({
              tenant_id: "acceleron",
              row_label: row.rowLabel,
              category: row.category,
              currency: row.currency,
              sales_order_number: refKey,
              material_info: row.materialInfo,
              product_name: row.productName,
              order_status: row.orderStatus,
              order_date: row.date,
              customer_name: row.customerName,
              purchase_order: row.purchaseOrder,
              invoiced_status: row.invoiced,
              classification: row.classification,
              amount: amt,
              invoiced_amount: inv,
              balance_amount: bal,
              project_id: projectId,
              project_code: projectCode,
              created_at: new Date(),
              updated_at: new Date(),
            })
            .returning(["id"]);
          row.projectId = projectId;
          row.projectCode = projectCode;
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
