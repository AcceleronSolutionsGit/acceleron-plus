import { NextResponse } from "next/server";
import { requireCapabilityGlobally } from "@/lib/auth";
import { identityDb, projectDb } from "@/lib/db";
import { serverError } from "@/lib/route-helpers";
import { runAllocationImport } from "@/lib/imports/allocation-import";

export const runtime = "nodejs";

/** A response sheet is a few hundred rows of text. Anything larger is a mistake. */
const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Bring a Microsoft Forms response sheet into project_team_members.
 *
 *   POST /api/reports/allocations/import      multipart: file, commit?
 *
 * Called twice for one import: once without `commit` to get the
 * preview, and again with it once somebody has read the preview and
 * pressed the button. Both calls run the same code over the same
 * file, so the second cannot do something the first did not show —
 * the only difference is whether the insert happens.
 *
 * Admin only. The report itself is open to PMs, because staffing a
 * project means knowing who is free; writing allocations across every
 * project at once is a different thing entirely.
 */
export async function POST(req: Request) {
  try {
    const auth = await requireCapabilityGlobally("allocation.import");
    if (!auth.ok) return auth.response;

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json(
        { success: false, error: "Send the file as multipart form data." },
        { status: 400 }
      );
    }

    const file = form.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json(
        { success: false, error: "Choose the responses file to import." },
        { status: 400 }
      );
    }

    const filename = file.name || "responses.xlsx";
    if (!/\.(xlsx|csv)$/i.test(filename)) {
      return NextResponse.json(
        {
          success: false,
          error: "That is not a response sheet. Use the .xlsx Forms gives you, or a .csv.",
        },
        { status: 400 }
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { success: false, error: "That file is larger than 8 MB." },
        { status: 413 }
      );
    }

    const commit = form.get("commit") === "true";
    const dateOrder = form.get("dateOrder") === "mdy" ? "mdy" : "dmy";
    const buffer = Buffer.from(await file.arrayBuffer());

    const result = await runAllocationImport({
      buffer,
      filename,
      identityDb,
      projectDb,
      commit,
      dateOrder,
      importedBy: auth.session.email || auth.session.fullName || null,
    });

    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: 422 });
    }

    return NextResponse.json({
      success: true,
      committed: result.committed,
      filename,
      sheetName: result.sheetName,
      rows: result.rows,
      summary: result.summary,
    });
  } catch (err) {
    return serverError("reports.allocations.import", err);
  }
}
