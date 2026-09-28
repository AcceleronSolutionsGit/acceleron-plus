// ═══════════════════════════════════════════════════════════════
// sync-darwinbox.js — pull the employee master from Darwinbox
//
// Run:
//   node src/lib/seeds/sync-darwinbox.js
//
// Options:
//   --company ASPL[,XYZ]   Company codes to keep.
//                          Default: DARWINBOX_COMPANY_CODES, else ASPL.
//   --dry-run              Fetch and report, write nothing.
//   --include-inactive     Keep people who have left.
//   --keep-missing         Don't mark absent employees inactive.
//
// Credentials come from .env.local — see .env.example.
// ═══════════════════════════════════════════════════════════════

const { identityDb, closeAll } = require("../db-config");

// ─── Arguments ────────────────────────────────────────────────────

function parseArgs(argv) {
  const opts = {
    companyCodes: null,
    dryRun: false,
    includeInactive: false,
    deactivateMissing: true,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--company" || arg === "--company-code") opts.companyCodes = argv[++i];
    else if (arg.startsWith("--company=")) opts.companyCodes = arg.split("=")[1];
    else if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--include-inactive") opts.includeInactive = true;
    else if (arg === "--keep-missing") opts.deactivateMissing = false;
    else console.warn(`  ! Ignoring unrecognised argument: ${arg}`);
  }
  opts.companyCodes = opts.companyCodes
    ? opts.companyCodes.split(",").map((c) => c.trim().toUpperCase()).filter(Boolean)
    : (process.env.DARWINBOX_COMPANY_CODES || "ASPL")
        .split(",")
        .map((c) => c.trim().toUpperCase())
        .filter(Boolean);
  return opts;
}

// ─── Darwinbox ────────────────────────────────────────────────────

function readConfig() {
  const config = {
    url: process.env.DARWINBOX_MASTER_API_URL,
    apiKey: process.env.DARWINBOX_API_KEY,
    datasetKey: process.env.DARWINBOX_DATASET_KEY,
    username: process.env.DARWINBOX_API_USERNAME,
    password: process.env.DARWINBOX_API_PASSWORD,
  };
  const missing = Object.entries(config)
    .filter(([, v]) => !v)
    .map(([k]) => "DARWINBOX_" + k.replace(/[A-Z]/g, (c) => "_" + c).toUpperCase());

  if (missing.length > 0) {
    console.error("\n  ✖ Darwinbox is not configured. Add these to .env.local:\n");
    console.error("      DARWINBOX_MASTER_API_URL=");
    console.error("      DARWINBOX_API_KEY=");
    console.error("      DARWINBOX_DATASET_KEY=");
    console.error("      DARWINBOX_API_USERNAME=");
    console.error("      DARWINBOX_API_PASSWORD=");
    console.error("\n    See .env.example.\n");
    process.exit(1);
  }
  return config;
}

