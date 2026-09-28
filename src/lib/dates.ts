// ═══════════════════════════════════════════════════════════════
// Calendar dates, handled as calendar dates.
//
// A `date` column in Postgres has no time and no zone — 2026-11-22 is
// the 22nd, everywhere. The pg driver hands it back as a JS Date at
// LOCAL midnight, and `mapSnakeToCamel` then serialises that with
// toISOString(), which converts to UTC:
//
//   Postgres      2026-11-22
//   pg driver     Sun Nov 22 2026 00:00:00 GMT+0530
//   toISOString   2026-11-21T18:30:00.000Z
//   .slice(0,10)  2026-11-21          ← a day early, every time
//
// Anywhere east of Greenwich that truncation is wrong, and in a date
// input it is worse than cosmetic: the field shows the 21st, the form
// posts the 21st, and the row quietly moves back a day each time
// somebody opens the editor and saves.
//
// So: never truncate an ISO string, and never go through UTC. Read the
// local calendar day, which is the day the driver decoded.
// ═══════════════════════════════════════════════════════════════

const pad = (n: number) => String(n).padStart(2, "0");

/** A Date → "YYYY-MM-DD" using its local calendar day. */
export function toISODate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Anything date-shaped → "YYYY-MM-DD", or "" when there is nothing
 * usable. Safe to feed straight into `<input type="date">`.
 *
 * A bare "2026-11-22" is returned as-is rather than parsed: `new Date`
 * reads that form as UTC midnight, which would reintroduce the very
 * shift this module exists to avoid.
 */
export function toDateInput(value: Date | string | null | undefined): string {
  if (!value) return "";

  if (typeof value === "string") {
    const bare = /^(\d{4}-\d{2}-\d{2})/.exec(value);
    if (bare && !value.includes("T")) return bare[1];
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : toISODate(date);
}

/** Today, as the calendar sees it here. */
export function todayISO(): string {
  return toISODate(new Date());
}

/** Midnight local on the day `value` names, or null. */
export function parseISODate(value: Date | string | null | undefined): Date | null {
  const iso = toDateInput(value);
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** `days` from today, as "YYYY-MM-DD" — for "due in 30 days" defaults. */
export function todayPlusISO(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

/**
 * A date for a person to read — "21 Sep 2026" — without the round trip
 * through UTC that `new Date("2026-09-21").toLocaleDateString()` makes.
 *
 * That round trip is the same off-by-one this module exists to stop: the
 * string parses as UTC midnight, and any browser west of Greenwich then
 * renders the day before. Here the calendar parts are read straight out
 * of the string and a local Date is built from them, so the day shown is
 * the day stored, in every timezone.
 */
export function formatISODate(
  value: Date | string | null | undefined,
  options: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric" }
): string {
  const date = parseISODate(value);
  if (!date) return "—";
  return date.toLocaleDateString("en-IN", options);
}
