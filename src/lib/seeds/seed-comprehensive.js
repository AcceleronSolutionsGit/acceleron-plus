// ═══════════════════════════════════════════════════════════════
// seed-comprehensive.js — Full demo data seeder for PMT + ITSM
// Run: node src/lib/seeds/seed-comprehensive.js
// ═══════════════════════════════════════════════════════════════

const { identityDb, itsmDb, projectDb, closeAll } = require("../db-config");
const crypto = require("crypto");

function uuidFromStr(str) {
  const hash = crypto.createHash("md5").update(str).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

async function run() {
  console.log("🚀 Seeding comprehensive PMT + ITSM demo data...\n");

  const projectTenantId = "acceleron";
  const itsmTenantId = "8434da2c-a300-433f-83fd-57249690ad09";
  const identityTenantId = "10000000-0000-0000-0000-000000000001";

  // ─── 1. Fetch real employees from Darwinbox-synced master ──────
  const allEmployees = await identityDb("employee_master")
    .select("*")
    .orderBy("full_name", "asc");

  if (allEmployees.length === 0) {
    console.error("❌ No employees in employee_master. Run Darwinbox sync first.");
    process.exit(1);
  }

  console.log(`  📋 Found ${allEmployees.length} employees in master`);

  // ─── 2. Sync all master employees into identity_db.users ───────
  console.log("  👥 Syncing master employees into users table...");
  const roles = await identityDb("roles").select("*");
  const pmRole = roles.find((r) => r.code === "project_manager") || roles[0];
  const agentRole = roles.find((r) => r.code === "agent") || roles[0];

  for (const emp of allEmployees) {
    const userUuid = uuidFromStr("user_" + emp.employee_id);
    const existing = await identityDb("users")
      .where("email", emp.company_email_id)
      .orWhere("id", userUuid)
      .first();

    if (!existing) {
      const isLead = ["G3", "SRG2"].includes(emp.job_level);
      await identityDb("users").insert({
        id: userUuid,
        tenant_id: identityTenantId,
        email: emp.company_email_id,
        full_name: emp.full_name,
        role_id: isLead ? pmRole.id : agentRole.id,
        darwinbox_ref: emp.employee_id,
        is_active: true,
      });
      emp.user_id = userUuid;
    } else {
      emp.user_id = existing.id;
      if (!existing.darwinbox_ref) {
        await identityDb("users").where("id", existing.id).update({ darwinbox_ref: emp.employee_id });
      }
    }
  }

  // Also include pre-seeded users if any
  const adminUser = await identityDb("users").where("email", "sabarnik@acceleronsolutions.com").first();
  const pm1 = allEmployees[0];
  const pm2 = allEmployees[1] || allEmployees[0];
  const pm3 = allEmployees[2] || allEmployees[0];
  const agent1 = allEmployees[3] || allEmployees[0];
  const agent2 = allEmployees[4] || allEmployees[0];
  const agent3 = allEmployees[5] || allEmployees[0];
  const sponsor1 = adminUser || { user_id: pm1.user_id, full_name: "Sabarnik Lahiri", employee_id: "ADMIN" };
  const sponsor2 = allEmployees[6] || allEmployees[0];
  const member1 = allEmployees[7] || allEmployees[0];
  const member2 = allEmployees[8] || allEmployees[0];

  console.log(`  👤 PM1: ${pm1.full_name} (${pm1.user_id})`);
  console.log(`  👤 PM2: ${pm2.full_name} (${pm2.user_id})`);
  console.log(`  👤 PM3: ${pm3.full_name} (${pm3.user_id})`);

  // ─── 3. Ensure ITSM reference data exists ─────────────────────
  // Companies
  const companyNames = [
    "Tata Consultancy Services",
    "Reliance Industries",
    "Infosys Limited",
    "Wipro Technologies",
    "Mahindra & Mahindra",
    "Global Tech Inc.",
  ];
  for (const name of companyNames) {
    const exists = await itsmDb("companies").where("name", name).first();
    if (!exists) {
      await itsmDb("companies").insert({ tenant_id: itsmTenantId, name, is_active: true });
    }
  }
  const companies = await itsmDb("companies").select("*").orderBy("name");
  console.log(`  🏢 Companies: ${companies.length}`);

  // Departments
  const deptDefs = [
    { companyIdx: 0, name: "Engineering" },
    { companyIdx: 0, name: "Operations" },
    { companyIdx: 1, name: "IT Infrastructure" },
    { companyIdx: 2, name: "Digital Services" },
    { companyIdx: 3, name: "Cloud Engineering" },
    { companyIdx: 4, name: "Manufacturing IT" },
  ];
  for (const d of deptDefs) {
    const comp = companies[d.companyIdx] || companies[0];
    const exists = await itsmDb("departments").where({ company_id: comp.id, name: d.name }).first();
    if (!exists) {
      await itsmDb("departments").insert({ tenant_id: itsmTenantId, company_id: comp.id, name: d.name, description: `${d.name} Department` });
    }
  }
  const departments = await itsmDb("departments").select("*");
  console.log(`  🏛️  Departments: ${departments.length}`);

  // Service Groups
  const groupNames = ["L1 Support", "Infrastructure", "Application Support", "Cloud Operations", "Security Team"];
  for (const name of groupNames) {
    const exists = await itsmDb("service_groups").where("name", name).first();
    if (!exists) {
      await itsmDb("service_groups").insert({
        tenant_id: itsmTenantId,
        name,
        team_lead_user_id: pm1.user_id,
        description: `${name} team`,
      });
    }
  }
  const groups = await itsmDb("service_groups").select("*");
  console.log(`  👥 Service Groups: ${groups.length}`);

  // Requesters
  const requesterDefs = [
    { email: "vijay.kumar@tcs.com", firstName: "Vijay", lastName: "Kumar", companyIdx: 0, deptIdx: 0, location: "Mumbai" },
    { email: "anita.desai@reliance.com", firstName: "Anita", lastName: "Desai", companyIdx: 1, deptIdx: 2, location: "Navi Mumbai" },
    { email: "ravi.patel@infosys.com", firstName: "Ravi", lastName: "Patel", companyIdx: 2, deptIdx: 3, location: "Bengaluru" },
    { email: "suresh.nair@tcs.com", firstName: "Suresh", lastName: "Nair", companyIdx: 0, deptIdx: 1, location: "Chennai" },
    { email: "meena.iyer@reliance.com", firstName: "Meena", lastName: "Iyer", companyIdx: 1, deptIdx: 2, location: "Hyderabad" },
    { email: "pradeep.singh@wipro.com", firstName: "Pradeep", lastName: "Singh", companyIdx: 3, deptIdx: 4, location: "Pune" },
    { email: "kavitha.rao@mahindra.com", firstName: "Kavitha", lastName: "Rao", companyIdx: 4, deptIdx: 5, location: "Mumbai" },
  ];
  for (const r of requesterDefs) {
    const exists = await itsmDb("requesters").where("email", r.email).first();
    if (!exists) {
      await itsmDb("requesters").insert({
        tenant_id: itsmTenantId,
        email: r.email,
        first_name: r.firstName,
        last_name: r.lastName,
        company_id: companies[r.companyIdx]?.id || companies[0].id,
        department_id: departments[r.deptIdx]?.id || departments[0].id,
        location: r.location,
        is_active: true,
      });
    }
  }
  const requesters = await itsmDb("requesters").select("*");
  console.log(`  🙋 Requesters: ${requesters.length}`);

  // Rate Bands in project_db
  const bandDefs = [
    { band_name: "Associate Consultant (G1)", level_code: "G1", daily_cost_inr: 3000, daily_billable_rate_inr: 6000 },
    { band_name: "Senior Junior Consultant (SRG1)", level_code: "SRG1", daily_cost_inr: 4500, daily_billable_rate_inr: 9000 },
    { band_name: "Consultant (G2)", level_code: "G2", daily_cost_inr: 6000, daily_billable_rate_inr: 12000 },
    { band_name: "Senior Consultant (SRG2)", level_code: "SRG2", daily_cost_inr: 8000, daily_billable_rate_inr: 16000 },
    { band_name: "Lead Consultant (G3)", level_code: "G3", daily_cost_inr: 10500, daily_billable_rate_inr: 21000 },
  ];
  for (const b of bandDefs) {
    const exists = await projectDb("employee_rate_bands").where("level_code", b.level_code).first();
    if (!exists) {
      await projectDb("employee_rate_bands").insert({
        tenant_id: projectTenantId,
        ...b,
        currency: "INR",
        effective_from: "2026-01-01",
        is_active: true,
      });
    }
  }
  const rateBands = await projectDb("employee_rate_bands").select("*");
  console.log(`  💰 Rate Bands: ${rateBands.length}`);

  // ─── 4. Create / Update Projects ─────────────────────────────
  console.log("\n  📁 Creating / updating projects...");
  const projectDefs = [
    {
      code: "PRJ-0089",
      name: "Global Tech ERP Rollout",
      status: "active",
      description: "Comprehensive ERP system rollout covering Finance, Supply Chain, and HR modules.",
      client_company_name: "Global Tech Inc.",
      pm: pm1,
      sponsor: sponsor1,
      budget_inr: 5720000,
      start_date: "2026-08-31",
      planned_end_date: "2026-11-29",
      phase: "Execution",
    },
    {
      code: "PRJ-2026-001",
      name: "Cloud Migration Phase 2",
      status: "active",
      description: "Migrate legacy ERP system to cloud-native architecture. Phase 2 covers Finance and HR modules.",
      client_company_name: "Tata Consultancy Services",
      pm: pm1,
      sponsor: sponsor1,
      budget_inr: 4500000,
      start_date: "2026-03-01",
      planned_end_date: "2026-11-30",
      phase: "Build",
    },
    {
      code: "PRJ-2026-002",
      name: "SOC 2 Compliance Audit",
      status: "active",
      description: "Achieve SOC 2 Type II compliance certification for cloud services.",
      client_company_name: "Reliance Industries",
      pm: pm2,
      sponsor: sponsor2,
      budget_inr: 1800000,
      start_date: "2026-05-01",
      planned_end_date: "2026-09-30",
      phase: "Testing",
    },
    {
      code: "PRJ-2026-003",
      name: "Customer Portal Redesign",
      status: "planning",
      description: "Complete redesign of the customer-facing support portal with self-service capabilities.",
      client_company_name: "Infosys Limited",
      pm: pm1,
      sponsor: null,
      budget_inr: 3200000,
      start_date: "2026-09-01",
      planned_end_date: "2027-02-28",
      phase: "Discovery",
    },
    {
      code: "PRJ-2025-010",
      name: "Data Center Consolidation",
      status: "closed",
      description: "Consolidate three regional data centers into two geo-redundant facilities.",
      client_company_name: "Wipro Technologies",
      pm: pm3,
      sponsor: sponsor1,
      budget_inr: 6800000,
      start_date: "2025-06-01",
      planned_end_date: "2026-03-31",
      actual_end_date: "2026-04-15",
      phase: "Go-Live",
    },
    {
      code: "PRJ-2026-004",
      name: "ITSM Platform Rollout",
      status: "on_hold",
      description: "Implement new ITSM platform across all business units. On hold pending vendor negotiation.",
      client_company_name: "Mahindra & Mahindra",
      pm: pm2,
      sponsor: sponsor2,
      budget_inr: 2100000,
      start_date: "2026-06-15",
      planned_end_date: "2026-12-31",
      phase: "Design",
    },
    {
      code: "PRJ-2026-005",
      name: "Zero Trust Network Implementation",
      status: "initiated",
      description: "Implement zero trust network architecture across all corporate locations.",
      client_company_name: "Tata Consultancy Services",
      pm: pm3,
      sponsor: null,
      budget_inr: 5500000,
      start_date: null,
      planned_end_date: "2027-06-30",
      phase: "Discovery",
    },
  ];

  const createdProjects = [];

  for (const pDef of projectDefs) {
    let project = await projectDb("projects").where("code", pDef.code).first();

    const pmUserId = pDef.pm?.user_id || pm1.user_id;
    const sponsorUserId = pDef.sponsor?.user_id || null;

    if (!project) {
      const insertData = {
        tenant_id: projectTenantId,
        code: pDef.code,
        name: pDef.name,
        status: pDef.status,
        description: pDef.description,
        client_company_name: pDef.client_company_name,
        project_manager_user_id: pmUserId,
        sponsor_user_id: sponsorUserId,
        budget_inr: pDef.budget_inr,
        start_date: pDef.start_date,
        planned_end_date: pDef.planned_end_date,
      };
      if (pDef.actual_end_date) insertData.actual_end_date = pDef.actual_end_date;

      [project] = await projectDb("projects").insert(insertData).returning("*");
      console.log(`  📁 Created project: ${pDef.code} — ${pDef.name}`);
    } else {
      await projectDb("projects").where("id", project.id).update({
        project_manager_user_id: pmUserId,
        sponsor_user_id: sponsorUserId,
        budget_inr: pDef.budget_inr,
        client_company_name: pDef.client_company_name,
        description: pDef.description,
      });
      console.log(`  📁 Updated project: ${pDef.code}`);
    }

    // Create / update ITSM project context
    let ctx = await itsmDb("project_contexts").where("project_code", pDef.code).first();
    if (!ctx) {
      [ctx] = await itsmDb("project_contexts")
        .insert({
          tenant_id: projectTenantId,
          project_db_id: project.id,
          project_code: pDef.code,
          project_name: pDef.name,
          client_company_name: pDef.client_company_name,
          pm_user_id: pDef.pm.employee_id,
          pm_user_name: pDef.pm.full_name,
          status: pDef.status,
          current_phase: pDef.phase,
          is_active: pDef.status !== "closed" && pDef.status !== "cancelled",
        })
        .returning("*");

      await projectDb("projects").where("id", project.id).update({ itsm_context_id: ctx.id });
      console.log(`    ↳ ITSM context created: ${ctx.id} (phase: ${pDef.phase})`);
    } else {
      await itsmDb("project_contexts").where("id", ctx.id).update({
        project_db_id: project.id,
        current_phase: pDef.phase,
        pm_user_id: pDef.pm.employee_id,
        pm_user_name: pDef.pm.full_name,
        status: pDef.status,
      });
      await projectDb("projects").where("id", project.id).update({ itsm_context_id: ctx.id });
      console.log(`    ↳ ITSM context updated: ${ctx.id} (phase: ${pDef.phase})`);
    }

    createdProjects.push({ ...project, ctx, phase: pDef.phase, pmName: pDef.pm.full_name, pmUserId });
  }

  // ─── 5. Create WBS Items ──────────────────────────────────────
  console.log("\n  📦 Creating WBS items...");
  const wbsTemplates = {
    active: [
      { code: "1", name: "Discovery & Assessment", children: [
        { code: "1.1", name: "Current State Analysis" },
        { code: "1.2", name: "Gap Assessment" },
        { code: "1.3", name: "Stakeholder Interviews" },
      ]},
      { code: "2", name: "Solution Design", children: [
        { code: "2.1", name: "Architecture Design" },
        { code: "2.2", name: "Data Migration Strategy" },
      ]},
      { code: "3", name: "Development & Build", children: [
        { code: "3.1", name: "Module Build" },
        { code: "3.2", name: "Integration Development" },
      ]},
      { code: "4", name: "Testing & UAT" },
      { code: "5", name: "Go-Live & Hypercare" },
    ],
    planning: [
      { code: "1", name: "Requirements Gathering" },
      { code: "2", name: "UX Research & Wireframes" },
      { code: "3", name: "Technical Architecture" },
    ],
  };

  for (const proj of createdProjects) {
    const existingWbs = await projectDb("wbs_items").where("project_id", proj.id).first();
    if (existingWbs) continue;

    const template = wbsTemplates[proj.status] || wbsTemplates.active;
    let seq = 1;
    for (const item of template) {
      const [parent] = await projectDb("wbs_items")
        .insert({ project_id: proj.id, code: item.code, name: item.name, sequence: seq++ })
        .returning("*");
      if (item.children) {
        let childSeq = 1;
        for (const child of item.children) {
          await projectDb("wbs_items").insert({
            project_id: proj.id,
            parent_wbs_id: parent.id,
            code: child.code,
            name: child.name,
            sequence: childSeq++,
          });
        }
      }
    }
  }

  // ─── 6. Create Milestones ─────────────────────────────────────
  console.log("  📌 Creating milestones...");
  const p0 = createdProjects[0]; // Global Tech ERP
  const p1 = createdProjects[1]; // Cloud Migration
  const p2 = createdProjects[2]; // SOC2
  const p3 = createdProjects[3]; // Customer Portal

  const milestoneDefs = [
    { project_id: p0.id, name: "ERP Discovery Complete", due_date: "2026-09-15", status: "completed", completed_at: "2026-09-12" },
    { project_id: p0.id, name: "Finance Module Config", due_date: "2026-10-15", status: "pending" },
    { project_id: p0.id, name: "UAT Sign-off", due_date: "2026-11-15", status: "pending" },
    { project_id: p1.id, name: "Discovery Complete", due_date: "2026-04-15", status: "completed", completed_at: "2026-04-12" },
    { project_id: p1.id, name: "Solution Design Sign-off", due_date: "2026-06-01", status: "completed", completed_at: "2026-06-03" },
    { project_id: p1.id, name: "Development Sprint 1 Complete", due_date: "2026-07-31", status: "missed" },
    { project_id: p1.id, name: "UAT Start", due_date: "2026-09-15", status: "at_risk" },
    { project_id: p1.id, name: "Go-Live", due_date: "2026-11-15", status: "pending" },
    { project_id: p2.id, name: "Policy Review Complete", due_date: "2026-06-30", status: "completed", completed_at: "2026-06-28" },
    { project_id: p2.id, name: "Control Implementation", due_date: "2026-08-15", status: "at_risk" },
    { project_id: p2.id, name: "Audit Readiness Assessment", due_date: "2026-09-15", status: "pending" },
    { project_id: p3.id, name: "UX Research Complete", due_date: "2026-10-01", status: "pending" },
    { project_id: p3.id, name: "Wireframes Approved", due_date: "2026-10-30", status: "pending" },
  ];

  for (const m of milestoneDefs) {
    const exists = await projectDb("milestones").where({ project_id: m.project_id, name: m.name }).first();
    if (!exists) {
      await projectDb("milestones").insert(m);
    }
  }

  // ─── 7. Create Risks ──────────────────────────────────────────
  console.log("  ⚠️  Creating risks...");
  const riskDefs = [
    { project_id: p0.id, title: "Legacy data formatting discrepancy", description: "Source data contains unformatted tax fields", probability: "high", impact: "high", status: "mitigating", owner_user_id: pm1.user_id, mitigation_plan: "Automated cleaning script deployed" },
    { project_id: p1.id, title: "Key developer attrition", description: "Two senior developers may leave before Phase 2 completion", probability: "medium", impact: "high", status: "mitigating", owner_user_id: pm1.user_id, mitigation_plan: "Cross-training program initiated; backup developers identified" },
    { project_id: p1.id, title: "Data quality issues in legacy system", description: "Finance module data has inconsistencies that may delay migration", probability: "high", impact: "high", status: "open", owner_user_id: pm1.user_id, mitigation_plan: "Data cleansing sprint scheduled for Aug" },
    { project_id: p1.id, title: "Third-party API changes", description: "Payment gateway provider scheduled API v2 deprecation", probability: "low", impact: "medium", status: "accepted", owner_user_id: pm1.user_id },
    { project_id: p2.id, title: "Scope creep from new regulations", description: "Emerging DPDPA requirements may expand audit scope", probability: "medium", impact: "medium", status: "open", owner_user_id: pm2.user_id, mitigation_plan: "Weekly regulatory watch meetings" },
    { project_id: p2.id, title: "Vendor audit tool compatibility", probability: "low", impact: "low", status: "closed", owner_user_id: pm2.user_id },
    { project_id: p3.id, title: "Competing priorities from client stakeholders", description: "Multiple departments requesting conflicting portal features", probability: "high", impact: "medium", status: "open", owner_user_id: pm1.user_id },
  ];

  for (const r of riskDefs) {
    const exists = await projectDb("risks").where({ project_id: r.project_id, title: r.title }).first();
    if (!exists) {
      await projectDb("risks").insert(r);
    }
  }

  // ─── 8. Create Governance Reviews ─────────────────────────────
  console.log("  🛡️  Creating governance reviews...");
  const reviewDefs = [
    { project_id: p0.id, review_type: "Stage Gate", review_date: "2026-09-05", outcome: "pass", notes: "Discovery and kickoff completed successfully. Project is in active execution." },
    { project_id: p1.id, review_type: "Stage Gate", review_date: "2026-04-20", outcome: "pass", notes: "Discovery phase completed satisfactorily. Proceed to solution design." },
    { project_id: p1.id, review_type: "Stage Gate", review_date: "2026-06-10", outcome: "conditional_pass", notes: "Design approved with condition: data migration strategy needs peer review before build." },
    { project_id: p1.id, review_type: "Risk Review", review_date: "2026-08-01", outcome: "fail", notes: "Sprint 1 missed deadline. Need remediation plan before continuing." },
    { project_id: p2.id, review_type: "Steering Committee", review_date: "2026-07-15", outcome: "pass", notes: "Good progress on control implementation. Budget on track." },
  ];

  for (const rv of reviewDefs) {
    const exists = await projectDb("governance_reviews").where({ project_id: rv.project_id, review_date: rv.review_date }).first();
    if (!exists) {
      await projectDb("governance_reviews").insert(rv);
    }
  }

  // ─── 9. Create ITSM Tickets ──────────────────────────────────
  console.log("\n  🎫 Creating ITSM tickets...");

  const now = new Date();
  const hoursAgo = (h) => new Date(now.getTime() - h * 3600000).toISOString();
  const daysAgo = (d) => new Date(now.getTime() - d * 86400000).toISOString();

  const ticketDefs = [
    // Linked to Project 0 (Global Tech ERP — Execution phase)
    {
      ticket_number: "INC-2026-0150", ticket_type: "incident",
      subject: "ERP Data Migration batch job timeout on financial ledger",
      description: "The nightly ETL job importing GL transactions exceeded the 4-hour SLA window and aborted.",
      status: "open", priority: "urgent", impact: "high", urgency: "high",
      requester_idx: 0, company_idx: 5, dept_idx: 0, group_idx: 2,
      agent_id: agent1.user_id, project_ctx: createdProjects[0].ctx,
      created_at: hoursAgo(2), updated_at: hoursAgo(1),
    },
    {
      ticket_number: "SR-2026-0095", ticket_type: "service_request",
      subject: "Role permissions configuration for Global Tech Finance Team",
      description: "Provision GL Viewer and AP Approver roles for 12 users in Global Tech Inc.",
      status: "in_progress", priority: "medium", impact: "medium", urgency: "medium",
      requester_idx: 1, company_idx: 5, dept_idx: 1, group_idx: 0,
      agent_id: agent2.user_id, project_ctx: createdProjects[0].ctx,
      created_at: daysAgo(1), updated_at: hoursAgo(3),
    },
    // Linked to Project 1 (Cloud Migration — Build phase)
    {
      ticket_number: "INC-2026-0142", ticket_type: "incident",
      subject: "Production database connection pool exhaustion",
      description: "Multiple microservices experiencing connection timeouts to PostgreSQL cluster. Affects order processing.",
      status: "open", priority: "urgent", impact: "high", urgency: "high",
      requester_idx: 0, company_idx: 0, dept_idx: 0, group_idx: 1,
      agent_id: agent1.user_id, project_ctx: createdProjects[1].ctx,
      created_at: hoursAgo(3), updated_at: hoursAgo(1),
    },
    {
      ticket_number: "SR-2026-0089", ticket_type: "service_request",
      subject: "New VPN access for contractor team",
      description: "5 new contractors joining the data migration team need VPN access.",
      status: "open", priority: "medium", impact: "low", urgency: "medium",
      requester_idx: 3, company_idx: 0, dept_idx: 1, group_idx: 1,
      agent_id: agent1.user_id, project_ctx: createdProjects[1].ctx,
      created_at: daysAgo(1), updated_at: hoursAgo(4),
    },
    {
      ticket_number: "PRB-2026-0012", ticket_type: "problem",
      subject: "Recurring memory leak in payment gateway service",
      description: "Java heap space errors occurring every 48-72 hours requiring service restart.",
      status: "open", priority: "high", impact: "high", urgency: "medium",
      requester_idx: 0, company_idx: 0, dept_idx: 0, group_idx: 2,
      agent_id: agent3.user_id, project_ctx: createdProjects[1].ctx,
      created_at: daysAgo(5), updated_at: daysAgo(1),
    },
    {
      ticket_number: "INC-2026-0138", ticket_type: "incident",
      subject: "API gateway rate limiting triggered incorrectly",
      description: "Legitimate API calls being throttled during business hours.",
      status: "open", priority: "high", impact: "medium", urgency: "high",
      requester_idx: 0, company_idx: 0, dept_idx: 0, group_idx: 2,
      agent_id: agent1.user_id, project_ctx: createdProjects[1].ctx,
      is_overdue: true,
      created_at: daysAgo(3), updated_at: daysAgo(1),
    },
    // Linked to Project 2 (SOC2 — Testing phase)
    {
      ticket_number: "INC-2026-0143", ticket_type: "incident",
      subject: "Kubernetes pod crash loop — staging cluster",
      description: "Staging deployments failing with OOMKilled errors after recent helm chart update.",
      status: "new", priority: "medium", impact: "medium", urgency: "medium",
      requester_idx: 0, company_idx: 0, dept_idx: 0, group_idx: 1,
      agent_id: agent2.user_id, project_ctx: createdProjects[2].ctx,
      created_at: hoursAgo(0.5), updated_at: hoursAgo(0.5),
    },
    {
      ticket_number: "SR-2026-0090", ticket_type: "service_request",
      subject: "Office 365 E5 license upgrade for compliance audit",
      description: "Upgrade 15 users from E3 to E5 for advanced compliance features.",
      status: "on_hold", priority: "medium", impact: "low", urgency: "low",
      requester_idx: 4, company_idx: 1, dept_idx: 2, group_idx: 2,
      agent_id: agent3.user_id, project_ctx: createdProjects[2].ctx,
      is_on_hold: true,
      created_at: daysAgo(3), updated_at: daysAgo(1),
    },
    // Linked to Project 3 (Customer Portal — Discovery phase)
    {
      ticket_number: "SR-2026-0088", ticket_type: "service_request",
      subject: "Software license procurement — Figma Enterprise",
      description: "Need 20 additional Figma Enterprise licenses for the customer portal design team.",
      status: "new", priority: "low", impact: "low", urgency: "low",
      requester_idx: 2, company_idx: 2, dept_idx: 3, group_idx: 2,
      agent_id: agent3.user_id, project_ctx: createdProjects[3].ctx,
      created_at: hoursAgo(1), updated_at: hoursAgo(1),
    },
    // Linked to Project 5 (ITSM Platform — Design phase)
    {
      ticket_number: "INC-2026-0144", ticket_type: "incident",
      subject: "ITSM dashboard rendering blank on Safari",
      description: "The new ITSM dashboard shows a blank page on Safari 17.x. Chrome and Firefox work fine.",
      status: "open", priority: "medium", impact: "medium", urgency: "medium",
      requester_idx: 5, company_idx: 3, dept_idx: 4, group_idx: 2,
      agent_id: agent3.user_id, project_ctx: createdProjects[5].ctx,
      created_at: daysAgo(1), updated_at: hoursAgo(8),
    },
    {
      ticket_number: "SR-2026-0091", ticket_type: "service_request",
      subject: "Request for Jira-ITSM integration test environment",
      description: "Need a staging Jira instance configured for integration testing with the new ITSM platform.",
      status: "new", priority: "medium", impact: "low", urgency: "medium",
      requester_idx: 6, company_idx: 4, dept_idx: 5, group_idx: 3,
      agent_id: agent2.user_id, project_ctx: createdProjects[5].ctx,
      created_at: hoursAgo(4), updated_at: hoursAgo(4),
    },
    // Linked to Project 6 (Zero Trust — Discovery phase)
    {
      ticket_number: "QRY-2026-0035", ticket_type: "query",
      subject: "Zero Trust architecture vendor comparison query",
      description: "Client requesting a comparison of Zscaler, Palo Alto Prisma, and Cloudflare for zero trust implementation.",
      status: "open", priority: "low", impact: "low", urgency: "low",
      requester_idx: 0, company_idx: 0, dept_idx: 0, group_idx: 4,
      agent_id: agent1.user_id, project_ctx: createdProjects[6].ctx,
      created_at: daysAgo(2), updated_at: daysAgo(1),
    },
    // Unlinked tickets
    {
      ticket_number: "INC-2026-0141", ticket_type: "incident",
      subject: "SSO authentication failures for Reliance users",
      description: "Azure AD SAML integration returning 500 errors intermittently.",
      status: "pending", priority: "high", impact: "high", urgency: "medium",
      requester_idx: 1, company_idx: 1, dept_idx: 2, group_idx: 0,
      agent_id: agent2.user_id, project_ctx: null,
      is_overdue: true,
      created_at: daysAgo(2), updated_at: hoursAgo(6),
    },
    {
      ticket_number: "INC-2026-0140", ticket_type: "incident",
      subject: "Email delivery delays — Exchange Online",
      description: "Outbound emails delayed by 15-30 minutes for all users.",
      status: "resolved", priority: "high", impact: "medium", urgency: "high",
      requester_idx: 4, company_idx: 1, dept_idx: 2, group_idx: 0,
      agent_id: agent2.user_id, project_ctx: null,
      resolved_at: hoursAgo(2),
      created_at: daysAgo(1), updated_at: hoursAgo(2),
    },
    {
      ticket_number: "INC-2026-0139", ticket_type: "incident",
      subject: "Printer queue stuck — Floor 3",
      description: "Network printer on Floor 3 not accepting print jobs.",
      status: "closed", priority: "low", impact: "low", urgency: "low",
      requester_idx: 3, company_idx: 0, dept_idx: 1, group_idx: 0,
      agent_id: agent1.user_id, project_ctx: null,
      resolved_at: daysAgo(3), closed_at: daysAgo(2),
      created_at: daysAgo(4), updated_at: daysAgo(2),
    },
    {
      ticket_number: "QRY-2026-0034", ticket_type: "query",
      subject: "VPN configuration for macOS Sequoia",
      description: "Need guidance on setting up corporate VPN on macOS 16.",
      status: "resolved", priority: "low", impact: "low", urgency: "low",
      requester_idx: 2, company_idx: 2, dept_idx: 3, group_idx: 0,
      agent_id: agent2.user_id, project_ctx: null,
      resolved_at: hoursAgo(5),
      created_at: daysAgo(1), updated_at: hoursAgo(5),
    },
    {
      ticket_number: "SR-2026-0087", ticket_type: "service_request",
      subject: "New employee onboarding — batch of 8",
      description: "Provision accounts, laptops, and access for 8 new hires starting Sept 1.",
      status: "open", priority: "medium", impact: "low", urgency: "medium",
      requester_idx: 1, company_idx: 1, dept_idx: 2, group_idx: 0,
      agent_id: agent2.user_id, project_ctx: null,
      created_at: daysAgo(2), updated_at: daysAgo(1),
    },
    {
      ticket_number: "INC-2026-0145", ticket_type: "incident",
      subject: "Firewall misconfiguration blocking internal DNS",
      description: "After a firewall rule change, internal DNS resolution is failing for 10.0.0.0/8 subnets.",
      status: "open", priority: "urgent", impact: "high", urgency: "high",
      requester_idx: 3, company_idx: 0, dept_idx: 1, group_idx: 4,
      agent_id: agent2.user_id, project_ctx: null,
      created_at: hoursAgo(1), updated_at: hoursAgo(0.5),
    },
  ];

  for (const t of ticketDefs) {
    const exists = await itsmDb("tickets").where("ticket_number", t.ticket_number).first();
    if (exists) {
      const updatePayload = {
        agent_user_id: t.agent_id || exists.agent_user_id,
        project_context_id: t.project_ctx?.id || exists.project_context_id,
        project_code: t.project_ctx?.project_code || exists.project_code,
      };
      await itsmDb("tickets").where("id", exists.id).update(updatePayload);
      console.log(`    ⏭  Updated ticket: ${t.ticket_number}`);
      continue;
    }

    await itsmDb("tickets").insert({
      tenant_id: projectTenantId,
      ticket_number: t.ticket_number,
      ticket_type: t.ticket_type,
      subject: t.subject,
      description: t.description,
      status: t.status,
      priority: t.priority,
      impact: t.impact,
      urgency: t.urgency,
      requester_id: requesters[t.requester_idx]?.id || null,
      company_id: companies[t.company_idx]?.id || null,
      department_id: departments[t.dept_idx]?.id || null,
      group_id: groups[t.group_idx]?.id || null,
      agent_user_id: t.agent_id || null,
      project_context_id: t.project_ctx?.id || null,
      project_code: t.project_ctx?.project_code || null,
      is_on_hold: t.is_on_hold || false,
      is_overdue: t.is_overdue || false,
      resolved_at: t.resolved_at || null,
      closed_at: t.closed_at || null,
      created_at: t.created_at,
      updated_at: t.updated_at,
    });
    console.log(`    ✅ Created ticket: ${t.ticket_number} — ${t.subject.substring(0, 45)}`);
  }

  // ─── 10. Create Change Requests ───────────────────────────────
  console.log("\n  🔄 Creating change requests...");
  const crDefs = [
    {
      change_number: "CHG-2026-0045",
      subject: "Database connection pool increase — Production",
      status: "in_progress", change_type: "standard", priority: "urgent", impact: "high", risk: "medium",
      description: "Increase PostgreSQL connection pool from 100 to 200 connections to prevent exhaustion.",
      company_idx: 0, group_idx: 1, agent_id: agent1.user_id,
      project_code: "PRJ-2026-001",
      approval_required: true, release_required: false,
    },
    {
      change_number: "CHG-2026-0044",
      subject: "Firewall rule update for new VPN subnet",
      status: "approved", change_type: "normal", priority: "medium", impact: "low", risk: "low",
      description: "Add new 10.20.0.0/16 subnet to corporate firewall for contractor VPN access.",
      company_idx: 0, group_idx: 1, agent_id: agent2.user_id,
      project_code: "PRJ-2026-001",
      approval_required: true, release_required: false,
    },
    {
      change_number: "CHG-2026-0043",
      subject: "SSL certificate renewal — *.acceleronsolutions.com",
      status: "completed", change_type: "standard", priority: "high", impact: "high", risk: "low",
      description: "Renew and deploy wildcard SSL certificate before expiry.",
      company_idx: 0, group_idx: 1, agent_id: agent3.user_id,
      approval_required: false, release_required: false,
    },
    {
      change_number: "CHG-2026-0042",
      subject: "Kubernetes cluster version upgrade to 1.30",
      status: "draft", change_type: "major", priority: "medium", impact: "high", risk: "high",
      description: "Upgrade all Kubernetes clusters from 1.28 to 1.30. Requires rolling restart.",
      company_idx: null, group_idx: 1, agent_id: agent1.user_id,
      project_code: "PRJ-2026-002",
      approval_required: true, release_required: true,
    },
    {
      change_number: "CHG-2026-0041",
      subject: "Azure AD conditional access policy update",
      status: "closed", change_type: "standard", priority: "medium", impact: "medium", risk: "low",
      description: "Enforce MFA for all admin portal access via conditional access policies.",
      company_idx: 1, group_idx: 0, agent_id: agent2.user_id,
      approval_required: true, release_required: false,
    },
  ];

  for (const cr of crDefs) {
    const exists = await itsmDb("change_requests").where("change_number", cr.change_number).first();
    if (exists) {
      console.log(`    ⏭  Exists: ${cr.change_number}`);
      continue;
    }
    await itsmDb("change_requests").insert({
      tenant_id: itsmTenantId,
      change_number: cr.change_number,
      subject: cr.subject,
      status: cr.status,
      change_type: cr.change_type,
      priority: cr.priority,
      impact: cr.impact,
      risk: cr.risk,
      description: cr.description,
      project_code: cr.project_code || null,
      company_id: cr.company_idx !== null ? (companies[cr.company_idx]?.id || null) : null,
      group_id: groups[cr.group_idx]?.id || null,
      agent_user_id: cr.agent_id,
      approval_required: cr.approval_required,
      release_required: cr.release_required,
    });
    console.log(`    ✅ Created: ${cr.change_number}`);
  }

  // ─── 11. Create Releases ──────────────────────────────────────
  console.log("\n  📦 Creating releases...");
  const relDefs = [
    {
      release_number: "REL-2026-0015",
      subject: "Platform v3.2.0 — August Release",
      description: "Monthly platform release including bug fixes, performance improvements, and new ITSM features.",
      status: "planned", priority: "high", release_type: "minor",
      group_idx: 2, agent_id: agent3.user_id,
    },
    {
      release_number: "REL-2026-0014",
      subject: "Platform v3.1.2 — Hotfix",
      description: "Critical hotfix for payment gateway memory leak.",
      status: "completed", priority: "urgent", release_type: "hotfix",
      group_idx: 2, agent_id: agent1.user_id,
    },
    {
      release_number: "REL-2026-0016",
      subject: "Infrastructure — K8s 1.30 Rollout",
      description: "Coordinated Kubernetes cluster upgrade across all environments.",
      status: "planned", priority: "medium", release_type: "major",
      group_idx: 1, agent_id: agent2.user_id,
    },
  ];

  for (const r of relDefs) {
    const exists = await itsmDb("releases").where("release_number", r.release_number).first();
    if (exists) {
      console.log(`    ⏭  Exists: ${r.release_number}`);
      continue;
    }
    await itsmDb("releases").insert({
      tenant_id: itsmTenantId,
      release_number: r.release_number,
      subject: r.subject,
      description: r.description,
      status: r.status,
      priority: r.priority,
      release_type: r.release_type,
      group_id: groups[r.group_idx]?.id || null,
      agent_user_id: r.agent_id,
    });
    console.log(`    ✅ Created: ${r.release_number}`);
  }

  // ─── 12. Create Project Team Members & Timesheets ─────────────
  console.log("\n  👥 Creating team members and timesheets...");

  for (let i = 0; i < Math.min(4, createdProjects.length); i++) {
    const proj = createdProjects[i];
    const members = [allEmployees[i * 2 + 1], allEmployees[i * 2 + 2], allEmployees[i * 2 + 3]].filter(Boolean);

    for (const mem of members) {
      const exists = await projectDb("project_team_members").where({ project_id: proj.id, user_id: mem.employee_id }).first();
      if (exists) continue;

      const band = rateBands.find((b) => b.level_code === mem.job_level) || rateBands[2] || rateBands[0];
      await projectDb("project_team_members").insert({
        project_id: proj.id,
        user_id: mem.employee_id,
        user_name: mem.full_name,
        rate_band_id: band?.id || null,
        rate_band_name: band?.band_name || null,
        role_in_project: mem.job_level === "G3" ? "Lead Consultant" : mem.job_level === "SRG2" ? "Senior Consultant" : "Consultant",
        allocation_percent: 80,
        start_date: proj.start_date || "2026-01-01",
        is_active: true,
      });
    }

    // Add timesheets
    const activities = ["development", "testing", "design", "meeting", "documentation"];
    for (let day = 1; day <= 5; day++) {
      for (const mem of members.slice(0, 2)) {
        const logDate = `2026-09-0${day}`;
        const exists = await projectDb("project_timesheets").where({
          project_id: proj.id,
          user_id: mem.employee_id,
          log_date: logDate,
        }).first();
        if (exists) continue;

        await projectDb("project_timesheets").insert({
          project_id: proj.id,
          user_id: mem.employee_id,
          user_name: mem.full_name,
          log_date: logDate,
          hours_logged: 7.5,
          activity_type: activities[(day + i) % activities.length],
          notes: `Sprint delivery tasks - day ${day}`,
          status: day <= 3 ? "approved" : "pending",
          approved_by_user_id: day <= 3 ? pm1.employee_id : null,
        });
      }
    }
  }

  console.log("\n✅ Comprehensive seed complete!");
  console.log(`  📁 Projects: ${createdProjects.length}`);
  console.log(`  🎫 Tickets: ${ticketDefs.length}`);
  console.log(`  🔄 Change Requests: ${crDefs.length}`);
  console.log(`  📦 Releases: ${relDefs.length}`);

  process.exit(0);
}

run().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
})
  .finally(closeAll);
