// ═══════════════════════════════════════════════════════════════
// Field definitions for the PMT planning resources.
//
// Shared by the collection routes (POST) and the item routes
// (PATCH), so create and edit always accept exactly the same set.
// project_id, tenant_id and id are deliberately absent — those are
// set by the server, never by the caller.
// ═══════════════════════════════════════════════════════════════

import type { FieldSpec } from "./route-helpers";

export const WBS_STATUSES = ["not_started", "in_progress", "blocked", "completed"] as const;
export const MILESTONE_STATUSES = ["pending", "at_risk", "completed", "missed"] as const;
export const RISK_PROBABILITIES = ["low", "medium", "high"] as const;
export const RISK_IMPACTS = ["low", "medium", "high"] as const;
export const RISK_STATUSES = ["open", "mitigating", "closed", "accepted"] as const;
export const GOVERNANCE_OUTCOMES = ["pass", "conditional_pass", "fail"] as const;

export const WBS_FIELDS: Record<string, FieldSpec> = {
  Name: { column: "name", kind: "string", required: true, maxLength: 300 },
  Code: { column: "code", kind: "string", maxLength: 50 },
  Description: { column: "description", kind: "text", maxLength: 5000 },
  "Parent work package": { column: "parent_wbs_id", kind: "uuid" },
  Sequence: { column: "sequence", kind: "int", min: 0, max: 100000 },
  Status: { column: "status", kind: "string", enum: WBS_STATUSES },
  "Start date": { column: "start_date", kind: "date" },
  "End date": { column: "end_date", kind: "date" },
  Progress: { column: "progress_percent", kind: "int", min: 0, max: 100 },
  "Estimated hours": { column: "estimated_hours", kind: "number", min: 0, max: 100000 },
  Owner: { column: "owner_user_id", kind: "string", maxLength: 64 },
};

export const MILESTONE_FIELDS: Record<string, FieldSpec> = {
  Name: { column: "name", kind: "string", required: true, maxLength: 300 },
  Description: { column: "description", kind: "text", maxLength: 5000 },
  "Due date": { column: "due_date", kind: "date" },
  Status: { column: "status", kind: "string", enum: MILESTONE_STATUSES },
  "Completed at": { column: "completed_at", kind: "date" },
  Owner: { column: "owner_user_id", kind: "string", maxLength: 64 },
  "Billing milestone": { column: "is_billing_milestone", kind: "bool" },
};

export const RISK_FIELDS: Record<string, FieldSpec> = {
  Title: { column: "title", kind: "string", required: true, maxLength: 300 },
  Description: { column: "description", kind: "text", maxLength: 5000 },
  Probability: { column: "probability", kind: "string", enum: RISK_PROBABILITIES },
  Impact: { column: "impact", kind: "string", enum: RISK_IMPACTS },
  Status: { column: "status", kind: "string", enum: RISK_STATUSES },
  Owner: { column: "owner_user_id", kind: "string", maxLength: 64 },
  "Mitigation plan": { column: "mitigation_plan", kind: "text", maxLength: 5000 },
};

export const GOVERNANCE_FIELDS: Record<string, FieldSpec> = {
  "Review type": { column: "review_type", kind: "string", required: true, maxLength: 120 },
  "Review date": { column: "review_date", kind: "date", required: true },
  Outcome: { column: "outcome", kind: "string", enum: GOVERNANCE_OUTCOMES },
  Notes: { column: "notes", kind: "text", maxLength: 10000 },
};
