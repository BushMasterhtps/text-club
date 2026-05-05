import {
  getAgentReportingRangeBoundsUtc,
  getAgentReportingTodayYmd,
  addCalendarDaysToReportingYmd,
  reportingYmdFromUtcInstant,
} from "@/lib/agent-reporting-day-bounds";
import { getSprintDates, getSprintNumber } from "@/lib/sprint-utils";
import { QA_SPRINT_LENGTH_DAYS } from "@/lib/quality-review-constants";

/**
 * QA “sprint” date shortcuts (`getDefaultSprintYmdBounds`, `getPreviousSprintYmdBounds`) use the same fixed
 * 14-day sprint epochs as productivity (`src/lib/sprint-utils.ts`), not a rolling 14-day window ending today.
 * `QA_SPRINT_LENGTH_DAYS` must stay in sync with `SPRINT_DURATION_DAYS` in sprint-utils (both 14).
 *
 * Rolling windows for arbitrary N-day shortcuts remain in `getLastNDaysReportingYmdBounds`.
 */

/**
 * Shift a PST reporting YYYY-MM-DD label by whole calendar days (e.g. dashboard shortcuts).
 * Same calendar arithmetic as addCalendarDaysToReportingYmd.
 */
export function addDaysToYmd(ymd: string, deltaDays: number): string {
  return addCalendarDaysToReportingYmd(ymd, deltaDays);
}

/** Map sprint-utils UTC [start, end] instants to inclusive PST reporting labels for QA APIs. */
function sprintUtcBoundsToReportingYmdRange(start: Date, end: Date): { startYmd: string; endYmd: string } {
  return {
    startYmd: reportingYmdFromUtcInstant(start),
    endYmd: reportingYmdFromUtcInstant(end),
  };
}

/** Rolling 14 inclusive PST reporting days ending on `now`’s reporting day (pre–sprint-epoch fallback only). */
function rollingFourteenDayWindowEndingToday(now: Date): { startYmd: string; endYmd: string } {
  const endYmd = getAgentReportingTodayYmd(now);
  const startYmd = addCalendarDaysToReportingYmd(endYmd, -(QA_SPRINT_LENGTH_DAYS - 1));
  return { startYmd, endYmd };
}

/**
 * Current sprint as YYYY-MM-DD labels: same calendar as `getCurrentSprint()` / sprint-rankings
 * (`getSprintDates(getSprintNumber(now))`).
 * Before the sprint epoch (`getSprintNumber` < 1), falls back to a rolling 14-day window ending today.
 */
export function getDefaultSprintYmdBounds(now = new Date()): { startYmd: string; endYmd: string } {
  const n = getSprintNumber(now);
  if (n < 1) {
    return rollingFourteenDayWindowEndingToday(now);
  }
  const { start, end } = getSprintDates(n);
  return sprintUtcBoundsToReportingYmdRange(start, end);
}

/**
 * Previous productivity sprint (sprint number − 1) as YYYY-MM-DD labels.
 * For sprint 1, returns the 14 reporting days immediately before sprint 1 starts (no sprint 0 in calendar).
 * Before the sprint epoch, uses the prior rolling 14-day block (legacy behavior).
 */
export function getPreviousSprintYmdBounds(now = new Date()): { startYmd: string; endYmd: string } {
  const n = getSprintNumber(now);
  if (n < 1) {
    const cur = rollingFourteenDayWindowEndingToday(now);
    return {
      startYmd: addCalendarDaysToReportingYmd(cur.startYmd, -QA_SPRINT_LENGTH_DAYS),
      endYmd: addCalendarDaysToReportingYmd(cur.endYmd, -QA_SPRINT_LENGTH_DAYS),
    };
  }
  if (n < 2) {
    const { start: sprint1Start } = getSprintDates(1);
    const endYmd = addCalendarDaysToReportingYmd(reportingYmdFromUtcInstant(sprint1Start), -1);
    const startYmd = addCalendarDaysToReportingYmd(endYmd, -(QA_SPRINT_LENGTH_DAYS - 1));
    return { startYmd, endYmd };
  }
  const { start, end } = getSprintDates(n - 1);
  return sprintUtcBoundsToReportingYmdRange(start, end);
}

/** Last `days` inclusive PST reporting days ending on PST "today" (e.g. Last 30 shortcut). */
export function getLastNDaysReportingYmdBounds(
  days: number,
  now = new Date()
): { startYmd: string; endYmd: string } {
  const endYmd = getAgentReportingTodayYmd(now);
  const startYmd = addCalendarDaysToReportingYmd(endYmd, -(Math.max(1, days) - 1));
  return { startYmd, endYmd };
}

export function reportingBoundsForYmdRange(startYmd: string, endYmd: string) {
  return getAgentReportingRangeBoundsUtc(startYmd, endYmd);
}
