import { NextResponse } from "next/server";
import { requireCapabilityGlobally } from "@/lib/auth";
import { listPmCandidates } from "@/lib/project-managers";

export const runtime = "nodejs";

/** Everyone who can be picked as a project manager. */
export async function GET() {
  const auth = await requireCapabilityGlobally("project.create");
  if (!auth.ok) return auth.response;
  try {
    const people = await listPmCandidates();
    return NextResponse.json(
      { success: true, people },
      { headers: { "Cache-Control": "private, max-age=60" } }
    );
  } catch (err) {
    console.error("people.GET", err);
    return NextResponse.json({ success: false, error: "Could not load people." }, { status: 500 });
  }
}
