import { identityDb } from "./db";
import { todayISO } from "./dates";

export interface DarwinboxSyncedEmployee {
  darwinboxRef: string;
  employeeCode: string;
  email: string;
  fullName: string;
  designation: string;
  department: string;
  departmentId?: string;
  location: string;
  grade?: string;
  mappedLevelCode?: string;
  mappedBandId?: string;
  mappedBandName?: string;
  employmentType: string;
  isActive: boolean;
  dateOfJoining: string;
  dateOfExit?: string | null;
  reportingManagerId?: string | null;
  costCenter?: string | null;
  avatarUrl?: string | null;
}

export const DARWINBOX_GRADES_ORDER = [
  "M2",
  "G1",
  "SRG1",
  "G2",
  "SRG2",
  "G3",
  "SRG3",
  "G4",
  "SRG4",
  "G5",
] as const;

export type DarwinboxGrade = typeof DARWINBOX_GRADES_ORDER[number];

export const DARWINBOX_GRADE_DETAILS: Record<
  DarwinboxGrade,
  { rank: number; name: string; title: string; defaultCost: number; defaultRate: number }
> = {
  M2: { rank: 1, name: "Management Trainee", title: "Associate Trainee (M2)", defaultCost: 2500, defaultRate: 5000 },
  G1: { rank: 2, name: "Junior Consultant", title: "Junior Consultant (G1)", defaultCost: 3500, defaultRate: 7000 },
  SRG1: { rank: 3, name: "Senior Junior Consultant", title: "Senior Junior Consultant (SRG1)", defaultCost: 4500, defaultRate: 9000 },
  G2: { rank: 4, name: "Consultant", title: "Consultant (G2)", defaultCost: 6000, defaultRate: 12000 },
  SRG2: { rank: 5, name: "Senior Consultant", title: "Senior Consultant (SRG2)", defaultCost: 8000, defaultRate: 16000 },
  G3: { rank: 6, name: "Lead Consultant", title: "Lead Consultant (G3)", defaultCost: 10500, defaultRate: 21000 },
  SRG3: { rank: 7, name: "Senior Lead Consultant", title: "Senior Lead Consultant (SRG3)", defaultCost: 13500, defaultRate: 27000 },
  G4: { rank: 8, name: "Principal Consultant", title: "Principal Consultant (G4)", defaultCost: 17000, defaultRate: 34000 },
  SRG4: { rank: 9, name: "Senior Principal Consultant", title: "Senior Principal Consultant (SRG4)", defaultCost: 21000, defaultRate: 42000 },
  G5: { rank: 10, name: "Practice Director", title: "Practice Director (G5)", defaultCost: 26000, defaultRate: 52000 },
};

export function mapDarwinboxGradeToLevelCode(grade?: string | null): DarwinboxGrade {
  if (!grade) return "G1";
  const normalized = grade.trim().toUpperCase();
  const directMatch = DARWINBOX_GRADES_ORDER.find((g) => g === normalized);
  if (directMatch) return directMatch;

  for (const g of DARWINBOX_GRADES_ORDER) {
    if (normalized.includes(g)) return g;
  }
  return "G1";
}

export function compareDarwinboxGrades(a?: string | null, b?: string | null): number {
  const gradeA = mapDarwinboxGradeToLevelCode(a);
  const gradeB = mapDarwinboxGradeToLevelCode(b);
  return DARWINBOX_GRADES_ORDER.indexOf(gradeA) - DARWINBOX_GRADES_ORDER.indexOf(gradeB);
}

export function transformDarwinboxEmployee(raw: any): DarwinboxSyncedEmployee {
  return {
    darwinboxRef: raw.employee_id || raw.id || "",
    employeeCode: raw.employee_id || "",
    email: raw.company_email_id || raw.email || "",
    fullName: raw.full_name || raw.name || "",
    designation: raw.designation || raw.job_level || "",
    department: raw.department || "Operations",
    departmentId: raw.department_id,
    location: raw.office_location || raw.location || "",
    grade: raw.job_level || "",
    mappedLevelCode: mapDarwinboxGradeToLevelCode(raw.job_level),
    employmentType: raw.employee_type || "Full Time",
    isActive: true,
    dateOfJoining: raw.date_of_joining || todayISO(),
    reportingManagerId: raw.direct_manager_employee_id || null,
  };
}

