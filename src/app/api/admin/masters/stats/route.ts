import { NextResponse } from "next/server";
import { identityDb, projectDb, itsmDb } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export async function GET() {
  const auth = await requireRole(["admin"]);
  if (!auth.ok) return auth.response;

  try {
    const [empCountRes, rateCountRes, compCountRes, lastSyncRes] = await Promise.all([
      identityDb("employee_master").count<{ count: string }>("* as count").first(),
      projectDb("employee_rate_bands").count<{ count: string }>("* as count").first(),
      itsmDb("companies").count<{ count: string }>("* as count").first(),
      identityDb("employee_master")
        .max<{ max: string }>("last_synced_at as max")
        .first(),
    ]);

    const totalEmployees = parseInt(empCountRes?.count ?? "0", 10);
    const totalRateBands = parseInt(rateCountRes?.count ?? "0", 10);
    const totalCompanies = parseInt(compCountRes?.count ?? "0", 10);
    const lastSyncedAt = lastSyncRes?.max ?? null;

    return NextResponse.json({
      success: true,
      data: {
        totalEmployees,
        totalRateBands,
        totalCompanies,
        lastSyncedAt,
      },
    });
  } catch (error) {
    console.error("Error fetching admin stats:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch admin stats" },
      { status: 500 }
    );
  }
}
