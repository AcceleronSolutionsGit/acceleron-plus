import { NextResponse } from "next/server";
import { projectDb, identityDb } from "@/lib/db";
import { requireProjectCapability } from "@/lib/auth";
import type { TestCase, TestSuite } from "@/lib/types";
import { serverError } from "@/lib/route-helpers";

export const runtime = "nodejs";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const guard = await requireProjectCapability(id, "plan.view");
    if (!guard.ok) return guard.response;

    const [rawTestCases, suites] = await Promise.all([
      projectDb("test_cases")
        .where("project_id", guard.project.id)
        .orderBy("created_at", "asc"),
      projectDb("test_suites")
        .where("project_id", guard.project.id)
        .orderBy("name", "asc"),
    ]);

    // Attach owners
    const userIds = [...new Set(rawTestCases.map(r => r.owner_user_id).filter(Boolean))];
    let usersMap: Record<string, any> = {};
    if (userIds.length > 0) {
      const users = await identityDb("users")
        .whereIn("id", userIds)
        .select("id", "first_name", "last_name", "email", "job_level", "designation");
      usersMap = Object.fromEntries(
        users.map(u => [
          u.id, 
          {
            id: u.id,
            firstName: u.first_name,
            lastName: u.last_name,
            fullName: `${u.first_name} ${u.last_name}`,
            email: u.email,
            jobLevel: u.job_level,
            designation: u.designation,
          }
        ])
      );
    }

    const testCases = rawTestCases.map(r => ({
      id: r.id,
      projectId: r.project_id,
      suiteId: r.suite_id,
      requirementId: r.requirement_id,
      wbsId: r.wbs_id,
      title: r.title,
      steps: r.steps,
      expectedResult: r.expected_result,
      type: r.type,
      status: r.status,
      ownerUserId: r.owner_user_id,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      owner: r.owner_user_id ? usersMap[r.owner_user_id] : undefined,
    })) as TestCase[];

    const testSuites = suites.map(s => ({
      id: s.id,
      projectId: s.project_id,
      parentId: s.parent_id,
      name: s.name,
      createdAt: s.created_at,
      updatedAt: s.updated_at,
    })) as TestSuite[];

    return NextResponse.json({ success: true, testCases, suites: testSuites });
  } catch (err) {
    return serverError("testcases.GET", err);
  }
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const guard = await requireProjectCapability(id, "plan.create");
    if (!guard.ok) return guard.response;

    const body = await req.json().catch(() => null);
    if (!body || !body.title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const [newItem] = await projectDb("test_cases")
      .insert({
        project_id: guard.project.id,
        suite_id: body.suiteId || null,
        requirement_id: body.requirementId || null,
        wbs_id: body.wbsId || null,
        title: body.title,
        steps: body.steps || null,
        expected_result: body.expectedResult || null,
        type: body.type || "manual",
        status: body.status || "not_run",
        owner_user_id: body.ownerUserId || null,
      })
      .returning("*");

    return NextResponse.json({ success: true, testCase: {
      id: newItem.id,
      projectId: newItem.project_id,
      suiteId: newItem.suite_id,
      requirementId: newItem.requirement_id,
      wbsId: newItem.wbs_id,
      title: newItem.title,
      steps: newItem.steps,
      expectedResult: newItem.expected_result,
      type: newItem.type,
      status: newItem.status,
      ownerUserId: newItem.owner_user_id,
      createdAt: newItem.created_at,
      updatedAt: newItem.updated_at,
    } }, { status: 201 });
  } catch (err) {
    return serverError("testcases.POST", err);
  }
}
