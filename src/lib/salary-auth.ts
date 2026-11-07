/**
 * Server-side authorization guard for individual employee salary and cost management.
 *
 * Requirements:
 * "add a provision for only Arindam Hari to add individual salary of each individual's salary"
 *
 * Exclusively restricted to Arindam Hari (arindam.hari@acceleronsolutions.io).
 * For automated testing and local developer environments, SALARY_MANAGER_EMAIL
 * environment variable can be configured as an override.
 */

import { NextResponse } from "next/server";
import { getSession, type SessionPayload } from "./auth";
import {
  isSalaryManager,
  ARINDAM_HARI_EMAIL,
  ARINDAM_HARI_USER_ID,
  ARINDAM_HARI_EMP_ID,
} from "./salary-auth-check";

export {
  isSalaryManager,
  ARINDAM_HARI_EMAIL,
  ARINDAM_HARI_USER_ID,
  ARINDAM_HARI_EMP_ID,
};

export type SalaryAuthResult =
  | { ok: true; session: SessionPayload }
  | { ok: false; response: NextResponse };

export async function requireSalaryManager(): Promise<SalaryAuthResult> {
  const session = await getSession();
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "Authentication required." },
        { status: 401 }
      ),
    };
  }

  if (!isSalaryManager(session)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          success: false,
          error: "Access Denied: Only Arindam Hari is authorized to view or manage individual employee salaries.",
        },
        { status: 403 }
      ),
    };
  }

  return { ok: true, session };
}
