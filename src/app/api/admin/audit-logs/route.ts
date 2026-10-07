/**
 * GET /api/admin/audit-logs
 *
 * Returns login audit trail + (future) action logs.
 *
 * Query params:
 *   page      number (default 1)
 *   limit     number (default 50, max 200)
 *   source    "login" | "otp" | "password_reset" | "admin_reset" | "all"
 *   success   "true" | "false" | "all"
 *   email     partial match filter
 *   dateFrom  ISO date
 *   dateTo    ISO date
 */

import { NextResponse } from "next/server";
import { identityDb } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit") || 50)));
  const source = searchParams.get("source") || "all";
  const success = searchParams.get("success") || "all";
  const email = searchParams.get("email") || "";
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");

  try {
    let query = identityDb("login_audit")
      .orderBy("created_at", "desc");

    if (source !== "all") {
      query = query.where("reason", "like", `%${source}%`);
    }
    if (success !== "all") {
      query = query.where("success", success === "true");
    }
    if (email) {
      query = query.where("email", "ilike", `%${email}%`);
    }
    if (dateFrom) {
      query = query.where("created_at", ">=", dateFrom);
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      query = query.where("created_at", "<=", to.toISOString());
    }

    // Count total
    const countResult = await query.clone().count("id as total").first();
    const total = Number((countResult as any)?.total || 0);

    // Paginated rows
    const rows = await query
      .select("id", "user_id", "email", "success", "reason", "ip_address", "user_agent", "created_at")
      .limit(limit)
      .offset((page - 1) * limit);

    // Enrich with user names
    const userIds = [...new Set(rows.filter((r: any) => r.user_id).map((r: any) => r.user_id))];
    let userMap: Record<string, string> = {};
    if (userIds.length > 0) {
      const users = await identityDb("users")
        .whereIn("id", userIds)
        .select("id", "full_name");
      for (const u of users) {
        userMap[(u as any).id] = (u as any).full_name;
      }
    }

    const logs = rows.map((r: any) => ({
      id: r.id,
      userId: r.user_id,
      userName: r.user_id ? userMap[r.user_id] || null : null,
      email: r.email,
      success: r.success,
      reason: r.reason,
      ipAddress: r.ip_address,
      userAgent: r.user_agent,
      createdAt: r.created_at,
    }));

    return NextResponse.json({
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    console.error("Audit log query failed:", err);
    return NextResponse.json({ error: err.message || "Failed to load audit logs" }, { status: 500 });
  }
}
