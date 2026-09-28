// ═══════════════════════════════════════════════════════════════
// migrate-team-roles.js
//
// Run:  node src/lib/migrations/migrate-team-roles.js            (apply)
//       node src/lib/migrations/migrate-team-roles.js --dry-run  (look first)
//
// A project team now has exactly three roles — Developer, Team Lead and
// PM — any number of each. role_in_project used to be free text, so this
// rewrites the old titles onto the three:
//
//   "Project Manager", "Delivery Manager", "PM"…      → PM
//   "Technical Lead", "Solution Architect", "Lead"…    → Team Lead
//   everything else ("Senior Consultant", "QA", blank) → Developer
//
// PM unlocks the project's finances, and self-allocation used to offer
// "Project Manager" to anybody. So an old PM-like title only becomes PM
// when the person is the PM named on the project, or their account role
// is pm/admin. Anyone else lands on Team Lead and is listed at the end
// for an admin to promote from the Team tab if that was right.
//
// Client-contact rows are not team roles and are left exactly as they
// are. Also tidies project_allocation_requests.requested_role.
//
// Idempotent: a row already holding one of the three is not touched.
// ═══════════════════════════════════════════════════════════════

const { identityDb, projectDb, closeAll } = require("../db-config");
const { TEAM_ROLES, PM, TEAM_LEAD, toTeamRole, legacyToTeamRole, isClientContactRole } = require("../team-roles");

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  console.log(`\n▶ Team roles → Developer / Team Lead / PM${DRY_RUN ? "  (dry run — nothing is written)" : ""}\n`);

  if (!(await projectDb.schema.hasTable("project_team_members"))) {
    console.log("  ⏭  project_team_members does not exist yet — nothing to do.");
    return;
  }

  const [rows, projects, users] = await Promise.all([
    projectDb("project_team_members").select("id", "project_id", "user_id", "user_name", "role_in_project"),
    projectDb("projects").select("id", "code", "project_manager_user_id"),
    identityDb("users as u")
      .leftJoin("roles as r", "r.id", "u.role_id")
      .select("u.id", identityDb.ref("r.code").as("role_code"))
      .catch(() => []),
  ]);

  const namedPm = new Map(projects.map((p) => [String(p.id), p.project_manager_user_id ? String(p.project_manager_user_id) : null]));
  const codeOf = new Map(projects.map((p) => [String(p.id), p.code]));
  // Same mapping as session.ts deriveAppRole: role code → admin | pm | client | member.
  const appRole = (code) => {
    const c = String(code ?? "").toLowerCase();
    if (["admin", "super_admin", "tenant_admin"].includes(c)) return "admin";
    if (["pm", "project_manager", "delivery_manager"].includes(c)) return "pm";
    if (["client", "customer"].includes(c)) return "client";
    return "member";
  };
  const accountRole = new Map(users.map((u) => [String(u.id), appRole(u.role_code)]));

  const counts = Object.fromEntries(TEAM_ROLES.map((r) => [r, 0]));
  let unchanged = 0;
  let clients = 0;
  const review = [];

  for (const row of rows) {
    const current = row.role_in_project;
    if (TEAM_ROLES.includes(current)) {
      unchanged++;
      continue;
    }
    if (isClientContactRole(current) || accountRole.get(String(row.user_id)) === "client") {
      clients++;
      continue;
    }

    let next = toTeamRole(current) ?? legacyToTeamRole(current);
    if (next === PM) {
      const trusted =
        namedPm.get(String(row.project_id)) === String(row.user_id) ||
        ["pm", "admin"].includes(accountRole.get(String(row.user_id)) ?? "");
      if (!trusted) {
        next = TEAM_LEAD;
        review.push(`${codeOf.get(String(row.project_id)) ?? row.project_id}  ${row.user_name ?? row.user_id}  (was "${current}")`);
      }
    }

    counts[next]++;
    console.log(`  ${String(codeOf.get(String(row.project_id)) ?? row.project_id).padEnd(10)} ${String(row.user_name ?? row.user_id).padEnd(28)} "${current ?? ""}" → ${next}`);
    if (!DRY_RUN) {
      await projectDb("project_team_members").where("id", row.id).update({ role_in_project: next, updated_at: new Date() });
    }
  }

  // Requests: the role somebody asked for, shown to their manager.
  let requestsFixed = 0;
  if (await projectDb.schema.hasTable("project_allocation_requests")) {
    const requests = await projectDb("project_allocation_requests").select("id", "requested_role");
    for (const r of requests) {
      if (TEAM_ROLES.includes(r.requested_role)) continue;
      // A request is somebody speaking for themselves — never PM.
      let next = toTeamRole(r.requested_role) ?? legacyToTeamRole(r.requested_role);
      if (next === PM) next = TEAM_LEAD;
      requestsFixed++;
      if (!DRY_RUN) {
        await projectDb("project_allocation_requests").where("id", r.id).update({ requested_role: next });
      }
    }
  }

  console.log(`
  Team rows rewritten:  ${counts["Developer"]} Developer, ${counts["Team Lead"]} Team Lead, ${counts["PM"]} PM
  Already correct:      ${unchanged}
  Client contacts left: ${clients}
  Requests tidied:      ${requestsFixed}`);

  if (review.length > 0) {
    console.log(`
  ⚠ These had a PM-like title but are not the named PM and their account
    is not pm/admin, so they were set to Team Lead. Promote them from the
    project's Team tab if they really run the project:
    ${review.join("\n    ")}`);
  }
  console.log(DRY_RUN ? "\n  Dry run — run again without --dry-run to apply.\n" : "\n  ✅ Done.\n");
}

main()
  .catch((err) => {
    console.error("❌ migrate-team-roles failed:", err);
    process.exitCode = 1;
  })
  .finally(() => closeAll());
