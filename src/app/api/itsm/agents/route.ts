import { NextResponse } from "next/server";
import { getUsers } from "@/lib/api";

export async function GET() {
  try {
    const users = await getUsers();
    return NextResponse.json({ success: true, data: users });
  } catch (error) {
    console.error("Error fetching ITSM agents:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch agents" }, { status: 500 });
  }
}
