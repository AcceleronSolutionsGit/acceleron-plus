// ═══════════════════════════════════════════════════════════════
// When the Darwinbox auto-sync should run next.
//
// Pure — no database — so it can be tested on its own and the admin
// screen and the scheduler agree to the minute. Times of day are in
// India time (the company's clock), whatever timezone the server is in.
// ═══════════════════════════════════════════════════════════════

export type AutosyncFrequency = "hourly" | "every_6h" | "every_12h" | "daily";

export const AUTOSYNC_FREQUENCIES: Record<AutosyncFrequency, { label: string; hours: number }> = {
  hourly: { label: "Every hour", hours: 1 },
  every_6h: { label: "Every 6 hours", hours: 6 },
  every_12h: { label: "Every 12 hours", hours: 12 },
  daily: { label: "Every 24 hours", hours: 24 },
};

export const SYNC_TIMEZONE = "Asia/Kolkata";

/** The scheduler wakes every 15 minutes; a run this close to due counts as due. */
const TOLERANCE_MS = 5 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export interface AutosyncSettings {
  enabled: boolean;
  frequency: AutosyncFrequency;
  /** 0–23, India time — only used by "daily". */
  dailyHour: number;
  /** When it was last switched on. */
  enabledAt: Date | null;
}

export function isFrequency(value: unknown): value is AutosyncFrequency {
  return typeof value === "string" && value in AUTOSYNC_FREQUENCIES;
}

/** Year/month/day/hour of an instant as seen in `timeZone`. */
function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
}

/** The instant when the clock in `timeZone` reads year-month-day hour:00. */
function zonedTimeToUtc(year: number, month: number, day: number, hour: number, timeZone: string): Date {
  const guess = Date.UTC(year, month - 1, day, hour, 0, 0);
  const seen = zonedParts(new Date(guess), timeZone);
  const seenAsUtc = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute, seen.second);
  return new Date(guess - (seenAsUtc - guess));
}

/** Today's (in `timeZone`) daily slot, as an instant. */
function dailySlotOn(now: Date, hour: number, timeZone: string): Date {
  const p = zonedParts(now, timeZone);
  return zonedTimeToUtc(p.year, p.month, p.day, hour, timeZone);
}

/**
 * When the next automatic run should happen, or null when auto-sync is off.
 *
 * The schedule counts from whichever is later: the last automatic run,
 * or the moment auto-sync was switched on. So switching it on does not
 * fire a sync that minute, and a server that was down over a daily slot
 * catches up once when it comes back rather than waiting a whole day.
 */
export function nextAutosyncAt(
  settings: AutosyncSettings,
  lastAutoRunAt: Date | null,
  now: Date,
  timeZone: string = SYNC_TIMEZONE
): Date | null {
  if (!settings.enabled) return null;

  const reference = [lastAutoRunAt, settings.enabledAt]
    .filter((d): d is Date => d instanceof Date && !Number.isNaN(d.getTime()))
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

  if (settings.frequency === "daily") {
    const hour = Math.min(23, Math.max(0, Math.trunc(settings.dailyHour)));
    const today = dailySlotOn(now, hour, timeZone);
    // "Done today" includes a run a few minutes early (the scheduler's
    // tolerance), or a 06:57 run would be followed by another at 07:12.
    if (reference && reference.getTime() >= today.getTime() - TOLERANCE_MS) {
      return new Date(today.getTime() + DAY_MS); // already done today
    }
    if (now.getTime() < today.getTime()) return today; // later today
    // Today's slot has passed and nothing ran since it: due now — unless
    // it was only just switched on after the slot, handled above.
    return reference ? now : new Date(today.getTime() + DAY_MS);
  }

  const hours = AUTOSYNC_FREQUENCIES[settings.frequency]?.hours ?? 24;
  if (!reference) return now;
  return new Date(reference.getTime() + hours * HOUR_MS);
}

/** Should the scheduler run a sync now? */
export function isAutosyncDue(
  settings: AutosyncSettings,
  lastAutoRunAt: Date | null,
  now: Date,
  timeZone: string = SYNC_TIMEZONE
): boolean {
  const next = nextAutosyncAt(settings, lastAutoRunAt, now, timeZone);
  return next !== null && next.getTime() - TOLERANCE_MS <= now.getTime();
}

/** "Daily at 07:00" / "Every 6 hours" — for the button. */
export function describeSchedule(settings: Pick<AutosyncSettings, "frequency" | "dailyHour">): string {
  if (settings.frequency === "daily") {
    return `Every 24 h at ${String(settings.dailyHour).padStart(2, "0")}:00`;
  }
  return AUTOSYNC_FREQUENCIES[settings.frequency]?.label ?? settings.frequency;
}
