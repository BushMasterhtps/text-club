/**
 * Default QA coverage: reviews per agent per sprint window.
 * Keep centralized so it can move to admin settings later.
 */
export const QA_SPRINT_LENGTH_DAYS = 14;

/** Inclusive count of calendar days in a sprint (e.g. 14-day window). */
export const QA_COVERAGE_TARGET_REVIEWS_PER_AGENT = 4;

/** Pending batch/regrade reservations expire after this TTL. */
export const QA_PENDING_REVIEW_TTL_MS = 7 * 24 * 60 * 60 * 1000;
