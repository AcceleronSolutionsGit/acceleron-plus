// ═══════════════════════════════════════════════════════════════
// Shared helpers for PMT resource routes.
//
// The planning routes used to spread the request body straight into
// an insert (`...body`), which let a caller set any column — including
// id, tenant_id and project_id. Everything here exists to make that
// impossible: define the fields a route accepts, and nothing else
// reaches the database.
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { projectDb, describeSetupError } from "./db";

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ResolvedProject {
  id: string;
  code: string;
  name: string;
  tenant_id: string | null;
  project_manager_user_id: string | null;
  sponsor_user_id: string | null;
  status: string | null;
}

/**
 * Look up a project by UUID **or** code.
 *
 * The routes are reached as both /pmt/<uuid>/... and /pmt/PRJ-0001/...,
 * and the old POST handlers wrote the raw URL segment into project_id —
 * which silently produced orphan rows whenever a code was used.
 */
export async function resolveProjectOr404(
  idOrCode: string
): Promise<{ ok: true; project: ResolvedProject } | { ok: false; response: NextResponse }> {
  const project = idOrCode
    ? await projectDb("projects")
        .where(UUID_RE.test(idOrCode) ? "id" : "code", idOrCode)
        .select(
          "id",
          "code",
          "name",
          "tenant_id",
          "project_manager_user_id",
          "sponsor_user_id",
          "status"
        )
        .first<ResolvedProject | undefined>()
    : undefined;

  if (!project) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, error: "Project not found" }, { status: 404 }),
    };
  }
  return { ok: true, project };
}

// ─── Field definitions ─────────────────────────────────────────────

export type FieldKind = "string" | "text" | "int" | "number" | "bool" | "date" | "uuid";

export interface FieldSpec {
  /** Database column. */
  column: string;
  kind: FieldKind;
  /** Allowed values for an enum-like column. */
  enum?: readonly string[];
  /** Reject an empty value on create. */
  required?: boolean;
  min?: number;
  max?: number;
  maxLength?: number;
}

/** Accepts both camelCase and snake_case keys from the client. */
function readKey(body: Record<string, unknown>, column: string): unknown {
  if (column in body) return body[column];
  const camel = column.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
  return camel in body ? body[camel] : undefined;
}

export interface CoerceResult {
  values: Record<string, unknown>;
  errors: string[];
  /** Columns the caller actually supplied, for change detection. */
  touched: string[];
}

/**
 * Pull only the declared fields out of a request body, coercing and
 * validating each one. Anything not declared is dropped silently.
 */
export function coerceFields(
  body: unknown,
  specs: Record<string, FieldSpec>,
  mode: "create" | "update"
): CoerceResult {
  const values: Record<string, unknown> = {};
  const errors: string[] = [];
  const touched: string[] = [];

  const source = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;

  for (const [label, spec] of Object.entries(specs)) {
    const raw = readKey(source, spec.column);

    if (raw === undefined) {
      if (mode === "create" && spec.required) errors.push(`${label} is required.`);
      continue;
    }

    touched.push(spec.column);

    // Explicit null clears a nullable column.
    if (raw === null || raw === "") {
      if (spec.required) {
        errors.push(`${label} cannot be empty.`);
        continue;
      }
      values[spec.column] = null;
      continue;
    }

    switch (spec.kind) {
      case "string":
      case "text": {
        const str = String(raw).trim();
        if (spec.required && !str) {
          errors.push(`${label} cannot be empty.`);
          break;
        }
        if (spec.maxLength && str.length > spec.maxLength) {
          errors.push(`${label} must be ${spec.maxLength} characters or fewer.`);
          break;
        }
        if (spec.enum && !spec.enum.includes(str)) {
          errors.push(`${label} must be one of: ${spec.enum.join(", ")}.`);
          break;
        }
        values[spec.column] = str;
        break;
      }

      case "int":
      case "number": {
        const num = Number(raw);
        if (!Number.isFinite(num)) {
          errors.push(`${label} must be a number.`);
          break;
        }
        const value = spec.kind === "int" ? Math.round(num) : num;
        if (spec.min !== undefined && value < spec.min) {
          errors.push(`${label} must be at least ${spec.min}.`);
          break;
        }
        if (spec.max !== undefined && value > spec.max) {
          errors.push(`${label} must be at most ${spec.max}.`);
          break;
        }
        values[spec.column] = value;
        break;
      }

      case "bool":
        values[spec.column] = raw === true || raw === "true" || raw === 1 || raw === "1";
        break;

      case "date": {
        const date = new Date(String(raw));
        if (Number.isNaN(date.getTime())) {
          errors.push(`${label} is not a valid date.`);
          break;
        }
        values[spec.column] = date;
        break;
      }

      case "uuid": {
        const str = String(raw).trim();
        if (!UUID_RE.test(str)) {
          errors.push(`${label} must be a valid id.`);
          break;
        }
        values[spec.column] = str;
        break;
      }
    }
  }

  return { values, errors, touched };
}

/** 400 response listing every validation problem at once. */
export function validationError(errors: string[]): NextResponse {
  return NextResponse.json(
    { success: false, error: errors.join(" "), errors },
    { status: 400 }
  );
}

/** Parse a JSON body, or return a 400. */
export async function readJson(
  request: Request
): Promise<{ ok: true; body: unknown } | { ok: false; response: NextResponse }> {
  try {
    return { ok: true, body: await request.json() };
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ success: false, error: "Invalid request body." }, { status: 400 }),
    };
  }
}

/** Consistent 500 that logs the cause but doesn't leak it to the client. */
/**
 * The money columns on a project_team_members row. Stripped from any
 * response going to somebody without team.viewCost — the key is removed,
 * not zeroed, so "not allowed to see" never reads as "free".
 */
export const TEAM_COST_FIELDS = [
  "daily_cost_inr",
  "daily_billable_rate_inr",
  "planned_cost_inr",
  "planned_billable_inr",
] as const;

export function withoutTeamCost<T extends Record<string, unknown>>(row: T | null | undefined): T | null | undefined {
  if (!row) return row;
  const copy: Record<string, unknown> = { ...row };
  for (const field of TEAM_COST_FIELDS) delete copy[field];
  return copy as T;
}

/** "Role must be Developer, Team Lead or PM." — one wording everywhere. */
export const TEAM_ROLE_REQUIRED = "The role must be Developer, Team Lead or PM.";

/** 403 for anybody but an admin or one of the project's PMs touching a PM. */
export function pmAssignmentRefused(): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error:
        "Only an administrator or one of this project's PMs can add, change or remove a PM — being PM gives access to the project's finances.",
    },
    { status: 403 }
  );
}

export function serverError(context: string, err: unknown): NextResponse {
  console.error(`[${context}]`, err);

  // A missing table or column is a setup problem, not a bug in the
  // request — say which migration to run rather than "try again".
  const setup = describeSetupError(err);
  if (setup) {
    return NextResponse.json({ success: false, error: setup }, { status: 503 });
  }

  return NextResponse.json(
    { success: false, error: `Could not complete this action. Please try again.` },
    { status: 500 }
  );
}
