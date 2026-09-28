import { NextResponse } from "next/server";
import { syncDarwinboxEmployees } from "@/lib/darwinbox";
import { requireRole } from "@/lib/auth";

export async function POST() {
  const auth = await requireRole(["admin"]);
  if (!auth.ok) return auth.response;

  try {
    const result = await syncDarwinboxEmployees();
    
    if (result.success) {
      return NextResponse.json(result, { status: 200 });
    } else {
      return NextResponse.json(result, { status: 500 });
    }
  } catch (error) {
    console.error("API error during Darwinbox sync:", error);
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
  }
}

export async function GET() {
  const auth = await requireRole(["admin"]);
  if (!auth.ok) return auth.response;

  // Allow GET for easy testing via browser, though POST is standard for actions
  return POST();
}