async function fetchEmployees(config) {
  const auth = Buffer.from(`${config.username}:${config.password}`).toString("base64");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);

  let response;
  try {
    response = await fetch(config.url, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: config.apiKey, datasetKey: config.datasetKey }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === "AbortError") throw new Error("Darwinbox did not respond within 60s.");
    throw new Error(`Could not reach Darwinbox: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const hint =
      response.status === 401 || response.status === 403
        ? " Check DARWINBOX_API_USERNAME and DARWINBOX_API_PASSWORD."
        : "";
    throw new Error(`Darwinbox API error: ${response.status} ${response.statusText}.${hint}`);
  }

  const data = await response.json();
  if (data.status !== 1 || !Array.isArray(data.employee_data)) {
    throw new Error(
      `Darwinbox rejected the request${data.message ? `: ${data.message}` : " (unexpected response format)"}.`
    );
  }
  return data.employee_data;
}

const hasExited = (emp) =>
  Boolean(emp.date_of_exit) || String(emp.employee_status || "").toLowerCase() === "inactive";

// Keys never written to raw_payload. The sync route promises salary and
// CTC are never stored; tax and identity numbers go the same way.
// Mirrors DEFAULT_REDACTED_FIELDS in src/lib/darwinbox.ts.
const DEFAULT_REDACTED_FIELDS = [
  "salary", "ctc", "compensation", "payroll", "gross", "net_pay", "basic_pay",
  "pan", "aadhaar", "aadhar", "passport", "uan", "pf_number", "esic",
  "bank", "ifsc", "account_number",
  "date_of_birth", "dob",
];

function redactedFieldPatterns() {
  const extra = (process.env.DARWINBOX_REDACT_FIELDS || "")
    .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return [...DEFAULT_REDACTED_FIELDS, ...extra];
}

function redactEmployee(emp, patterns = redactedFieldPatterns()) {
  const clean = {};
  for (const [key, value] of Object.entries(emp)) {
    if (patterns.some((p) => key.toLowerCase().includes(p))) continue;
    clean[key] = value;
  }
  return clean;
}

// Field names vary between Darwinbox tenants, so each value is looked up
// through a list of likely spellings. Mirrors mapEmployeeRow in
// src/lib/darwinbox.ts — keep the two in step.
function pickField(emp, keys) {
  for (const key of keys) {
    const value = emp[key];
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text && text.toLowerCase() !== "null") return text;
  }
  return null;
}

function mapEmployeeRow(emp, syncedAt) {
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
    raw_payload: JSON.stringify(redactEmployee(emp)),
    last_synced_at: syncedAt,
    updated_at: syncedAt,
  };
}

/** Which keys the API actually sent, and how often they carry a value. */
function reportFields(employees) {
  const counts = new Map();
  for (const emp of employees) {
    for (const [key, value] of Object.entries(emp)) {
      if (!counts.has(key)) counts.set(key, 0);
      const filled = value !== null && value !== undefined && String(value).trim() !== "";
      if (filled) counts.set(key, counts.get(key) + 1);
    }
  }
  const mapped = new Set(Object.keys(mapEmployeeRow(employees[0] ?? {}, "")));
  const known = new Set([
    "company_email_id","official_email","email","work_email","full_name","employee_name","name",
    "display_name","job_level","grade","band","level","designation","job_title","title","role",
    "department","department_name","function","department_id","departmentId","business_unit",
    "businessunit","bu","sub_department","cost_center","costcenter","cost_centre","office_location",
    "location","work_location","base_location","group_company_code","company_code","legal_entity_code",
    "date_of_joining","doj","joining_date","date_of_exit","dol","last_working_day","exit_date",
    "employee_type","employment_type","worker_type","employee_status","status","employment_status",
    "direct_manager_employee_id","reporting_manager_employee_id","manager_employee_id",
    "reporting_manager_name","direct_manager_name","manager_name","mobile_number","mobile","phone",
    "contact_number","profile_picture","photo_url","avatar_url","image_url","employee_id",
  ]);
  void mapped;

  console.log("\n  Fields in the response (populated / total):");
  [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([key, n]) => {
      const redacted = redactedFieldPatterns().some((pat) => key.toLowerCase().includes(pat));
      const tag = redacted
        ? "   ← REDACTED, not stored"
        : known.has(key)
          ? ""
          : "   ← stored only in raw_payload";
      console.log(`    ${key.padEnd(34)} ${String(n).padStart(5)}/${employees.length}${tag}`);
    });
  console.log("\n  Everything is kept in raw_payload; the columns above are the mapped subset.");
}

// ─── Main ─────────────────────────────────────────────────────────

async function run() {
  const opts = parseArgs(process.argv.slice(2));

  console.log("\n👥 Syncing the employee master from Darwinbox\n");
  console.log(`  Company codes : ${opts.companyCodes.join(", ")}`);
  console.log(`  Leavers       : ${opts.includeInactive ? "included" : "excluded"}`);
  if (opts.dryRun) console.log("  Mode          : DRY RUN — nothing will be written");
  console.log("");

  if (!(await identityDb.schema.hasTable("employee_master"))) {
    console.error("  ✖ identity_db.employee_master does not exist. Run:");
    console.error("      node src/lib/migrations/migrate-employee-master.js\n");
    process.exit(1);
  }

  const config = readConfig();

  console.log("  → calling the master API…");
  const all = await fetchEmployees(config);
  console.log(`    ${all.length} employee record(s) returned`);

  // Show what company codes actually came back — the usual reason a sync
  // lands zero rows is that the expected code is spelled differently.
  const codeCounts = {};
  for (const emp of all) {
    const code = String(emp.group_company_code || "(none)").trim().toUpperCase();
    codeCounts[code] = (codeCounts[code] || 0) + 1;
  }
  console.log("    company codes present:");
  Object.entries(codeCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([code, n]) => {
      const kept = opts.companyCodes.includes(code) ? " ← keeping" : "";
      console.log(`      ${code.padEnd(12)} ${String(n).padStart(5)}${kept}`);
    });

  const wanted = new Set(opts.companyCodes);
  let matching = all.filter((emp) =>
    wanted.has(String(emp.group_company_code || "").trim().toUpperCase())
  );
  if (!opts.includeInactive) matching = matching.filter((emp) => !hasExited(emp));

  console.log(`\n  → ${matching.length} employee(s) match\n`);

  if (matching.length === 0) {
    console.log("  Nothing to write. Check --company against the codes listed above.\n");
    return;
  }

  if (opts.dryRun) {
    reportFields(matching);
    console.log("\n  Sample of what would be written:");
    matching.slice(0, 5).forEach((emp) => {
      console.log(
        `    ${String(emp.employee_id).padEnd(12)} ${String(emp.full_name || "").padEnd(28)} ${emp.job_level || "-"}`
      );
    });
    console.log(`\n  Dry run complete — nothing written.\n`);
    return;
  }

  const now = new Date().toISOString();
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const seen = [];

  for (const emp of matching) {
    const employeeId = emp.employee_id ? String(emp.employee_id).trim() : "";
    if (!employeeId) {
      skipped++;
      continue;
    }
    seen.push(employeeId);

    const payload = mapEmployeeRow(emp, now);

    const existing = await identityDb("employee_master").where("employee_id", employeeId).first();
    if (existing) {
      await identityDb("employee_master").where("employee_id", employeeId).update(payload);
      updated++;
    } else {
      await identityDb("employee_master").insert({ employee_id: employeeId, created_at: now, ...payload });
      created++;
    }

    if ((created + updated) % 50 === 0) {
      console.log(`    … ${created + updated}/${matching.length}`);
    }
  }

  let deactivated = 0;
  if (opts.deactivateMissing && seen.length > 0) {
    deactivated = await identityDb("employee_master")
      .whereIn("group_company_code", opts.companyCodes)
      .whereNotIn("employee_id", seen)
      .andWhere("is_active", true)
      .update({ is_active: false, updated_at: now });
  }

  console.log("\n✅ Employee master synced.");
  console.log(`   created     : ${created}`);
  console.log(`   updated     : ${updated}`);
  if (deactivated) console.log(`   deactivated : ${deactivated} (no longer returned by Darwinbox)`);
  if (skipped) console.log(`   skipped     : ${skipped} (no employee id)`);

  const total = await identityDb("employee_master").count("* as n").first();
  console.log(`\n   employee_master now holds ${total.n} row(s).`);
  console.log("   Next: node src/lib/seeds/seed-comprehensive.js to build users from them.\n");
}

run()
  .catch((err) => {
    console.error("\n✖ Sync failed:", err.message);
    process.exitCode = 1;
  })
  .finally(closeAll);
