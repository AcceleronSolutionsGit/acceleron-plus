/**
 * Employee Salary & Individual Cost Management Service
 *
 * Implements:
 * 1. 3-column parser (emp code, name, cost of employee) for Excel copy-paste & CSV
 * 2. Excel template generation & Excel file parsing
 * 3. Atomic database updates across employee_salaries, employee_master, and project_team_members
 * 4. Project cost propagation ("changes the cost in projects as well. no more grade wise avg.")
 */

import ExcelJS from "exceljs";
import { identityDb, projectDb } from "./db.ts";

export interface ParsedSalaryRow {
  empCode: string;
  name: string;
  cost: number;
  rowNumber: number;
}

export interface SalaryUpdateOutcome {
  success: boolean;
  totalParsed: number;
  updatedCount: number;
  createdCount: number;
  affectedAllocationsCount: number;
  affectedProjectsCount: number;
  errors: { rowNumber?: number; empCode?: string; message: string }[];
  updatedEmployees: { empCode: string; name: string; cost: number; allocationsUpdated: number }[];
}

/**
 * Parses numeric cost values stripping currency symbols, commas, spaces, "/day", etc.
 */
export function cleanNumericCost(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return Number.isFinite(raw) && raw >= 0 ? raw : null;
  const str = String(raw).trim();
  if (!str) return null;
  // Remove ₹, $, commas, "/day", "/d", etc.
  const cleaned = str.replace(/[₹$,\s]|(\/d(ay)?)/gi, "");
  const num = parseFloat(cleaned);
  return Number.isFinite(num) && num >= 0 ? Math.round((num + Number.EPSILON) * 100) / 100 : null;
}

/**
 * Parses copy-pasted text from Excel/Google Sheets (tab-delimited or CSV).
 * Expected columns:
 * 1. emp code
 * 2. name
 * 3. cost of employee
 */
