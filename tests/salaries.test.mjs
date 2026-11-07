import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import {
  isSalaryManager,
  ARINDAM_HARI_EMAIL,
  ARINDAM_HARI_USER_ID,
} from "../src/lib/salary-auth-check.ts";
import {
  cleanNumericCost,
  parseSalaryPasteText,
  parseSalaryExcelBuffer,
  generateSalaryCsvTemplate,
  generateSalaryExcelTemplate,
  applySalaryUpdates,
} from "../src/lib/salary-service.ts";
import { identityDb, projectDb } from "../src/lib/db.ts";

test("1. Salary Authorization Guard - Strictly for Arindam Hari", () => {
  // Arindam Hari exact email
  assert.equal(
    isSalaryManager({ email: "arindam.hari@acceleronsolutions.io" }),
    true,
    "Arindam Hari email must be granted access"
  );

  // Arindam Hari case-insensitive / whitespace
  assert.equal(
    isSalaryManager({ email: "  ARINDAM.HARI@ACCELERONSOLUTIONS.IO  " }),
    true,
    "Should handle uppercase and whitespace"
  );

  // Arindam Hari userId
  assert.equal(
    isSalaryManager({ email: "other@acceleronsolutions.io", userId: ARINDAM_HARI_USER_ID }),
    true,
    "Arindam Hari userId must be granted access"
  );

  // Other users must be strictly denied
  assert.equal(
    isSalaryManager({ email: "john.doe@acceleronsolutions.io" }),
    false,
    "Regular employee must be denied"
  );
  assert.equal(
    isSalaryManager({ email: "admin@acceleronsolutions.io" }),
    false,
    "Generic admin must be denied unless it is Arindam Hari"
  );
  assert.equal(isSalaryManager(null), false, "Null session must be denied");
  assert.equal(isSalaryManager(undefined), false, "Undefined session must be denied");
  assert.equal(isSalaryManager({ email: "" }), false, "Empty email must be denied");

  // SALARY_MANAGER_EMAIL override (for dev/testing)
  process.env.SALARY_MANAGER_EMAIL = "test.manager@acceleronsolutions.io";
  assert.equal(
    isSalaryManager({ email: "test.manager@acceleronsolutions.io" }),
    true,
    "Configured override must be granted access"
  );
  delete process.env.SALARY_MANAGER_EMAIL;
});

test("2. Clean Numeric Cost Parsing", () => {
  assert.equal(cleanNumericCost(15000), 15000);
  assert.equal(cleanNumericCost("15000"), 15000);
  assert.equal(cleanNumericCost("₹15,000.00"), 15000);
  assert.equal(cleanNumericCost("₹ 25,500.50 / day"), 25500.5);
  assert.equal(cleanNumericCost("$18,250.75"), 18250.75);
  assert.equal(cleanNumericCost(" 12,000/d "), 12000);
  assert.equal(cleanNumericCost(" 14,000/day "), 14000);

  // Invalid values
  assert.equal(cleanNumericCost("invalid"), null);
  assert.equal(cleanNumericCost(""), null);
  assert.equal(cleanNumericCost(null), null);
  assert.equal(cleanNumericCost(-500), null);
});

test("3. 3-Column Text Parser (Tab-separated Excel Paste and CSV)", () => {
  // Test Tab-separated paste with headers
  const pasteData = [
    "emp code\tname\tcost of employee",
    "411015\tArindam Hari\t₹15,000",
    "411002\tSneha Sharma\t12500.50",
    "411099\tNew Joiner\t8,000 / day",
  ].join("\n");

  const parsed = parseSalaryPasteText(pasteData);
  assert.equal(parsed.errors.length, 0, "Should have zero errors");
  assert.equal(parsed.rows.length, 3, "Should have parsed 3 employee rows");

  assert.deepEqual(parsed.rows[0], {
    empCode: "411015",
    name: "Arindam Hari",
    cost: 15000,
    rowNumber: 2,
  });

  assert.deepEqual(parsed.rows[1], {
    empCode: "411002",
    name: "Sneha Sharma",
    cost: 12500.5,
    rowNumber: 3,
  });

  assert.deepEqual(parsed.rows[2], {
    empCode: "411099",
    name: "New Joiner",
    cost: 8000,
    rowNumber: 4,
  });

  // Test CSV format without headers
  const csvData = [
    "411001,John Doe,9500",
    "411002,Jane Smith,11000",
  ].join("\n");

  const parsedCsv = parseSalaryPasteText(csvData);
  assert.equal(parsedCsv.errors.length, 0);
  assert.equal(parsedCsv.rows.length, 2);
  assert.equal(parsedCsv.rows[0].empCode, "411001");
  assert.equal(parsedCsv.rows[0].cost, 9500);

  // Test error handling for missing columns
  const badData = [
    "emp code\tname\tcost of employee",
    "411001\tOnly Two Columns",
    "411002\tJane\tNotANumber",
    "\tBlank Code\t12000",
  ].join("\n");

  const badParsed = parseSalaryPasteText(badData);
  assert.equal(badParsed.rows.length, 0);
  assert.equal(badParsed.errors.length, 3);
});

