// Types for allocation-import.js — hand-written because the module is
// CommonJS so that `node` can run it directly for the CLI import,
// while the admin upload route imports the very same file.

import type { Knex } from "knex";

export type RowOutcome = "ready" | "skipped" | "error";

export interface AllocationImportColumn {
  key: string;
  label: string;
  required: boolean;
  aliases: string[];
}

export interface RawAllocationRow {
  rowNumber: number;
  employee: unknown;
  project: unknown;
  role: unknown;
  allocation: unknown;
  startDate: unknown;
  endDate: unknown;
  notes: unknown;
  submittedBy: unknown;
  submittedAt: unknown;
}

export interface ResolvedAllocationRow {
  rowNumber: number;
  employeeRaw: string;
  projectRaw: string;
  role: string | null;
  notes: string | null;
  submittedBy: string | null;
  employeeId: string | null;
  employeeName: string | null;
  projectId: string | null;
  projectCode: string | null;
  projectName: string | null;
  allocationPercent: number | null;
  startDate: string | null;
  endDate: string | null;
  /** Their total across every live project once this row lands. */
  totalAfter: number | null;
  outcome: RowOutcome;
  /** Why it was refused, or why it was skipped. */
  messages: string[];
  /** Worth knowing, but not a reason to refuse the row. */
  warnings: string[];
}

export interface AllocationImportSummary {
  total: number;
  ready: number;
  skipped: number;
  errors: number;
  overAllocated: number;
  inserted?: number;
  failed?: number;
}

export interface ParsedAllocationFile {
  sheetName: string;
  headerRowNumber: number;
  headers: string[];
  mapping: Record<string, number>;
  missingColumns: string[];
  rows: RawAllocationRow[];
}

export type AllocationImportResult =
  | { ok: false; error: string; parsed?: ParsedAllocationFile }
  | {
      ok: true;
      committed: boolean;
      sheetName: string;
      rows: ResolvedAllocationRow[];
      summary: AllocationImportSummary;
    };

export interface AllocationImportOptions {
  buffer: Buffer;
  filename?: string;
  identityDb: Knex;
  projectDb: Knex;
  /** Nothing is written unless this is true. */
  commit?: boolean;
  importedBy?: string | null;
  /** How to read an ambiguous 03/04/2026. Day-first by default. */
  dateOrder?: "dmy" | "mdy";
}

export declare const COLUMN_SPECS: AllocationImportColumn[];
export declare const FORM_QUESTIONS: AllocationImportColumn[];

export declare function parseAllocationFile(
  buffer: Buffer,
  options?: { filename?: string }
): Promise<ParsedAllocationFile>;

export declare function loadReference(options: {
  identityDb: Knex;
  projectDb: Knex;
}): Promise<Record<string, unknown>>;

export declare function resolveAllocationRows(
  rows: RawAllocationRow[],
  options: {
    identityDb: Knex;
    projectDb: Knex;
    dateOrder?: "dmy" | "mdy";
    reference?: unknown;
  }
): Promise<{
  rows: ResolvedAllocationRow[];
  summary: AllocationImportSummary;
  reference: unknown;
}>;

export declare function commitAllocationRows(
  rows: ResolvedAllocationRow[],
  options: {
    identityDb: Knex;
    projectDb: Knex;
    reference: unknown;
    importedBy?: string | null;
  }
): Promise<{
  inserted: number;
  failed: number;
  skipped: number;
  errors: number;
  results: Array<{ rowNumber: number; outcome: string; error?: string }>;
}>;

export declare function runAllocationImport(
  options: AllocationImportOptions
): Promise<AllocationImportResult>;

export declare function buildChoiceLists(options: {
  identityDb: Knex;
  projectDb: Knex;
  includeInactive?: boolean;
}): Promise<{
  employees: string[];
  projects: string[];
  counts: { employees: number; projects: number };
}>;

export declare function toDateString(
  value: unknown,
  dateOrder?: "dmy" | "mdy"
): string | null | undefined;
export declare function splitLabelled(raw: unknown): {
  code: string;
  rest: string;
  raw: string;
};
