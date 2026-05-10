/**
 * Fields to clear when moving a task into a fresh PENDING work session for a new assignee.
 * Does not touch completedAt, completedBy, disposition, or holdsQueueHistory.
 *
 * Holds assign/unassign also avoids clearing endTime/durationSec here — those may still
 * reflect the last stage completion while status is PENDING (productivity is fragile).
 * See clearHoldsAssignmentSessionFields.
 */
export const clearFullPendingWorkSessionFields = {
  startTime: null,
  endTime: null,
  durationSec: null,
  assistanceRequestedAt: null,
  assistancePausedDurationSec: null,
  assistanceNotes: null,
  managerResponse: null,
} as const;

/** Holds: stale startTime + assistance snapshot only; preserve endTime/durationSec for stage credit. */
export const clearHoldsAssignmentSessionFields = {
  startTime: null,
  assistanceRequestedAt: null,
  assistancePausedDurationSec: null,
  assistanceNotes: null,
  managerResponse: null,
} as const;
