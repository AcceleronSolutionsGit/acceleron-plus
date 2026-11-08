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
  user: {
    email?: string | null;
    userId?: string | null;
    id?: string | null;
    fullName?: string | null;
    darwinboxRef?: string | null;
  } | null | undefined
): boolean {
  if (!user) return false;
  const email = (user.email || "").toLowerCase().trim();
  const fullName = (user.fullName || "").toLowerCase().trim();
  const userId = user.userId || user.id;
  const darwinboxRef = (user.darwinboxRef || "").trim();

  // Primary check: Arindam Hari
  if (
    email === ARINDAM_HARI_EMAIL ||
    email.startsWith("arindam.hari@") ||
    email.includes("arindam.hari") ||
    userId === ARINDAM_HARI_USER_ID ||
    darwinboxRef === ARINDAM_HARI_EMP_ID ||
    fullName === "arindam hari" ||
    (fullName.includes("arindam") && fullName.includes("hari"))
  ) {
    return true;
  }

  // Developer / test environment override (e.g. during local tests)
  if (typeof process !== "undefined" && process.env?.SALARY_MANAGER_EMAIL) {
    const override = process.env.SALARY_MANAGER_EMAIL.toLowerCase().trim();
    if (email && email === override) return true;
  }

  return false;
}