// ═══════════════════════════════════════════════════════════════
// Darwinbox master API
//
// Credentials come from the environment. They used to be literals in
// this file — an API key, a dataset key and a Basic auth password for
// a live HR system holding every employee's record.
// ═══════════════════════════════════════════════════════════════

export interface DarwinboxConfig {
  url: string;
  apiKey: string;
  datasetKey: string;
  username: string;
  password: string;
  companyCodes: string[];
}

export class DarwinboxConfigError extends Error {
  constructor(missing: string[]) {
    super(
      `Darwinbox is not configured. Missing in .env.local: ${missing.join(", ")}. ` +
        `See .env.example for the full list.`
    );
    this.name = "DarwinboxConfigError";
  }
}

/**
 * Company codes to keep, e.g. "ASPL". Darwinbox returns every company in
 * the group, so without this the master would fill up with people from
 * other entities.
 */
export function darwinboxCompanyCodes(): string[] {
  return (process.env.DARWINBOX_COMPANY_CODES ?? "ASPL")
    .split(",")
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean);
}

export function getDarwinboxConfig(): DarwinboxConfig {
  const url = process.env.DARWINBOX_MASTER_API_URL ?? "";
  const apiKey = process.env.DARWINBOX_API_KEY ?? "";
  const datasetKey = process.env.DARWINBOX_DATASET_KEY ?? "";
  const username = process.env.DARWINBOX_API_USERNAME ?? "";
  const password = process.env.DARWINBOX_API_PASSWORD ?? "";

  const missing: string[] = [];
  if (!url) missing.push("DARWINBOX_MASTER_API_URL");
  if (!apiKey) missing.push("DARWINBOX_API_KEY");
  if (!datasetKey) missing.push("DARWINBOX_DATASET_KEY");
  if (!username) missing.push("DARWINBOX_API_USERNAME");
  if (!password) missing.push("DARWINBOX_API_PASSWORD");
  if (missing.length > 0) throw new DarwinboxConfigError(missing);

  return { url, apiKey, datasetKey, username, password, companyCodes: darwinboxCompanyCodes() };
}

/** Raw employee record as Darwinbox returns it. */
export interface DarwinboxRawEmployee {
  employee_id?: string;
  full_name?: string;
  company_email_id?: string;
  job_level?: string;
  office_location?: string;
  group_company_code?: string;
  date_of_joining?: string;
  date_of_exit?: string | null;
  employee_type?: string;
  direct_manager_employee_id?: string | null;
  employee_status?: string;
  [key: string]: unknown;
}

/**
 * One call to the master API. Both the sync and the read-only fetch
 * used to duplicate this, credentials and all.
 */
export async function callDarwinboxMasterApi(
  config: DarwinboxConfig = getDarwinboxConfig(),
  timeoutMs = 60_000
): Promise<DarwinboxRawEmployee[]> {
  const auth = Buffer.from(`${config.username}:${config.password}`).toString("base64");

  // Darwinbox can be slow with a large dataset; don't hang the request forever.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(config.url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ api_key: config.apiKey, datasetKey: config.datasetKey }),
      signal: controller.signal,
    });
  } catch (err) {
    if ((err as Error)?.name === "AbortError") {
      throw new Error(`Darwinbox did not respond within ${Math.round(timeoutMs / 1000)}s.`);
    }
    throw new Error(`Could not reach Darwinbox: ${(err as Error)?.message ?? String(err)}`);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    // 401 here almost always means the API username/password, not the api_key.
    const hint =
      response.status === 401 || response.status === 403
        ? " Check DARWINBOX_API_USERNAME and DARWINBOX_API_PASSWORD."
        : "";
    throw new Error(`Darwinbox API error: ${response.status} ${response.statusText}.${hint}`);
  }

  const data = (await response.json()) as { status?: number; message?: string; employee_data?: DarwinboxRawEmployee[] };

  if (data.status !== 1 || !Array.isArray(data.employee_data)) {
    throw new Error(
      `Darwinbox rejected the request${data.message ? `: ${data.message}` : " (unexpected response format)"}.`
    );
  }

  return data.employee_data;
}

