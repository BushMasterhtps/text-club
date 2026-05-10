/**
 * Holds Daily Activity uses America/Los_Angeles civil dates (YYYY-MM-DD from the UI)
 * for TaskWorkSession endedAt windows and legacy task windows.
 * Server timezone must not affect interpretation of those strings.
 */

export const HOLDS_DAILY_ACTIVITY_TZ = "America/Los_Angeles";

const PARTS_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: HOLDS_DAILY_ACTIVITY_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function partsAt(ms: number) {
  const o: Record<string, string> = {};
  for (const p of PARTS_FMT.formatToParts(new Date(ms))) {
    if (p.type !== "literal") o[p.type] = p.value;
  }
  return {
    y: Number(o.year),
    m: Number(o.month),
    d: Number(o.day),
    h: Number(o.hour),
    min: Number(o.minute),
    s: Number(o.second),
  };
}

/** Today's calendar date in America/Los_Angeles as YYYY-MM-DD. */
export function formatYmdPacific(now: Date): string {
  const { y, m, d } = partsAt(now.getTime());
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** First UTC instant where Pacific local time is YYYY-MM-DD 00:00:00.000 (inclusive lower bound for that civil day). */
export function pacificYmdToUtcStart(ymd: string): Date {
  const [Y, M, D] = ymd.split("-").map(Number);
  const target = Y * 1e4 + M * 100 + D;
  let lo = Date.UTC(Y, M - 1, D - 1, 0, 0, 0);
  let hi = Date.UTC(Y, M - 1, D + 1, 0, 0, 0);
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const { y, m, d } = partsAt(mid);
    const cur = y * 1e4 + m * 100 + d;
    if (cur < target) lo = mid + 1;
    else hi = mid;
  }
  return new Date(lo);
}

function localTimeMinutesSinceMidnight(p: { h: number; min: number; s: number }): number {
  return p.h * 3600 + p.min * 60 + p.s;
}

/**
 * Exclusive upper bound for "business day" used by legacy EOD (5:00 PM local on ymd).
 * First UTC instant where Pacific local time is >= 17:00:00 on that civil date (DST-safe).
 */
export function pacificYmdToUtcExclusiveEnd5pm(ymd: string): Date {
  const [Y, M, D] = ymd.split("-").map(Number);
  let t = pacificYmdToUtcStart(ymd).getTime();
  const cutoff = 17 * 3600;
  for (let i = 0; i < 2000; i++) {
    const p = partsAt(t);
    const same = p.y === Y && p.m === M && p.d === D;
    if (!same) {
      return new Date(t);
    }
    if (localTimeMinutesSinceMidnight(p) >= cutoff) {
      return new Date(t);
    }
    t += 60 * 1000;
  }
  return new Date(t);
}

/**
 * Legacy / session day window end: if ymd is "today" in Pacific and now is before 5 PM that day, use `now`;
 * otherwise use exclusive 5 PM end for that civil day.
 */
export function pacificYmdToUtcDayEndForActivity(ymd: string, now: Date): Date {
  const todayYmd = formatYmdPacific(now);
  if (ymd !== todayYmd) {
    return pacificYmdToUtcExclusiveEnd5pm(ymd);
  }
  const fivePm = pacificYmdToUtcExclusiveEnd5pm(ymd);
  return now < fivePm ? now : fivePm;
}

/** Inclusive range [startYmd, endYmd] as Pacific civil dates. */
export function enumeratePacificYmdRange(startYmd: string, endYmd: string): string[] {
  const out: string[] = [];
  let cur = startYmd;
  const guard = 400;
  let n = 0;
  while (cur <= endYmd && n++ < guard) {
    out.push(cur);
    if (cur === endYmd) break;
    cur = nextPacificYmd(cur);
  }
  return out;
}

export function nextPacificYmd(ymd: string): string {
  const t0 = pacificYmdToUtcStart(ymd).getTime();
  let t = t0 + 20 * 3600 * 1000;
  for (let i = 0; i < 48; i++) {
    const next = formatYmdPacific(new Date(t));
    if (next !== ymd) return next;
    t += 3600 * 1000;
  }
  return formatYmdPacific(new Date(t0 + 36 * 3600 * 1000));
}

export function addPacificCalendarDays(ymd: string, deltaDays: number): string {
  if (deltaDays === 0) return ymd;
  let cur = ymd;
  const step = deltaDays > 0 ? 1 : -1;
  for (let i = 0; i < Math.abs(deltaDays); i++) {
    cur = step > 0 ? nextPacificYmd(cur) : previousPacificYmd(cur);
  }
  return cur;
}

function previousPacificYmd(ymd: string): string {
  const t0 = pacificYmdToUtcStart(ymd).getTime();
  let t = t0 - 20 * 3600 * 1000;
  for (let i = 0; i < 48; i++) {
    const prev = formatYmdPacific(new Date(t));
    if (prev !== ymd) return prev;
    t -= 3600 * 1000;
  }
  return formatYmdPacific(new Date(t0 - 36 * 3600 * 1000));
}

/** Multi-day TaskWorkSession query: endedAt in [gte, lt). */
export function getSessionQueryBounds(startYmd: string, endYmd: string, now: Date): { gte: Date; lt: Date } {
  const gte = pacificYmdToUtcStart(startYmd);
  const todayYmd = formatYmdPacific(now);
  if (endYmd === todayYmd) {
    const five = pacificYmdToUtcExclusiveEnd5pm(endYmd);
    const lt = now < five ? now : five;
    return { gte, lt };
  }
  const lt = pacificYmdToUtcExclusiveEnd5pm(endYmd);
  return { gte, lt };
}
