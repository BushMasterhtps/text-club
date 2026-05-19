import type {
  WodIvcsOperationalQueue,
  WodIvcsPresenceState,
  WodIvcsSourceReportType,
} from "@prisma/client";

/** True when at least one participating report still has PRESENT presence. */
export function isStillPresentOnParticipatingReports(input: {
  presenceNetSuite: WodIvcsPresenceState;
  presenceAging: WodIvcsPresenceState;
  requiredReports: WodIvcsSourceReportType[];
}): boolean {
  return input.requiredReports.some((reportType) => {
    const state =
      reportType === "NETSUITE_REPORT" ? input.presenceNetSuite : input.presenceAging;
    return state === "PRESENT";
  });
}

/** Promote AWAITING_DROP_OFF → NEEDS_REVIEW when past deadline and still on a participating report. */
export function shouldPromoteToNeedsReview(input: {
  operationalQueue: WodIvcsOperationalQueue;
  awaitingDropOffDeadlineAt: Date | null;
  stillPresentOnRelevantReport: boolean;
  now?: Date;
}): boolean {
  const now = input.now ?? new Date();
  if (input.operationalQueue !== "AWAITING_DROP_OFF") return false;
  if (!input.awaitingDropOffDeadlineAt) return false;
  if (!input.stillPresentOnRelevantReport) return false;
  return now.getTime() > input.awaitingDropOffDeadlineAt.getTime();
}
