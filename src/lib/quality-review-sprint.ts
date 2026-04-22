import {
  getAgentReportingRangeBoundsUtc,
  getAgentReportingTodayYmd,
  addCalendarDaysToReportingYmd,
} from "@/lib/agent-reporting-day-bounds";
import { QA_SPRINT_LENGTH_DAYS } from "@/lib/quality-review-constants";

/**
 * Shift a PST reporting YYYY-MM-DD label by whole calendar days (e.g. dashboard shortcuts).
 * Same calendar arithmetic as addCalendarDaysToReportingYmd.
 */
export function addDaysToYmd(ymd: string, deltaDays: number): string {
  return addCalendarDaysToReportingYmd(ymd, deltaDays);
}

/**
 * Default QA sprint: last QA_SPRINT_LENGTH_DAYS inclusive PST reporting days ending on PST "today".
 * Labels are fed to getAgentReportingRangeBoundsUtc (same semantics as eligibility / dashboard APIs).
 */
export function getDefaultSprintYmdBounds(now = new Date()): { startYmd: string; endYmd: string } {
  const endYmd = getAgentReportingTodayYmd(now);
  const startYmd = addCalendarDaysToReportingYmd(endYmd, -(QA_SPRINT_LENGTH_DAYS - 1));
  return { startYmd, endYmd };
}

export function reportingBoundsForYmdRange(startYmd: string, endYmd: string) {
  return getAgentReportingRangeBoundsUtc(startYmd, endYmd);
}