/** Keep only the companies we run projects for. */
export function filterByCompanyCode(
  employees: DarwinboxRawEmployee[],
  companyCodes: string[] = darwinboxCompanyCodes()
): DarwinboxRawEmployee[] {
  if (companyCodes.length === 0) return employees;
  const wanted = new Set(companyCodes.map((c) => c.toUpperCase()));
  return employees.filter((emp) =>
    wanted.has(String(emp.group_company_code ?? "").trim().toUpperCase())
  );
}

/** True when Darwinbox says this person has left. */
export function hasExited(emp: DarwinboxRawEmployee): boolean {
  if (emp.date_of_exit) return true;
  return String(emp.employee_status ?? "").toLowerCase() === "inactive";
}

/**
 * Fetch and filter the employee master.
 *
 * Note on incremental sync: the Darwinbox master endpoint returns the
 * whole dataset and takes no date parameter, so there is nothing to be
 * incremental about. An earlier version of this function accepted an
 * `updatedAfter` argument and silently ignored it, which made the
 * "incremental" mode in the admin UI look like it was doing something.
 * Filtering happens here, on the response.
 */
export async function fetchAllDarwinboxEmployees(options?: {
  companyCodes?: string[];
  includeInactive?: boolean;
}): Promise<DarwinboxRawEmployee[]> {
  const config = getDarwinboxConfig();
  const all = await callDarwinboxMasterApi(config);
  const matching = filterByCompanyCode(all, options?.companyCodes ?? config.companyCodes);
  return options?.includeInactive ? matching : matching.filter((emp) => !hasExited(emp));
}

/**
 * Keys never written to raw_payload.
 *
 * The sync route states that salary and CTC are never stored, and that
 * promise has to survive keeping the whole record. Tax and identity
 * numbers go the same way — the project has no use for them, and a
 * payroll-grade identifier sitting in an app database is a liability,
 * not a feature.
 *
 * Matching is substring-based and case-insensitive, so "gross_salary"
 * and "annual_ctc_inr" are both caught. Extend with DARWINBOX_REDACT_FIELDS.
 */
export const DEFAULT_REDACTED_FIELDS = [
  "salary", "ctc", "compensation", "payroll", "gross", "net_pay", "basic_pay",
  "pan", "aadhaar", "aadhar", "passport", "uan", "pf_number", "esic",
  "bank", "ifsc", "account_number",
  "date_of_birth", "dob",
];

export function redactedFieldPatterns(): string[] {
  const extra = (process.env.DARWINBOX_REDACT_FIELDS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return [...DEFAULT_REDACTED_FIELDS, ...extra];
}

/** Strip sensitive keys before the record is persisted. */
export function redactEmployee(
  emp: DarwinboxRawEmployee,
  patterns: string[] = redactedFieldPatterns()
): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(emp)) {
    const lower = key.toLowerCase();
    if (patterns.some((p) => lower.includes(p))) continue;
    clean[key] = value;
  }
  return clean;
}

// ─── Mapping the response ──────────────────────────────────────────

/**
 * Read the first key that is present and non-empty.
 *
 * Darwinbox field names vary between tenants and dataset configurations
 * (designation vs job_title, department vs department_name, and so on),
 * so each value is looked up through a list of likely spellings rather
 * than one hardcoded key.
 */
export function pickField(emp: DarwinboxRawEmployee, keys: string[]): string | null {
  for (const key of keys) {
    const value = emp[key];
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text && text.toLowerCase() !== "null") return text;
  }
  return null;
}

