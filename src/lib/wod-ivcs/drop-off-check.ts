import type { WodIvcsOperationalQueue } from "@prisma/client";

/**
 * Phase 4+: promote AWAITING_DROP_OFF → NEEDS_REVIEW when past 48h and still on report.
 * Phase 1: pure helper only (import may call; no-op until agents submit).
 */
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
