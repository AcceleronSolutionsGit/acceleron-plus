import { projectDb, itsmDb } from "./db.ts";
import { saveDocument } from "./document-storage.ts";
import { round2 } from "./costing.ts";

export interface ProjectChangeRequestItem {
  id: string;
  projectId: string;
  tenantId: string;
  crNumber: string;
  title: string;
  description: string | null;
  status: "approved" | "requested" | "in_progress" | "completed" | "rejected" | "draft";
  orderValueInr: number;
  plannedHours: number;
  actualHours: number;
  poNumber: string | null;
  documentId: string | null;
  documentName: string | null;
  documentUrl: string | null;
  documentStoredName: string | null;
  documentSizeBytes: number | null;
  documentMimeType: string | null;
  createdByUserId: string | null;
  createdByName: string | null;
  approvedByUserId: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectChangeRequestsSummary {
  initialOrderValueInr: number;
  crOrderValueInr: number;
  totalOrderValueInr: number;
  totalPlannedHours: number;
  totalActualHours: number;
  varianceHours: number;
  hoursBurnPercent: number;
  count: number;
  approvedCount: number;
}

/**
 * Ensures the `project_change_requests` table and project order value columns exist.
 * Runs idempotently on first call so manual DB migrations are not required.
 */
let schemaEnsured = false;
export async function ensureChangeRequestSchema(): Promise<void> {
  if (schemaEnsured) return;

  try {
    // 1. Create project_change_requests table if missing
    const hasTable = await projectDb.schema.hasTable("project_change_requests");
    if (!hasTable) {
      await projectDb.schema.createTable("project_change_requests", (t) => {
        t.uuid("id").primary().defaultTo(projectDb.raw("gen_random_uuid()"));
        t.string("tenant_id", 255).notNullable().defaultTo("acceleron");
        t.uuid("project_id").notNullable().index();
        t.string("cr_number", 50).notNullable();
        t.string("title", 500).notNullable();
        t.text("description");
        t.string("status", 50).notNullable().defaultTo("approved");
        t.decimal("order_value_inr", 15, 2).notNullable().defaultTo(0);
        t.decimal("planned_hours", 10, 2).notNullable().defaultTo(0);
        t.decimal("actual_hours", 10, 2).notNullable().defaultTo(0);
        t.string("po_number", 255);
        t.uuid("document_id");
        t.string("document_name", 255);
        t.string("document_url", 1000);
        t.string("document_stored_name", 255);
        t.bigInteger("document_size_bytes");
        t.string("document_mime_type", 255);
        t.string("created_by_user_id", 255);
        t.string("created_by_name", 255);
        t.string("approved_by_user_id", 255);
        t.timestamp("approved_at");
        t.uuid("itsm_change_id");
        t.timestamps(true, true);
      });
      console.log("  [change-request-service] Created table: project_change_requests");
    }

    // 2. Add initial_order_value_inr to projects table if missing
    const hasInitial = await projectDb.schema.hasColumn("projects", "initial_order_value_inr");
    if (!hasInitial) {
      await projectDb.schema.alterTable("projects", (t) => {
        t.decimal("initial_order_value_inr", 15, 2);
      });
      // Backfill initial baseline from existing budget_inr
      await projectDb.raw(
        "UPDATE projects SET initial_order_value_inr = budget_inr WHERE initial_order_value_inr IS NULL AND budget_inr IS NOT NULL"
      );
      console.log("  [change-request-service] Added column: projects.initial_order_value_inr");
    }

    // 3. Add cr_value_inr to projects table if missing
    const hasCrValue = await projectDb.schema.hasColumn("projects", "cr_value_inr");
    if (!hasCrValue) {
      await projectDb.schema.alterTable("projects", (t) => {
        t.decimal("cr_value_inr", 15, 2).defaultTo(0);
      });
      console.log("  [change-request-service] Added column: projects.cr_value_inr");
    }

    schemaEnsured = true;
  } catch (err) {
    console.error("[change-request-service] Error ensuring schema:", err);
  }
}

/**
 * Reconciles and updates a project's order value:
 * Total Order Value = Initial Value + Approved CR Value
 */
export async function reconcileProjectOrderValue(projectId: string): Promise<{
  initialOrderValueInr: number;
  crOrderValueInr: number;
  totalOrderValueInr: number;
}> {
  await ensureChangeRequestSchema();

  const project = await projectDb("projects").where("id", projectId).first();
  if (!project) throw new Error("Project not found");

  // Sum all approved / active change request values (exclude rejected & draft)
  const approvedCrs = await projectDb("project_change_requests")
    .where("project_id", projectId)
    .whereNotIn("status", ["rejected", "draft"]);

  const crOrderValueInr = round2(
    approvedCrs.reduce((sum, cr) => sum + (parseFloat(cr.order_value_inr) || 0), 0)
  );

  // If initial_order_value_inr is not yet recorded, initialize with current budget_inr
  let initialOrderValueInr: number;
  if (project.initial_order_value_inr !== null && project.initial_order_value_inr !== undefined) {
    initialOrderValueInr = parseFloat(project.initial_order_value_inr) || 0;
  } else {
    initialOrderValueInr = parseFloat(project.budget_inr) || 0;
    await projectDb("projects")
      .where("id", projectId)
      .update({ initial_order_value_inr: initialOrderValueInr });
  }

  const totalOrderValueInr = round2(initialOrderValueInr + crOrderValueInr);

  // Update project record with revised total order value and CR total
  await projectDb("projects")
    .where("id", projectId)
    .update({
      budget_inr: totalOrderValueInr,
      cr_value_inr: crOrderValueInr,
      initial_order_value_inr: initialOrderValueInr,
      updated_at: new Date(),
    });

  return {
    initialOrderValueInr,
    crOrderValueInr,
    totalOrderValueInr,
  };
}

/**
 * Maps raw DB row to ProjectChangeRequestItem
 */
function mapRow(r: any): ProjectChangeRequestItem {
  return {
    id: r.id,
    projectId: r.project_id,
    tenantId: r.tenant_id,
    crNumber: r.cr_number,
    title: r.title,
    description: r.description,
    status: r.status,
    orderValueInr: parseFloat(r.order_value_inr) || 0,
    plannedHours: parseFloat(r.planned_hours) || 0,
    actualHours: parseFloat(r.actual_hours) || 0,
    poNumber: r.po_number,
    documentId: r.document_id,
    documentName: r.document_name,
    documentUrl: r.document_url,
    documentStoredName: r.document_stored_name,
    documentSizeBytes: r.document_size_bytes ? Number(r.document_size_bytes) : null,
    documentMimeType: r.document_mime_type,
    createdByUserId: r.created_by_user_id,
    createdByName: r.created_by_name,
    approvedByUserId: r.approved_by_user_id,
    approvedAt: r.approved_at ? new Date(r.approved_at).toISOString() : null,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}

/**
 * Fetches all Change Requests for a project along with summary metrics.
 */
export async function getProjectChangeRequests(projectId: string): Promise<{
  changeRequests: ProjectChangeRequestItem[];
  summary: ProjectChangeRequestsSummary;
}> {
  await ensureChangeRequestSchema();

  const [project, rows] = await Promise.all([
    projectDb("projects").where("id", projectId).first(),
    projectDb("project_change_requests")
      .where("project_id", projectId)
      .orderBy("created_at", "desc"),
  ]);

  if (!project) throw new Error("Project not found");

  // Query actual hours logged against CRs in ITSM time_logs (if available)
  let actualHoursMap: Record<string, number> = {};
  try {
    const timeLogs = await itsmDb("time_logs")
      .where("project_id", projectId)
      .whereNotNull("change_request_id")
      .select("change_request_id", itsmDb.raw("SUM(hours_logged) as total_hours"))
      .groupBy("change_request_id");

    for (const log of timeLogs) {
      if (log.change_request_id) {
        actualHoursMap[log.change_request_id] = parseFloat(log.total_hours) || 0;
      }
    }
  } catch {
    // Graceful fallback if itsm time_logs is empty or unlinked
  }

  const changeRequests = rows.map((r: any) => {
    const item = mapRow(r);
    if (actualHoursMap[item.id] !== undefined) {
      item.actualHours = actualHoursMap[item.id];
    }
    return item;
  });

  const approvedCrs = changeRequests.filter(
    (cr) => cr.status !== "rejected" && cr.status !== "draft"
  );

  const initialOrderValueInr =
    project.initial_order_value_inr !== null && project.initial_order_value_inr !== undefined
      ? parseFloat(project.initial_order_value_inr) || 0
      : parseFloat(project.budget_inr) || 0;

  const crOrderValueInr = round2(
    approvedCrs.reduce((sum, cr) => sum + cr.orderValueInr, 0)
  );

  const totalOrderValueInr = round2(initialOrderValueInr + crOrderValueInr);
  const totalPlannedHours = round2(approvedCrs.reduce((sum, cr) => sum + cr.plannedHours, 0));
  const totalActualHours = round2(approvedCrs.reduce((sum, cr) => sum + cr.actualHours, 0));
  const varianceHours = round2(totalPlannedHours - totalActualHours);
  const hoursBurnPercent = totalPlannedHours > 0 ? round2((totalActualHours / totalPlannedHours) * 100) : 0;

  return {
    changeRequests,
    summary: {
      initialOrderValueInr,
      crOrderValueInr,
      totalOrderValueInr,
      totalPlannedHours,
      totalActualHours,
      varianceHours,
      hoursBurnPercent,
      count: changeRequests.length,
      approvedCount: approvedCrs.length,
    },
  };
}

/**
 * Creates a Change Request on a project with optional file (PO or doc) attachment,
 * planned hours, and order value, then recalculates and updates the total project order value.
 */
export async function createProjectChangeRequest(input: {
  projectId: string;
  title: string;
  description?: string | null;
  orderValueInr?: number | string | null;
  plannedHours?: number | string | null;
  poNumber?: string | null;
  status?: "approved" | "requested" | "in_progress" | "completed" | "rejected" | "draft";
  crNumber?: string | null;
  createdByUserId?: string | null;
  createdByName?: string | null;
  file?: {
    originalName: string;
    mimeType: string;
    buffer: Buffer;
  } | null;
}): Promise<{
  changeRequest: ProjectChangeRequestItem;
  orderValue: {
    initialOrderValueInr: number;
    crOrderValueInr: number;
    totalOrderValueInr: number;
  };
}> {
  await ensureChangeRequestSchema();

  const project = await projectDb("projects").where("id", input.projectId).first();
  if (!project) throw new Error("Project not found");

  const orderValueInr = round2(
    input.orderValueInr !== null && input.orderValueInr !== undefined && !Number.isNaN(Number(input.orderValueInr))
      ? Math.max(0, Number(input.orderValueInr))
      : 0
  );

  const plannedHours = round2(
    input.plannedHours !== null && input.plannedHours !== undefined && !Number.isNaN(Number(input.plannedHours))
      ? Math.max(0, Number(input.plannedHours))
      : 0
  );

  // Generate CR number if not provided: CR-{CODE}-{SEQ}
  let crNumber = (input.crNumber || "").trim();
  if (!crNumber) {
    const existingCount: any = await projectDb("project_change_requests")
      .where("project_id", input.projectId)
      .count("id as count")
      .first();
    const countVal = existingCount?.count ?? 0;
    const seq = (parseInt(String(countVal), 10) + 1).toString().padStart(3, "0");
    const code = project.code || "PRJ";
    crNumber = `CR-${code}-${seq}`;
  }

  // Handle PO or Doc upload if provided
  let documentId: string | null = null;
  let documentName: string | null = null;
  let documentUrl: string | null = null;
  let documentStoredName: string | null = null;
  let documentSizeBytes: number | null = null;
  let documentMimeType: string | null = null;

  if (input.file && input.file.buffer && input.file.buffer.byteLength > 0) {
    try {
      const saved = await saveDocument(
        input.projectId,
        input.file.originalName,
        input.file.mimeType,
        input.file.buffer
      );

      // Save into project_documents table so it is managed in Docs & Files
      const [doc] = await projectDb("project_documents")
        .insert({
          project_id: input.projectId,
          document_type: "change_order",
          category: "contract",
          title: `CR Document - ${crNumber}`,
          description: `PO / Document attached to change request ${crNumber} (${input.title})`,
          file_name: input.file.originalName,
          stored_file_name: saved.storedFileName,
          file_path: saved.filePath,
          mime_type: saved.mimeType,
          file_size_bytes: saved.fileSizeBytes,
          checksum_sha256: saved.checksumSha256,
          uploaded_by_user_id: input.createdByUserId || "system",
          uploaded_by_name: input.createdByName || "Project Manager",
          access_level: "team",
          is_active: true,
          is_latest_version: true,
        })
        .returning("*");

      documentId = doc.id;
      documentName = input.file.originalName;
      documentUrl = `/api/documents/${doc.id}/download`;
      documentStoredName = saved.storedFileName;
      documentSizeBytes = saved.fileSizeBytes;
      documentMimeType = saved.mimeType;
    } catch (docErr) {
      console.error("[change-request-service] Failed to save attached document:", docErr);
    }
  }

  const status = input.status || "approved";
  const now = new Date();

  // Insert change request
  const [row] = await projectDb("project_change_requests")
    .insert({
      project_id: input.projectId,
      tenant_id: project.tenant_id || "acceleron",
      cr_number: crNumber,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      status,
      order_value_inr: orderValueInr,
      planned_hours: plannedHours,
      actual_hours: 0,
      po_number: input.poNumber?.trim() || null,
      document_id: documentId,
      document_name: documentName,
      document_url: documentUrl,
      document_stored_name: documentStoredName,
      document_size_bytes: documentSizeBytes,
      document_mime_type: documentMimeType,
      created_by_user_id: input.createdByUserId || null,
      created_by_name: input.createdByName || null,
      approved_by_user_id: status === "approved" ? input.createdByUserId || null : null,
      approved_at: status === "approved" ? now : null,
    })
    .returning("*");

  // Mirror into itsmDb("change_requests") for full ITSM-PMT cross-traceability
  try {
    await itsmDb("change_requests").insert({
      tenant_id: "8434da2c-a300-433f-83fd-57249690ad09",
      change_number: crNumber,
      subject: input.title.trim(),
      description: input.description?.trim() || null,
      change_type: "standard",
      status: status === "approved" ? "approved" : "draft",
      priority: "medium",
      impact: "medium",
      risk: "low",
      project_id: input.projectId,
      project_code: project.code,
      approval_required: false,
    });
  } catch {
    // Non-fatal if itsmDb table doesn't allow cross-insert
  }

  // Reconcile and update the project's total order value
  const orderValue = await reconcileProjectOrderValue(input.projectId);

  return {
    changeRequest: mapRow(row),
    orderValue,
  };
}

/**
 * Updates an existing Change Request and refreshes the project's order value.
 */
export async function updateProjectChangeRequest(
  crId: string,
  updates: {
    title?: string;
    description?: string | null;
    status?: "approved" | "requested" | "in_progress" | "completed" | "rejected" | "draft";
    orderValueInr?: number | string | null;
    plannedHours?: number | string | null;
    actualHours?: number | string | null;
    poNumber?: string | null;
    approvedByUserId?: string | null;
  }
): Promise<{
  changeRequest: ProjectChangeRequestItem;
  orderValue: {
    initialOrderValueInr: number;
    crOrderValueInr: number;
    totalOrderValueInr: number;
  };
}> {
  await ensureChangeRequestSchema();

  const existing = await projectDb("project_change_requests").where("id", crId).first();
  if (!existing) throw new Error("Change Request not found");

  const updatePayload: Record<string, any> = {
    updated_at: new Date(),
  };

  if (updates.title !== undefined) updatePayload.title = updates.title.trim();
  if (updates.description !== undefined) updatePayload.description = updates.description?.trim() || null;
  if (updates.status !== undefined) {
    updatePayload.status = updates.status;
    if (updates.status === "approved" && !existing.approved_at) {
      updatePayload.approved_at = new Date();
      if (updates.approvedByUserId) updatePayload.approved_by_user_id = updates.approvedByUserId;
    }
  }
  if (updates.orderValueInr !== undefined && updates.orderValueInr !== null) {
    updatePayload.order_value_inr = round2(Math.max(0, Number(updates.orderValueInr) || 0));
  }
  if (updates.plannedHours !== undefined && updates.plannedHours !== null) {
    updatePayload.planned_hours = round2(Math.max(0, Number(updates.plannedHours) || 0));
  }
  if (updates.actualHours !== undefined && updates.actualHours !== null) {
    updatePayload.actual_hours = round2(Math.max(0, Number(updates.actualHours) || 0));
  }
  if (updates.poNumber !== undefined) updatePayload.po_number = updates.poNumber?.trim() || null;

  const [updated] = await projectDb("project_change_requests")
    .where("id", crId)
    .update(updatePayload)
    .returning("*");

  const orderValue = await reconcileProjectOrderValue(existing.project_id);

  return {
    changeRequest: mapRow(updated),
    orderValue,
  };
}

/**
 * Deletes a Change Request and recalculates the project's order value.
 */
export async function deleteProjectChangeRequest(crId: string): Promise<{
  success: boolean;
  orderValue: {
    initialOrderValueInr: number;
    crOrderValueInr: number;
    totalOrderValueInr: number;
  };
}> {
  await ensureChangeRequestSchema();

  const existing = await projectDb("project_change_requests").where("id", crId).first();
  if (!existing) throw new Error("Change Request not found");

  const projectId = existing.project_id;
  await projectDb("project_change_requests").where("id", crId).del();

  const orderValue = await reconcileProjectOrderValue(projectId);

  return {
    success: true,
    orderValue,
  };
}