/** Everything we persist for one employee, from whatever the API sent. */
export function mapEmployeeRow(emp: DarwinboxRawEmployee, syncedAt: string) {
  return {
    company_email_id: pickField(emp, ["company_email_id", "official_email", "email", "work_email"]),
    full_name: pickField(emp, ["full_name", "employee_name", "name", "display_name"]),
    job_level: pickField(emp, ["job_level", "grade", "band", "level"]),
    designation: pickField(emp, ["designation", "job_title", "title", "role"]),
    department: pickField(emp, ["department", "department_name", "function"]),
    department_id: pickField(emp, ["department_id", "departmentId"]),
    business_unit: pickField(emp, ["business_unit", "businessunit", "bu", "sub_department"]),
    cost_center: pickField(emp, ["cost_center", "costcenter", "cost_centre"]),
    office_location: pickField(emp, ["office_location", "location", "work_location", "base_location"]),
    group_company_code: pickField(emp, ["group_company_code", "company_code", "legal_entity_code"]),
    date_of_joining: pickField(emp, ["date_of_joining", "doj", "joining_date"]),
    date_of_exit: pickField(emp, ["date_of_exit", "dol", "last_working_day", "exit_date"]),
    employee_type: pickField(emp, ["employee_type", "employment_type", "worker_type"]),
    employee_status: pickField(emp, ["employee_status", "status", "employment_status"]),
    direct_manager_employee_id: pickField(emp, [
      "direct_manager_employee_id",
      "reporting_manager_employee_id",
      "manager_employee_id",
    ]),
    reporting_manager_name: pickField(emp, [
      "reporting_manager_name",
      "direct_manager_name",
      "manager_name",
    ]),
    mobile_number: pickField(emp, ["mobile_number", "mobile", "phone", "contact_number"]),
    avatar_url: pickField(emp, ["profile_picture", "photo_url", "avatar_url", "image_url"]),
    is_active: !hasExited(emp),
    // The rest of the record, so an unmapped field is never lost —
    // minus anything matching the redaction list above.
    raw_payload: JSON.stringify(redactEmployee(emp)),
    last_synced_at: syncedAt,
    updated_at: syncedAt,
  };
}

export interface DarwinboxSyncResult {
  success: boolean;
  message: string;
  companyCodes?: string[];
  totalFromApi?: number;
  totalProcessed?: number;
  created?: number;
  updated?: number;
  deactivated?: number;
  skipped?: number;
  error?: string;
}

/**
 * Pull the employee master from Darwinbox into identity_db.employee_master.
 *
 * `deactivateMissing` flags people the API no longer returns, so leavers
 * stop appearing in pickers. It only runs when the API returned a
 * plausible dataset — a transient empty response must never wipe the
 * whole master.
 */
export async function syncDarwinboxEmployees(options?: {
  companyCodes?: string[];
  deactivateMissing?: boolean;
  dryRun?: boolean;
}): Promise<DarwinboxSyncResult> {
  const deactivateMissing = options?.deactivateMissing ?? true;

  try {
    const config = getDarwinboxConfig();
    const companyCodes = options?.companyCodes ?? config.companyCodes;

    const all = await callDarwinboxMasterApi(config);
    const matching = filterByCompanyCode(all, companyCodes);

    if (options?.dryRun) {
      return {
        success: true,
        message: `Dry run: ${matching.length} of ${all.length} employees match ${companyCodes.join(", ")}. Nothing written.`,
        companyCodes,
        totalFromApi: all.length,
        totalProcessed: matching.length,
      };
    }

    const now = new Date().toISOString();
    let created = 0;
    let updated = 0;
    let skipped = 0;
    const seen: string[] = [];

    for (const emp of matching) {
      const employeeId = emp.employee_id ? String(emp.employee_id).trim() : "";
      if (!employeeId) {
        // Without an id there is nothing stable to match on.
        skipped++;
        continue;
      }
      seen.push(employeeId);

      const payload = mapEmployeeRow(emp, now);

      const existing = await identityDb("employee_master")
        .where("employee_id", employeeId)
        .first();

      if (existing) {
        await identityDb("employee_master").where("employee_id", employeeId).update(payload);
        updated++;
      } else {
        await identityDb("employee_master").insert({
          employee_id: employeeId,
          created_at: now,
          ...payload,
        });
        created++;
      }
    }

    // ─── Leavers ──────────────────────────────────────────────────
    let deactivated = 0;
    if (deactivateMissing && seen.length > 0) {
      deactivated = await identityDb("employee_master")
        .whereIn("group_company_code", companyCodes)
        .whereNotIn("employee_id", seen)
        .andWhere("is_active", true)
        .update({ is_active: false, updated_at: now });
    }

    const parts = [
      `${matching.length} employee(s) matched ${companyCodes.join(", ")} out of ${all.length} returned`,
      `${created} created`,
      `${updated} updated`,
    ];
    if (deactivated) parts.push(`${deactivated} marked inactive`);
    if (skipped) parts.push(`${skipped} skipped (no employee id)`);

    return {
      success: true,
      message: parts.join(", ") + ".",
      companyCodes,
      totalFromApi: all.length,
      totalProcessed: matching.length,
      created,
      updated,
      deactivated,
      skipped,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[darwinbox] Employee sync failed:", message);
    return { success: false, message, error: message };
  }
}