test("4. Excel File Buffer Parser & Template Generation", async () => {
  // Test Excel template generation
  const excelBuffer = await generateSalaryExcelTemplate();
  assert.ok(excelBuffer instanceof Buffer, "Should generate a valid buffer");
  assert.ok(excelBuffer.length > 0, "Buffer should not be empty");

  // Read back generated workbook with ExcelJS
  const workbook = new ExcelJS.Workbook();
  // @ts-expect-error - ExcelJS accepts Buffer
  await workbook.xlsx.load(excelBuffer);
  const worksheet = workbook.worksheets[0];
  assert.ok(worksheet, "Worksheet should exist");

  const h1 = String(worksheet.getRow(1).getCell(1).value).toLowerCase();
  const h2 = String(worksheet.getRow(1).getCell(2).value).toLowerCase();
  const h3 = String(worksheet.getRow(1).getCell(3).value).toLowerCase();

  assert.equal(h1, "emp code", "Column 1 must be 'emp code'");
  assert.equal(h2, "name", "Column 2 must be 'name'");
  assert.equal(h3, "cost of employee", "Column 3 must be 'cost of employee'");

  // Test CSV template generation
  const csvTemplate = await generateSalaryCsvTemplate();
  assert.ok(csvTemplate.startsWith("emp code\tname\tcost of employee"));

  // Test parseSalaryExcelBuffer
  const testWb = new ExcelJS.Workbook();
  const testSheet = testWb.addWorksheet("Salaries");
  testSheet.addRow(["emp code", "name", "cost of employee"]);
  testSheet.addRow(["TEST001", "Alice Smith", 14000]);
  testSheet.addRow(["TEST002", "Bob Jones", "₹16,500.00"]);
  const testBuf = Buffer.from(await testWb.xlsx.writeBuffer());

  const parsedExcel = await parseSalaryExcelBuffer(testBuf);
  assert.equal(parsedExcel.errors.length, 0);
  assert.equal(parsedExcel.rows.length, 2);
  assert.equal(parsedExcel.rows[0].empCode, "TEST001");
  assert.equal(parsedExcel.rows[0].cost, 14000);
  assert.equal(parsedExcel.rows[1].empCode, "TEST002");
  assert.equal(parsedExcel.rows[1].cost, 16500);
});

