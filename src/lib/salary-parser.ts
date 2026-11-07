/**
 * Pure parsing and validation utilities for employee salary data.
 * Safe to import in both client and server components (no Node/DB dependencies).
 */

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
      errors.push(
        `Line ${rowNumber}: Expected 3 columns (emp code, name, cost of employee), found ${cols.length}. Content: "${line}"`
      );
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
