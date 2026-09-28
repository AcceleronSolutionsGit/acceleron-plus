// ═══════════════════════════════════════════════════════════════
// seed-demo-accounts.js — two accounts to look at the app through
//
// Run:  node src/lib/seeds/seed-demo-accounts.js
//       node src/lib/seeds/seed-demo-accounts.js --project PRJ-0001
//
// Creates a client contact and an ordinary team member, puts the team
// member on a project with work allotted to them, and marks a document
// client-visible so the portal is not empty.
//
// Idempotent. Nothing is overwritten; anything already there is reused.
//
// Signing in uses a one-time code, so there is no password to set. In
// development the code is shown on the sign-in screen; in production it
// goes to the address below.
// ═══════════════════════════════════════════════════════════════

const { identityDb, projectDb, closeAll } = require("../db-config");

const args = process.argv.slice(2);
const projectCode =
  args.includes("--project") ? args[args.indexOf("--project") + 1] : null;

const DEMO = {
  member: {
    employeeId: "ACC-DEMO-01",
    fullName: "Arjun Das",
    email: "arjun.das@acceleronsolutions.io",
    designation: "Senior Consultant",
    department: "Delivery",
    jobLevel: "G3",
    location: "Kolkata",
    role: "member",
    skills: [
      ["React", 4, 5, true],
      ["Node.js", 4, 5, false],
      ["PostgreSQL", 3, 4, false],
      ["SAP FICO", 3, 2, false],
    ],
  },
  client: {
    fullName: "Meera Iyer",
    email: "meera.iyer@gainwellindia.com",
    role: "client",
  },
};

async function roleId(code) {
  const row = await identityDb("roles").where("code", code).first();
  if (row) return row.id;
  const [created] = await identityDb("roles")
    .insert({ code, name: code.charAt(0).toUpperCase() + code.slice(1) })
    .returning("*");
  return created.id;
}

async function ensureUser({ email, fullName, role, darwinboxRef = null }) {
  const existing = await identityDb("users").whereRaw("lower(email) = ?", [email.toLowerCase()]).first();
  if (existing) {
    // Keep the role honest even if the row predates this script.
    await identityDb("users")
      .where("id", existing.id)
      .update({ role_id: await roleId(role), is_active: true, updated_at: new Date() });
    return { ...existing, reused: true };
  }
  const [created] = await identityDb("users")
    .insert({
      tenant_id: "acceleron",
      email,
      full_name: fullName,
      role_id: await roleId(role),
      darwinbox_ref: darwinboxRef,
      is_active: true,
    })
    .returning("*");
  return { ...created, reused: false };
}

