// ═══════════════════════════════════════════════════════════════
// Pure staffing and allocation calculations (independent of database)
// ═══════════════════════════════════════════════════════════════

const pad = (n: number) => String(n).padStart(2, "0");

function toDateInput(value: Date | string | null | undefined): string {
  if (!value) return "";
  if (typeof value === "string") {
    const bare = /^(\d{4}-\d{2}-\d{2})/.exec(value);
    if (bare && !value.includes("T")) return bare[1];
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseISODate(value: Date | string | null | undefined): Date | null {
  const iso = toDateInput(value);
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Hours in a working day — the divisor turning logged hours into days. */
export const HOURS_PER_DAY = 8;

export interface AllocationPeriod {
  id?: string;
  startDate: string;
  endDate: string;
  allocationPercent: number;
}

export function parseAllocationPeriods(val: unknown): AllocationPeriod[] | null {
  if (!val) return null;
  let parsed = val;
  if (typeof val === "string") {
    try {
      parsed = JSON.parse(val);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(parsed)) return null;
  const list: AllocationPeriod[] = [];
  for (const item of parsed) {
    if (item && typeof item === "object") {
      const raw = item as Record<string, unknown>;
      const s = toDateInput((raw.startDate ?? raw.start_date) as string) ||
        (typeof (raw.startDate ?? raw.start_date) === "string" ? String(raw.startDate ?? raw.start_date) : null);
      const e = toDateInput((raw.endDate ?? raw.end_date) as string) ||
        (typeof (raw.endDate ?? raw.end_date) === "string" ? String(raw.endDate ?? raw.end_date) : null);
      const pct = Math.max(1, Number(raw.allocationPercent ?? raw.allocation_percent) || 100);
      if (s && e) {
        list.push({
          id: raw.id ? String(raw.id) : undefined,
          startDate: s,
          endDate: e,
          allocationPercent: pct,
        });
      }
    }
  }
  return list.length > 0 ? list : null;
}

/**
 * Working days between two dates, inclusive, calculated using a fixed standard of 24 days per month.
 *
 * Each full calendar month contributes exactly 24 working days.
 * Partial months contribute proportionally based on active calendar days:
 *   (activeDays / daysInMonth) * 24
 */
export function workingDaysBetween(
  start: string | Date | null | undefined,
  end: string | Date | null | undefined
): number {
  const from = parseISODate(start as string);
  const to = parseISODate(end as string);
  if (!from || !to || to < from) return 0;

  let totalDays = 0;
  const current = new Date(from.getFullYear(), from.getMonth(), 1);
  const endMonth = new Date(to.getFullYear(), to.getMonth(), 1);

  while (current <= endMonth) {
    const year = current.getFullYear();
    const month = current.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const startDay =
      year === from.getFullYear() && month === from.getMonth() ? from.getDate() : 1;
    const endDay =
      year === to.getFullYear() && month === to.getMonth() ? to.getDate() : daysInMonth;

    const activeDays = Math.max(0, endDay - startDay + 1);
    if (activeDays >= daysInMonth) {
      totalDays += 24;
    } else {
      totalDays += (activeDays / daysInMonth) * 24;
    }

    current.setMonth(current.getMonth() + 1);
  }

  return round2(totalDays);
}

export interface PlannedCost {
  plannedDays: number;
  plannedCostInr: number;
  plannedBillableInr: number;
}

/**
 * What an assignment is expected to cost.
 *
 * When multi-period allocation breakdown is provided, all periods are summed together:
 *   plannedDays = sum(workingDays(period) * periodAlloc% / 100)
 */
export function plannedCostFor(input: {
  startDate: string | null | undefined;
  endDate: string | null | undefined;
  allocationPercent: number | null | undefined;
  dailyCostInr: number | null | undefined;
  dailyBillableRateInr?: number | null | undefined;
  /** Override the calendar calculation when somebody has typed a figure. */
  plannedDays?: number | null;
  /** Multi-period allocation breakdown if allocation % changes over time */
  allocationPeriods?: AllocationPeriod[] | null;
}): PlannedCost {
  const allocation = Math.max(0, Number(input.allocationPercent ?? 100));
  const cost = Number(input.dailyCostInr ?? 0);
  const billable = Number(input.dailyBillableRateInr ?? 0);

  let days = 0;
  if (input.allocationPeriods && Array.isArray(input.allocationPeriods) && input.allocationPeriods.length > 0) {
    // Multi-period breakdown: sum each period's working days weighted by its allocation %
    let periodDays = 0;
    for (const p of input.allocationPeriods) {
      const pAlloc = Math.max(0, Number(p.allocationPercent ?? 100));
      const pWorkDays = workingDaysBetween(p.startDate, p.endDate);
      periodDays += (pWorkDays * pAlloc) / 100;
    }
    days = round2(periodDays);
  } else if (input.plannedDays !== undefined && input.plannedDays !== null) {
    days = Number(input.plannedDays);
  } else {
    const calendarDays = workingDaysBetween(input.startDate, input.endDate);
    days = round2((calendarDays * allocation) / 100);
  }

  return {
    plannedDays: days,
    plannedCostInr: round2(days * cost),
    plannedBillableInr: round2(days * billable),
  };
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
