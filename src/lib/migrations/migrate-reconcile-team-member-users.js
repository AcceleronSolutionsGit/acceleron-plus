// ═══════════════════════════════════════════════════════════════
// migrate-reconcile-team-member-users.js
//
// Reconciles project_team_members, wbs_assignments, and
// project_allocation_requests records with identity_db users.
//
// Ensures:
// 1. user_id is set to the user's UUID if it was previously an employee_id or name.
// 2. employee_id and user_name are backfilled from identity_db / employee_master.
// 3. is_active is set to true if it was null.
//
// Safe and idempotent to run repeatedly.
// Run: node src/lib/migrations/migrate-reconcile-team-member-users.js
// ═══════════════════════════════════════════════════════════════

const { projectDb, identityDb, closeAll } = require("../db-config");

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function run() {
  console.log("\n🚀 Starting Team Members & User Allocations Reconciliation...\n");

  // 1. Load users from identityDb
  const users = await identityDb("users")
    .select("id", "email", "full_name", "darwinbox_ref");
  console.log(`Loaded ${users.length} users from identity_db.users.`);

  // 2. Load employee_master if present to enrich employee_id mappings
  let employees = [];
  try {
    employees = await identityDb("employee_master")
      .select("employee_id", "company_email_id", "full_name");
    console.log(`Loaded ${employees.length} employees from identity_db.employee_master.`);
  } catch {
    console.log("Note: employee_master table not present or unreadable, using users table.");
  }

  // Build lookup maps
  const userById = new Map();
  const userByDarwinbox = new Map();
  const userByEmail = new Map();
  const userByName = new Map();

  for (const u of users) {
    userById.set(u.id, u);
    if (u.darwinbox_ref) userByDarwinbox.set(String(u.darwinbox_ref).trim(), u);
    if (u.email) userByEmail.set(String(u.email).trim().toLowerCase(), u);
    if (u.full_name) userByName.set(String(u.full_name).trim().toLowerCase(), u);
  }

  // Cross-reference employee_master to users by email or darwinbox_ref
  for (const e of employees) {
    const empId = e.employee_id ? String(e.employee_id).trim() : null;
    const email = e.company_email_id ? String(e.company_email_id).trim().toLowerCase() : null;
    const name = e.full_name ? String(e.full_name).trim().toLowerCase() : null;

    let matchedUser = (empId ? userByDarwinbox.get(empId) : null) || (email ? userByEmail.get(email) : null);
    if (matchedUser) {
      if (empId && !userByDarwinbox.has(empId)) userByDarwinbox.set(empId, matchedUser);
      if (email && !userByEmail.has(email)) userByEmail.set(email, matchedUser);
      if (name && !userByName.has(name)) userByName.set(name, matchedUser);
    }
  }

  function findUser(userId, employeeId, userName) {
    if (userId && UUID_REGEX.test(userId) && userById.has(userId)) {
      return userById.get(userId);
    }
    if (userId && userByDarwinbox.has(String(userId).trim())) {
      return userByDarwinbox.get(String(userId).trim());
    }
    if (employeeId && userByDarwinbox.has(String(employeeId).trim())) {
      return userByDarwinbox.get(String(employeeId).trim());
    }
    if (userName && userByName.has(String(userName).trim().toLowerCase())) {
      return userByName.get(String(userName).trim().toLowerCase());
    }
    if (userId && userByEmail.has(String(userId).trim().toLowerCase())) {
      return userByEmail.get(String(userId).trim().toLowerCase());
    }
    return null;
  }

  // 3. Reconcile project_team_members
  if (await projectDb.schema.hasTable("project_team_members")) {
    const members = await projectDb("project_team_members").select("*");
    console.log(`\nReconciling ${members.length} rows in project_team_members...`);

    let updatedPtm = 0;
    for (const m of members) {
      const matched = findUser(m.user_id, m.employee_id, m.user_name);
      const updates = {};

      if (matched) {
        if (m.user_id !== matched.id) {
          // Check if a row with matched.id already exists on this project
          const duplicate = members.find(
            (other) => other.id !== m.id && other.project_id === m.project_id && other.user_id === matched.id
          );
          if (duplicate) {
            console.log(`  Merging duplicate allocation on project ${m.project_id} for user ${matched.full_name || matched.id}`);
            if (!duplicate.is_active && m.is_active !== false) {
              await projectDb("project_team_members").where("id", duplicate.id).update({ is_active: true, updated_at: new Date() });
            }
            await projectDb("project_team_members").where("id", m.id).del();
            continue;
          } else {
            updates.user_id = matched.id;
          }
        }
        if (!m.employee_id && matched.darwinbox_ref) {
          updates.employee_id = matched.darwinbox_ref;
        }
        if (!m.user_name && matched.full_name) {
          updates.user_name = matched.full_name;
        }
      }

      if (m.is_active === null || m.is_active === undefined) {
        updates.is_active = true;
      }

      if (Object.keys(updates).length > 0) {
        updates.updated_at = new Date();
        try {
          await projectDb("project_team_members").where("id", m.id).update(updates);
          updatedPtm++;
        } catch (err) {
          console.warn(`  Warning: could not update project_team_members row ${m.id}:`, err.message);
        }
      }
    }
    console.log(`✅ Updated ${updatedPtm} rows in project_team_members.`);
  }

  // 4. Reconcile wbs_assignments
  if (await projectDb.schema.hasTable("wbs_assignments")) {
    const assignments = await projectDb("wbs_assignments").select("*");
    console.log(`\nReconciling ${assignments.length} rows in wbs_assignments...`);

    let updatedWbs = 0;
    for (const a of assignments) {
      const matched = findUser(a.user_id, a.employee_id, a.user_name);
      const updates = {};

      if (matched && a.user_id !== matched.id) {
        updates.user_id = matched.id;
        if (!a.employee_id && matched.darwinbox_ref) updates.employee_id = matched.darwinbox_ref;
        if (!a.user_name && matched.full_name) updates.user_name = matched.full_name;
      }

      if (Object.keys(updates).length > 0) {
        updates.updated_at = new Date();
        await projectDb("wbs_assignments").where("id", a.id).update(updates);
        updatedWbs++;
      }
    }
    console.log(`✅ Updated ${updatedWbs} rows in wbs_assignments.`);
  }

  // 5. Reconcile project_allocation_requests
  if (await projectDb.schema.hasTable("project_allocation_requests")) {
    const reqs = await projectDb("project_allocation_requests").select("*");
    console.log(`\nReconciling ${reqs.length} rows in project_allocation_requests...`);

    let updatedReqs = 0;
    for (const r of reqs) {
      const matched = findUser(r.user_id, r.employee_id, r.user_name);
      const updates = {};

      if (matched && r.user_id !== matched.id) {
        updates.user_id = matched.id;
        if (!r.employee_id && matched.darwinbox_ref) updates.employee_id = matched.darwinbox_ref;
        if (!r.user_name && matched.full_name) updates.user_name = matched.full_name;
      }

      if (Object.keys(updates).length > 0) {
        updates.updated_at = new Date();
        await projectDb("project_allocation_requests").where("id", r.id).update(updates);
        updatedReqs++;
      }
    }
    console.log(`✅ Updated ${updatedReqs} rows in project_allocation_requests.`);
  }

  console.log("\n🎉 Reconciliation completed successfully!\n");
  await closeAll();
}

run().catch((err) => {
  console.error("Reconciliation error:", err);
  process.exit(1);
});