async function run() {
  console.log("\n👥 Seeding demo accounts\n");

  // ─── The team member ────────────────────────────────────────
  const m = DEMO.member;

  if (!(await identityDb("employee_master").where("employee_id", m.employeeId).first())) {
    await identityDb("employee_master").insert({
      employee_id: m.employeeId,
      full_name: m.fullName,
      company_email_id: m.email,
      designation: m.designation,
      department: m.department,
      job_level: m.jobLevel,
      office_location: m.location,
      group_company_code: "ASPL",
      employee_status: "Active",
      date_of_joining: "2023-06-01",
      is_active: true,
    });
    console.log(`  ✚ employee_master: ${m.fullName} (${m.employeeId}, grade ${m.jobLevel})`);
  } else {
    console.log(`  ⏭  employee_master: ${m.fullName} already present`);
  }

  const memberUser = await ensureUser({
    email: m.email,
    fullName: m.fullName,
    role: m.role,
    darwinboxRef: m.employeeId,
  });
  console.log(`  ${memberUser.reused ? "⏭ " : "✚"} user: ${m.email} (team member)`);

  // Skills, so the staffing filter has somebody to find.
  let skillsAdded = 0;
  for (const [name, proficiency, years, primary] of m.skills) {
    const skill = await identityDb("skills").whereRaw("lower(name) = ?", [name.toLowerCase()]).first();
    if (!skill) continue;
    const has = await identityDb("employee_skills")
      .where({ employee_id: m.employeeId, skill_id: skill.id })
      .first();
    if (has) continue;
    await identityDb("employee_skills").insert({
      employee_id: m.employeeId,
      skill_id: skill.id,
      proficiency,
      years_experience: years,
      is_primary: primary,
    });
    skillsAdded += 1;
  }
  console.log(`  ✚ ${skillsAdded} skill(s) on ${m.fullName}`);

  // ─── The client contact ─────────────────────────────────────
  const c = DEMO.client;
  const clientUser = await ensureUser({ email: c.email, fullName: c.fullName, role: c.role });
  console.log(`  ${clientUser.reused ? "⏭ " : "✚"} user: ${c.email} (client)`);

  // ─── Put them on a project ──────────────────────────────────
  const project = projectCode
    ? await projectDb("projects").where("code", projectCode).first()
    : await projectDb("projects").orderBy("created_at", "asc").first();

  if (!project) {
    console.log("\n  ⚠  No projects exist yet, so there is nothing to staff them onto.");
    console.log("     Create one, then run this again.\n");
    return;
  }

  console.log(`\n  → using ${project.code} — ${project.name}`);

  // The team member, staffed and given work.
  let member = await projectDb("project_team_members")
    .where({ project_id: project.id, user_id: memberUser.id })
    .first();

  if (!member) {
    const band = await projectDb("employee_rate_bands")
      .where("is_active", true)
      .andWhere(function () {
        this.where("level_code", m.jobLevel).orWhere("band_name", "ilike", "%Lead Consultant%");
      })
      .first();

    [member] = await projectDb("project_team_members")
      .insert({
        project_id: project.id,
        user_id: memberUser.id,
        employee_id: m.employeeId,
        user_name: m.fullName,
        rate_band_id: band?.id ?? null,
        rate_band_name: band?.band_name ?? null,
        daily_cost_inr: band?.daily_cost_inr ?? null,
        daily_billable_rate_inr: band?.daily_billable_rate_inr ?? null,
        role_in_project: "Senior Developer",
        allocation_percent: 60,
        start_date: project.start_date ?? null,
        end_date: project.planned_end_date ?? null,
        is_active: true,
      })
      .returning("*");
    console.log(`  ✚ staffed ${m.fullName} at 60%`);
  } else {
    console.log(`  ⏭  ${m.fullName} already on ${project.code}`);
  }

  // Allot them a couple of work packages so My Tasks is not empty.
  const packages = await projectDb("wbs_items")
    .where("project_id", project.id)
    .orderBy("sequence")
    .limit(2);

  let allotted = 0;
  for (const pkg of packages) {
    const has = await projectDb("wbs_assignments")
      .where({ wbs_item_id: pkg.id, user_id: memberUser.id })
      .first();
    if (has) continue;
    await projectDb("wbs_assignments").insert({
      project_id: project.id,
      wbs_item_id: pkg.id,
      user_id: memberUser.id,
      employee_id: m.employeeId,
      user_name: m.fullName,
      planned_hours: 24,
      progress_percent: allotted === 0 ? 40 : 0,
      status: allotted === 0 ? "in_progress" : "not_started",
      start_date: pkg.start_date ?? null,
      due_date: pkg.end_date ?? null,
    });
    allotted += 1;
  }
  if (allotted > 0) console.log(`  ✚ allotted ${allotted} work package(s) to ${m.fullName}`);

  // The client contact, so the portal finds the project by membership
  // as well as by company name.
  const clientMember = await projectDb("project_team_members")
    .where({ project_id: project.id, user_id: clientUser.id })
    .first();
  if (!clientMember) {
    await projectDb("project_team_members").insert({
      project_id: project.id,
      user_id: clientUser.id,
      user_name: c.fullName,
      role_in_project: "Client contact",
      allocation_percent: 1,
      is_active: true,
    });
    console.log(`  ✚ added ${c.fullName} as a client contact`);
  } else {
    console.log(`  ⏭  ${c.fullName} already a contact on ${project.code}`);
  }

  // Something for the client to actually open. A real upload would go
  // through the documents route; this only needs the row to exist so
  // the portal is not demonstrating an empty list.
  const shared = await projectDb("project_documents")
    .where({ project_id: project.id, access_level: "client_visible" })
    .first()
    .catch(() => null);

  if (!shared) {
    try {
      await projectDb("project_documents").insert({
        tenant_id: project.tenant_id ?? "acceleron",
        project_id: project.id,
        document_type: "status_report",
        category: "reporting",
        title: "Weekly status report",
        description: "Shared with the client each Friday.",
        file_name: "weekly-status.pdf",
        stored_file_name: "seed-weekly-status.pdf",
        file_path: "uploads/seed/weekly-status.pdf",
        mime_type: "application/pdf",
        file_size_bytes: 0,
        uploaded_by_user_id: memberUser.id,
        access_level: "client_visible",
        is_active: true,
        is_latest_version: true,
        version: 1,
      });
      console.log("  ✚ marked a status report client-visible");
    } catch (err) {
      console.log(`  ⚠  could not add the sample document: ${err.message}`);
    }
  }

  // A milestone or two, so the portal shows what is coming next.
  const milestoneCount = await projectDb("milestones")
    .where("project_id", project.id)
    .count("* as n")
    .first();

  if (Number(milestoneCount?.n ?? 0) === 0) {
    const base = project.start_date ? new Date(project.start_date) : new Date();
    const at = (days) => {
      const d = new Date(base);
      d.setDate(d.getDate() + days);
      return d.toISOString().slice(0, 10);
    };
    try {
      await projectDb("milestones").insert([
        { project_id: project.id, name: "Design sign-off", due_date: at(45), status: "completed" },
        { project_id: project.id, name: "Build complete", due_date: at(150), status: "pending" },
        { project_id: project.id, name: "Go-live", due_date: at(210), status: "pending" },
      ]);
      console.log("  ✚ added 3 milestones");
    } catch (err) {
      console.log(`  ⚠  could not add milestones: ${err.message}`);
    }
  }

  // ─── Hand over ──────────────────────────────────────────────
  console.log("\n" + "─".repeat(62));
  console.log("  Sign in at /login with the email address. There is no");
  console.log("  password — a six-digit code is used, and in development it");
  console.log("  is shown on screen.");
  console.log("─".repeat(62));
  console.log(`  Team member   ${m.email}`);
  console.log(`                lands on My Tasks · timesheet · own skills`);
  console.log(`  Client        ${c.email}`);
  console.log(`                lands on the portal · progress, docs, tickets`);
  console.log("─".repeat(62) + "\n");
}

run()
  .then(closeAll)
  .catch(async (err) => {
    console.error("\n✖", err.message, "\n");
    await closeAll();
    process.exit(1);
  });
