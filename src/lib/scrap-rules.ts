// ═══════════════════════════════════════════════════════════════
// The parts of scrapping that a browser is allowed to know.
//
// Deliberately separate from `scrap.ts`, which imports the database.
// The confirmation dialog needs the minimum reason length so it can
// validate as you type, and importing it from `scrap.ts` dragged the
// Postgres driver into the client bundle — a build error, and a
// reminder that a shared constant is not a reason to share a module.
//
// Nothing here touches a database, so both sides can use it and the
// rule cannot end up stated differently in two places.
// ═══════════════════════════════════════════════════════════════

/** The shortest reason anybody could give that is actually a reason. */
export const MIN_REASON_LENGTH = 10;
export const MAX_REASON_LENGTH = 1000;

/**
 * Why a reason is not acceptable, or null if it is.
 *
 * "A reason is required" is the whole point of the feature — a project
 * that vanished with "asdf" written against it is no more accountable
 * than one that vanished silently.
 */
export function reasonProblem(reason: unknown): string | null {
  if (typeof reason !== "string") return "A reason is required.";
  const trimmed = reason.trim();
  if (trimmed.length === 0) return "A reason is required.";
  if (trimmed.length < MIN_REASON_LENGTH) {
    return `Say a little more — at least ${MIN_REASON_LENGTH} characters. Whoever reads this later will only have this sentence.`;
  }
  if (trimmed.length > MAX_REASON_LENGTH) {
    return `That is longer than ${MAX_REASON_LENGTH} characters.`;
  }
  return null;
}