test("5. Database Persistence & Project Cost Propagation", async () => {
  const testEmpCode = "TEST_SAL_PROP";
  const testName = "Propagation Test Consultant";
  const testCost1 = 12500;
  const testCost2 = 14200;
  const testUserId = "99999999-9999-4999-9999-999999999999";

  try {
    // Clean up any previous test remnants
    await projectDb("project_team_members").where("employee_id", testEmpCode).del();
    await projectDb("project_team_members").where("user_id", testUserId).del();
    await identityDb("users").where("id", testUserId).del();
    await identityDb("employee_salaries").where("employee_id", testEmpCode).del();
    await identityDb("employee_master").where("employee_id", testEmpCode).del();

    const existingUser = await identityDb("users").select("tenant_id").first();
    const tenantId = existingUser?.tenant_id || "default";

    // 1. Insert test user and employee into employee_master & users
    await identityDb("users").insert({
      id: testUserId,
      tenant_id: tenantId,
      email: "test.prop@acceleronsolutions.io",
      full_name: testName,
      darwinbox_ref: testEmpCode,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    });

    await identityDb("employee_master").insert({
      employee_id: testEmpCode,
      full_name: testName,
      company_email_id: "test.prop@acceleronsolutions.io",
      job_level: "M2", // would normally have grade band average
      cost_rate_inr: null,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    });

    // 2. Pick any active project to create a test project_team_member
    const project = await projectDb("projects").select("id").first();
    assert.ok(project, "A project must exist for propagation testing");

    const plannedDays = 20;
    const initialGradeRate = 8000;
    const initialPlannedCost = plannedDays * initialGradeRate;

    const [allocId] = await projectDb("project_team_members").insert(
      {
        project_id: project.id,
        user_id: testUserId,
        employee_id: testEmpCode,
        user_name: testName,
        role_in_project: "Technical Consultant",
        planned_days: plannedDays,
        daily_cost_inr: initialGradeRate,
        custom_daily_cost_inr: null,
        planned_cost_inr: initialPlannedCost,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
      ["id"]
    );

    const createdAllocId = typeof allocId === "object" ? allocId.id : allocId;

    // 3. Apply individual salary update for this employee (Initial individual cost: 12500)
    const outcome1 = await applySalaryUpdates(
      [
        {
          empCode: testEmpCode,
          name: testName,
          cost: testCost1,
          rowNumber: 1,
        },
      ],
      ARINDAM_HARI_EMAIL
    );

    assert.equal(outcome1.success, true);
    assert.equal(outcome1.affectedAllocationsCount >= 1, true, "Allocation must be updated");

    // Verify employee_salaries table
    const salRecord = await identityDb("employee_salaries")
      .where("employee_id", testEmpCode)
      .first();
    assert.ok(salRecord);
    assert.equal(Number(salRecord.cost_per_day), testCost1);
    assert.equal(salRecord.updated_by_email, ARINDAM_HARI_EMAIL);

    // Verify employee_master table
    const masterRecord = await identityDb("employee_master")
      .where("employee_id", testEmpCode)
      .first();
    assert.ok(masterRecord);
    assert.equal(Number(masterRecord.cost_rate_inr), testCost1);

    // Verify project_team_members was updated with individual cost & new planned cost
    const updatedAlloc1 = await projectDb("project_team_members")
      .where("id", createdAllocId)
      .first();
    assert.ok(updatedAlloc1);
    assert.equal(Number(updatedAlloc1.daily_cost_inr), testCost1);
    assert.equal(Number(updatedAlloc1.custom_daily_cost_inr), testCost1);
    assert.equal(Number(updatedAlloc1.planned_cost_inr), plannedDays * testCost1);

    // 4. Test "cost can be edited afterwards as well":
    // Change cost to testCost2 (14200)
    const outcome2 = await applySalaryUpdates(
      [
        {
          empCode: testEmpCode,
          name: testName,
          cost: testCost2,
          rowNumber: 1,
        },
      ],
      ARINDAM_HARI_EMAIL
    );

    assert.equal(outcome2.success, true);
    const updatedAlloc2 = await projectDb("project_team_members")
      .where("id", createdAllocId)
      .first();
    assert.equal(Number(updatedAlloc2.daily_cost_inr), testCost2);
    assert.equal(Number(updatedAlloc2.custom_daily_cost_inr), testCost2);
    assert.equal(Number(updatedAlloc2.planned_cost_inr), plannedDays * testCost2);

    // 5. Test "added for new joiners":
    // Employee not in employee_master yet
    const newJoinerCode = "NEW_JOINER_001";
    const newJoinerCost = 11000;
    const joinerOutcome = await applySalaryUpdates(
      [
        {
          empCode: newJoinerCode,
          name: "Fresh Joiner",
          cost: newJoinerCost,
          rowNumber: 1,
        },
      ],
      ARINDAM_HARI_EMAIL
    );

    assert.equal(joinerOutcome.success, true);
    const joinerSal = await identityDb("employee_salaries")
      .where("employee_id", newJoinerCode)
      .first();
    assert.ok(joinerSal);
    assert.equal(Number(joinerSal.cost_per_day), newJoinerCost);

    // 6. Test Multi-Project Cost Propagation
    // If the same employee is assigned across multiple projects, all are updated
    const otherProjects = await projectDb("projects").whereNot("id", project.id).select("id").limit(2);
    const multiAllocIds = [{ id: createdAllocId, pDays: plannedDays }];

    for (let pIdx = 0; pIdx < otherProjects.length; pIdx++) {
      const proj = otherProjects[pIdx];
      const pDays = 15 + pIdx * 5; // 15, 20 days
      const [newAlloc] = await projectDb("project_team_members").insert(
        {
          project_id: proj.id,
          user_id: testUserId,
          employee_id: testEmpCode,
          user_name: testName,
          role_in_project: "Senior Consultant",
          planned_days: pDays,
          daily_cost_inr: 5000,
          custom_daily_cost_inr: null,
          planned_cost_inr: pDays * 5000,
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        },
        ["id"]
      );
      multiAllocIds.push({
        id: typeof newAlloc === "object" ? newAlloc.id : newAlloc,
        pDays,
      });
    }

    const testCost3 = 18000;
    const multiOutcome = await applySalaryUpdates(
      [
        {
          empCode: testEmpCode,
          name: testName,
          cost: testCost3,
          rowNumber: 1,
        },
      ],
      ARINDAM_HARI_EMAIL
    );

    assert.equal(multiOutcome.success, true);
    assert.equal(multiOutcome.affectedAllocationsCount >= multiAllocIds.length, true);

    // Verify all allocations received the new rate and recalculated planned cost
    for (const alloc of multiAllocIds) {
      const row = await projectDb("project_team_members").where("id", alloc.id).first();
      assert.equal(Number(row.daily_cost_inr), testCost3);
      assert.equal(Number(row.custom_daily_cost_inr), testCost3);
      assert.equal(Number(row.planned_cost_inr), alloc.pDays * testCost3);
    }
  } finally {
    // Clean up test records
    await projectDb("project_team_members").where("employee_id", testEmpCode).del();
    await projectDb("project_team_members").where("user_id", testUserId).del();
    await identityDb("users").where("id", testUserId).del();
    await identityDb("employee_salaries").whereIn("employee_id", [testEmpCode, "NEW_JOINER_001"]).del();
    await identityDb("employee_master").where("employee_id", testEmpCode).del();
    await identityDb.destroy();
    await projectDb.destroy();
  }
});
