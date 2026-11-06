// ═══════════════════════════════════════════════════════════════
// migrate-sync-darwinbox-users.js — sync all Darwinbox employees
// into identity_db.users and identity_db.user_roles so that every
// Darwinbox employee appears in People & Roles.
//
// Run:  node src/lib/migrations/migrate-sync-darwinbox-users.js
// Idempotent: safe to run repeatedly.
// ═══════════════════════════════════════════════════════════════

const crypto = require("crypto");
const { identityDb, closeAll } = require("../db-config");

function uuidFromStr(str) {
  const hash = crypto.createHash("md5").update(str).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

async function run() {
  console.log("\n👥 Migrating Darwinbox employees to People & Roles (users)...\n");

  if (!(await identityDb.schema.hasTable("employee_master"))) {
    console.error("  ✖ employee_master table does not exist. Run migrate-employee-master.js first.");
    process.exit(1);
  }

  let defaultRole = await identityDb("roles").where("code", "member").first();
  if (!defaultRole) {
    defaultRole = (await identityDb("roles").where("code", "viewer").first()) || (await identityDb("roles").first());
  }

  const allEmps = await identityDb("employee_master").select(
    "employee_id",
    "company_email_id",
    "full_name",
    "mobile_number",
    "avatar_url",
    "is_active"
  );

  const existingUsers = await identityDb("users").select(
    "id",
    "email",
    "full_name",
    "darwinbox_ref",
    "role_id",
    "is_active"
  );

  const userByRef = new Map();
  const userByEmail = new Map();
  for (const u of existingUsers) {
    if (u.darwinbox_ref) userByRef.set(String(u.darwinbox_ref).trim(), u);
    if (u.email) userByEmail.set(String(u.email).toLowerCase().trim(), u);
  }

  let created = 0;
  let updated = 0;
  let deactivated = 0;

  for (const emp of allEmps) {
    const empId = String(emp.employee_id || "").trim();
    if (!empId) continue;

    const rawEmail = emp.company_email_id ? String(emp.company_email_id).trim().toLowerCase() : "";
    const email = rawEmail || `${empId.toLowerCase()}@acceleronsolutions.io`;

    const existing = userByRef.get(empId) || (rawEmail ? userByEmail.get(rawEmail) : undefined);

    if (existing) {
      const updates = {};
      if (!existing.darwinbox_ref || existing.darwinbox_ref !== empId) {
        updates.darwinbox_ref = empId;
      }
      if (emp.full_name && (!existing.full_name || existing.full_name === existing.email)) {
        updates.full_name = emp.full_name;
      }
      if (emp.is_active === false && existing.is_active !== false) {
        const isAdmin = await identityDb("user_roles")
          .join("roles", "roles.id", "user_roles.role_id")
          .where("user_roles.user_id", existing.id)
          .where("roles.code", "admin")
          .first();
        if (!isAdmin) {
          updates.is_active = false;
          deactivated++;
        }
      } else if (emp.is_active === true && existing.is_active === false) {
        updates.is_active = true;
      }

      if (Object.keys(updates).length > 0) {
        updates.updated_at = new Date();
        await identityDb("users").where("id", existing.id).update(updates);
        updated++;
      }

      const hasRoles = await identityDb("user_roles").where("user_id", existing.id).first();
      if (!hasRoles && defaultRole) {
        await identityDb("user_roles").insert({ user_id: existing.id, role_id: existing.role_id || defaultRole.id });
        if (!existing.role_id) {
          await identityDb("users").where("id", existing.id).update({ role_id: defaultRole.id });
        }
      }
    } else {
      const userId = uuidFromStr("user_" + empId);
      const tenantId = process.env.DEFAULT_TENANT_ID || "10000000-0000-0000-0000-000000000001";
      const roleId = defaultRole ? defaultRole.id : null;

      await identityDb("users").insert({
        id: userId,
        tenant_id: tenantId,
        email: email,
        full_name: emp.full_name || email,
        darwinbox_ref: empId,
        role_id: roleId,
        is_active: emp.is_active !== false,
        mobile_phone: emp.mobile_number || null,
        avatar_url: emp.avatar_url || null,
        created_at: new Date(),
        updated_at: new Date(),
      }).onConflict("id").merge({
        email: email,
        full_name: emp.full_name || email,
        darwinbox_ref: empId,
        is_active: emp.is_active !== false,
        updated_at: new Date(),
      });

      if (roleId) {
        const existsRole = await identityDb("user_roles").where({ user_id: userId, role_id: roleId }).first();
        if (!existsRole) {
          await identityDb("user_roles").insert({ user_id: userId, role_id: roleId }).catch(() => null);
        }
      }

      created++;
    }
  }

  console.log("  ✔ Migration complete.");
  console.log(`    Created     : ${created}`);
  console.log(`    Updated     : ${updated}`);
  if (deactivated) console.log(`    Deactivated : ${deactivated}`);
  console.log(`    Total emps  : ${allEmps.length}\n`);
}

run()
  .catch((err) => {
    console.error("  ✖ Migration failed:", err.message);
    process.exitCode = 1;
  })
  .finally(closeAll);
