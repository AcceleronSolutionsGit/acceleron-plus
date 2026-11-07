/**
 * Isomorphic authorization check for individual employee salary management.
 * Can be safely imported in both Server Components, API routes, and Client Components.
 *
 * Requirements:
 * "add a provision for only Arindam Hari to add individual salary of each individual's salary"
 */

export const ARINDAM_HARI_EMAIL = "arindam.hari@acceleronsolutions.io";
export const ARINDAM_HARI_USER_ID = "560abeca-60b2-47f0-acfd-8b1fd04334eb";
export const ARINDAM_HARI_EMP_ID = "411015";

export function isSalaryManager(
  user: { email?: string | null; userId?: string | null; id?: string | null } | null | undefined
): boolean {
  if (!user || !user.email) return false;
  const email = user.email.toLowerCase().trim();

  // Primary check: Arindam Hari
  if (
    email === ARINDAM_HARI_EMAIL ||
    user.userId === ARINDAM_HARI_USER_ID ||
    user.id === ARINDAM_HARI_USER_ID
  ) {
    return true;
  }

  // Developer / test environment override (e.g. during local tests)
  if (typeof process !== "undefined" && process.env?.SALARY_MANAGER_EMAIL) {
    const override = process.env.SALARY_MANAGER_EMAIL.toLowerCase().trim();
    if (email === override) return true;
  }

  return false;
}