export function parseSalaryPasteText(text: string): { rows: ParsedSalaryRow[]; errors: string[] } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const rows: ParsedSalaryRow[] = [];
  const errors: string[] = [];

  if (lines.length === 0) {
    return { rows, errors: ["No data provided to parse."] };
  }

  // Check if first row is a header
  const isHeaderRow = (cols: string[]): boolean => {
    const joined = cols.join(" ").toLowerCase();
    return (
      (joined.includes("emp") || joined.includes("code") || joined.includes("id")) &&
      (joined.includes("name") || joined.includes("cost") || joined.includes("salary"))
    );
  };

  const splitLine = (line: string): string[] => {
    // If contains tabs, split by tab (standard Excel copy-paste)
    if (line.includes("\t")) {
      return line.split("\t").map((c) => c.trim());
    }
    // If contains commas, split by comma (CSV)
    if (line.includes(",")) {
      return line.split(",").map((c) => c.trim().replace(/^["']|["']$/g, ""));
    }
    // Fallback: split by 2 or more spaces or pipes
    if (line.includes("|")) {
      return line.split("|").map((c) => c.trim());
    }
    return line.split(/\s{2,}/).map((c) => c.trim());
  };

  let startIndex = 0;
  const firstCols = splitLine(lines[0]);
  if (isHeaderRow(firstCols)) {
    startIndex = 1;
  }

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
    const rowNumber = i + 1;
    const cols = splitLine(line);

    if (cols.length < 3) {
      errors.push(`Line ${rowNumber}: Expected 3 columns (emp code, name, cost of employee), found ${cols.length}. Content: "${line}"`);
      continue;
    }

    const empCode = cols[0].trim();
    const name = cols[1].trim();
    const cost = cleanNumericCost(cols[2]);

    if (!empCode) {
      errors.push(`Line ${rowNumber}: Employee code cannot be empty.`);
      continue;
    }

    if (cost === null || cost < 0) {
      errors.push(`Line ${rowNumber} (Emp Code: ${empCode}): Invalid cost value "${cols[2]}". Must be a positive number.`);
      continue;
    }

    rows.push({
      empCode,
      name,
      cost,
      rowNumber,
    });
  }

  return { rows, errors };
}

/**
 * Parses an Excel (.xlsx) file buffer.
 */
export async function parseSalaryExcelBuffer(buffer: Buffer): Promise<{ rows: ParsedSalaryRow[]; errors: string[] }> {
  const workbook = new ExcelJS.Workbook();
  // @ts-expect-error - ExcelJS accepts Buffer
  await workbook.xlsx.load(buffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    return { rows: [], errors: ["No worksheet found in Excel file."] };
  }

  const rows: ParsedSalaryRow[] = [];
  const errors: string[] = [];

  let headerRowIndex = 1;
  let empColIndex = 1;
  let nameColIndex = 2;
  let costColIndex = 3;
  let foundHeaders = false;

  // Inspect first 5 rows to locate header columns
  for (let r = 1; r <= Math.min(5, worksheet.rowCount); r++) {
    const row = worksheet.getRow(r);
    for (let c = 1; c <= Math.min(10, row.cellCount); c++) {
      const val = String(row.getCell(c).value ?? "").toLowerCase().trim();
      if (val.includes("cost") || val.includes("salary") || val.includes("rate")) {
        costColIndex = c;
        foundHeaders = true;
      } else if (
        val.includes("code") ||
        val.includes("id") ||
        (val.includes("emp") && !val.includes("cost") && !val.includes("salary"))
      ) {
        empColIndex = c;
        foundHeaders = true;
      } else if (val.includes("name")) {
        nameColIndex = c;
      }
    }
    if (foundHeaders) {
      headerRowIndex = r;
      break;
    }
  }

  const startRow = foundHeaders ? headerRowIndex + 1 : 1;

  for (let r = startRow; r <= worksheet.rowCount; r++) {
    const row = worksheet.getRow(r);
    const rawEmp = row.getCell(empColIndex).value;
    const rawName = row.getCell(nameColIndex).value;
    const rawCost = row.getCell(costColIndex).value;

    const empCode = rawEmp ? String(rawEmp).trim() : "";
    const name = rawName ? String(rawName).trim() : "";
    if (!empCode && !name && !rawCost) continue; // blank line

    const cost = cleanNumericCost(rawCost);

    if (!empCode) {
      errors.push(`Row ${r}: Employee code is missing.`);
      continue;
    }

    if (cost === null || cost < 0) {
      errors.push(`Row ${r} (${empCode}): Invalid cost value "${rawCost}".`);
      continue;
    }

    rows.push({
      empCode,
      name,
      cost,
      rowNumber: r,
    });
  }

  return { rows, errors };
}

/**
 * Updates individual employee salaries in employee_salaries and employee_master,
 * and immediately propagates the new costs to project allocations across all projects.
 */
export async function applySalaryUpdates(
  items: ParsedSalaryRow[],
  updatedByEmail: string
): Promise<SalaryUpdateOutcome> {
  let updatedCount = 0;
  let createdCount = 0;
  let totalAllocationsUpdated = 0;
  const affectedProjectsSet = new Set<string>();
  const errors: { rowNumber?: number; empCode?: string; message: string }[] = [];
  const updatedEmployees: { empCode: string; name: string; cost: number; allocationsUpdated: number }[] = [];

  // Pre-fetch all matching employees from employee_master and users
  const empCodes = Array.from(new Set(items.map((i) => i.empCode)));
  const masterEmps = await identityDb("employee_master")
    .whereIn("employee_id", empCodes)
    .select("employee_id", "full_name", "company_email_id", "cost_rate_inr");
  const masterMap = new Map<string, typeof masterEmps[0]>();
  for (const m of masterEmps) masterMap.set(String(m.employee_id).trim(), m);

  const matchedUsers = await identityDb("users")
    .whereIn("darwinbox_ref", empCodes)
    .select("id", "darwinbox_ref", "email");
  const userMap = new Map<string, string>(); // empCode -> userId
  for (const u of matchedUsers) {
    if (u.darwinbox_ref) userMap.set(String(u.darwinbox_ref).trim(), String(u.id));
  }

  for (const item of items) {
    const { empCode, name, cost, rowNumber } = item;

    try {
      // 1. Upsert into identity_db.employee_salaries
      const existingSalary = await identityDb("employee_salaries")
        .where("employee_id", empCode)
        .first();

      if (existingSalary) {
        await identityDb("employee_salaries")
          .where("employee_id", empCode)
          .update({
            employee_name: name || existingSalary.employee_name,
            cost_per_day: cost,
            updated_by_email: updatedByEmail,
            updated_at: new Date(),
          });
        updatedCount++;
      } else {
        await identityDb("employee_salaries").insert({
          employee_id: empCode,
          employee_name: name,
          cost_per_day: cost,
          currency: "INR",
          updated_by_email: updatedByEmail,
          created_at: new Date(),
          updated_at: new Date(),
        });
        createdCount++;
      }

      // 2. Update employee_master.cost_rate_inr if the employee exists in master
      const inMaster = masterMap.get(empCode);
      if (inMaster) {
        await identityDb("employee_master")
          .where("employee_id", empCode)
          .update({
            cost_rate_inr: cost,
            updated_at: new Date(),
          });
      }

      // 3. Propagate to project_team_members
      // "when the costs are updated make sure that it changes the cost in projects as well. no more grade wise avg."
      const userId = userMap.get(empCode);

      // Find all team allocations for this person
      const memberRows = await projectDb("project_team_members")
        .where(function () {
          this.where("employee_id", empCode);
          if (userId) this.orWhere("user_id", userId);
        })
        .select("id", "project_id", "planned_days", "daily_cost_inr");

      let allocationsForThisEmp = 0;

      if (memberRows.length > 0) {
        for (const m of memberRows) {
          const plannedDays = Number(m.planned_days ?? 0);
          const newPlannedCost = Math.round((plannedDays * cost + Number.EPSILON) * 100) / 100;

          await projectDb("project_team_members")
            .where("id", m.id)
            .update({
              daily_cost_inr: cost,
              custom_daily_cost_inr: cost,
              planned_cost_inr: newPlannedCost,
              updated_at: new Date(),
            });

          affectedProjectsSet.add(String(m.project_id));
          allocationsForThisEmp++;
        }
        totalAllocationsUpdated += allocationsForThisEmp;
      }

      updatedEmployees.push({
        empCode,
        name: name || inMaster?.full_name || empCode,
        cost,
        allocationsUpdated: allocationsForThisEmp,
      });
    } catch (err: any) {
      console.error(`Failed to update salary for ${empCode}:`, err);
      errors.push({
        rowNumber,
        empCode,
        message: err.message || "Failed to persist salary in database.",
      });
    }
  }

  return {
    success: errors.length === 0,
    totalParsed: items.length,
    updatedCount,
    createdCount,
    affectedAllocationsCount: totalAllocationsUpdated,
    affectedProjectsCount: affectedProjectsSet.size,
    errors,
    updatedEmployees,
  };
}

/**
 * Generates an Excel template with the exact 3 required columns:
 *   1. emp code
 *   2. name
 *   3. cost of employee
 * Pre-filled with active employees from employee_master for copy-pasting.
 */
export async function generateSalaryExcelTemplate(): Promise<Buffer> {
  const employees = await identityDb("employee_master")
    .where("is_active", true)
    .select("employee_id", "full_name", "cost_rate_inr", "designation", "department")
    .orderBy("employee_id", "asc");

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Acceleron Plus";
  workbook.lastModifiedBy = "Acceleron Plus";
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet("Salaries Template", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  // 3 required columns
  worksheet.columns = [
    { header: "emp code", key: "empCode", width: 18 },
    { header: "name", key: "name", width: 32 },
    { header: "cost of employee", key: "cost", width: 22 },
  ];

  // Format header row
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11, name: "Arial" };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF0B192C" }, // navy-900
  };
  headerRow.alignment = { vertical: "middle", horizontal: "left" };
  headerRow.height = 28;

  // Add employee data
  for (const emp of employees) {
    const row = worksheet.addRow({
      empCode: emp.employee_id,
      name: emp.full_name || "",
      cost: emp.cost_rate_inr ? Number(emp.cost_rate_inr) : "",
    });

    row.font = { size: 10, name: "Arial" };
    row.getCell("cost").numFmt = "₹#,##0.00";
  }

  const rawBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(rawBuffer);
}

/**
 * Generates plain CSV template string for clipboard copy or raw text download.
 */
export async function generateSalaryCsvTemplate(): Promise<string> {
  const employees = await identityDb("employee_master")
    .where("is_active", true)
    .select("employee_id", "full_name", "cost_rate_inr")
    .orderBy("employee_id", "asc");

  const lines = ["emp code\tname\tcost of employee"];
  for (const emp of employees) {
    const cost = emp.cost_rate_inr ? String(emp.cost_rate_inr) : "";
    lines.push(`${emp.employee_id}\t${emp.full_name || ""}\t${cost}`);
  }
  return lines.join("\n");
}
