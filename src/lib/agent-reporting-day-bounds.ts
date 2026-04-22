/**
 * Agent-facing "reporting day" in fixed PST (UTC−8), matching legacy /api/agent/stats behavior.
 * Used by completed-today, stats, and completion-stats so the same YYYY-MM-DD means the same UTC window.
 *
 * Half-open interval [startUtc, endExclusiveUtc) for safe Prisma filters: gte + lt.
 */

const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;

function pad2(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

function ymdFromInstantInPstFixed(instant: Date): { year: number; month: number; day: number } {
  const shiftedUtc = new Date(instant.getTime() - EIGHT_HOURS_MS);
  return {
    year: shiftedUtc.getUTCFullYear(),
    month: shiftedUtc.getUTCMonth() + 1,
    day: shiftedUtc.getUTCDate(),
  };
}

function boundsFromCalendarYmd(year: number, month: number, day: number): {
  startUtc: Date;
  endExclusiveUtc: Date;
} {
  // 00:00 PST on calendar day = 08:00 UTC same civil date; next PST midnight = +1 day 08:00 UTC
  const startUtc = new Date(Date.UTC(year, month - 1, day, 8, 0, 0, 0));
  const endExclusiveUtc = new Date(Date.UTC(year, month - 1, day + 1, 8, 0, 0, 0));
  return { startUtc, endExclusiveUtc };
}

/**
 * @param dateParam YYYY-MM-DD or null/undefined/empty → "today" in PST (fixed UTC−8)
 * @throws Error with message INVALID_AGENT_DATE if the string is not parseable as YYYY-MM-DD numbers
 */
export function getAgentReportingDayBoundsUtc(
  dateParam: string | null | undefined
): { startUtc: Date; endExclusiveUtc: Date } {
  const trimmed = dateParam?.trim();
  if (!trimmed) {
    const { year, month, day } = ymdFromInstantInPstFixed(new Date());
    return boundsFromCalendarYmd(year, month, day);
  }

  const parts = trimmed.split("-").map(Number);
  if (parts.length !== 3) {
    throw new Error("INVALID_AGENT_DATE");
  }
  const [year, month, day] = parts;
  if (![year, month, day].every((n) => Number.isFinite(n))) {
    throw new Error("INVALID_AGENT_DATE");
  }
  if (isNaN(year) || isNaN(month) || isNaN(day)) {
    throw new Error("INVALID_AGENT_DATE");
  }

  return boundsFromCalendarYmd(year, month, day);
}

/** Current agent reporting calendar day as YYYY-MM-DD (fixed PST, same basis as bounds). */
export function getAgentReportingTodayYmd(now: Date = new Date()): string {
  const { year, month, day } = ymdFromInstantInPstFixed(now);
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/**
 * Add whole calendar days to a PST reporting calendar label (YYYY-MM-DD).
 * Uses Gregorian civil date arithmetic on the label (same calendar system as reporting days).
 */
export function addCalendarDaysToReportingYmd(ymd: string, deltaDays: number): string {
  const trimmed = ymd.trim();
  const parts = trimmed.split("-").map(Number);
  if (parts.length !== 3 || !parts.every((n) => Number.isFinite(n))) {
    throw new Error("INVALID_AGENT_DATE");
  }
  const [y, m, d] = parts;
  const t = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`;
}

/**
 * Inclusive calendar range [startYmd, endYmd] in fixed PST (UTC−8), each day full width.
 * Half-open overall window: [startUtc, endExclusiveUtc).
 */
export function getAgentReportingRangeBoundsUtc(
  startYmd: string,
  endYmd: string
): { startUtc: Date; endExclusiveUtc: Date } {
  const s = startYmd.trim();
  const e = endYmd.trim();
  if (!s || !e) {
    throw new Error("INVALID_AGENT_DATE");
  }
  const lo = s <= e ? s : e;
  const hi = s <= e ? e : s;
  const startUtc = getAgentReportingDayBoundsUtc(lo).startUtc;
  const endExclusiveUtc = getAgentReportingDayBoundsUtc(hi).endExclusiveUtc;
  return { startUtc, endExclusiveUtc };
}
