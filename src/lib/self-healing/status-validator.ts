import { RawStatus } from '@prisma/client';
import { isFeatureEnabled, log } from './config';

/**
 * Validates status transitions to prevent invalid state changes
 * This is the validation layer that prevents bugs from causing data corruption
 * 
 * Safety: If validation is disabled, always returns valid (backward compatible)
 */
export const ALLOWED_TRANSITIONS: Record<RawStatus, RawStatus[]> = {
  READY: [RawStatus.SPAM_REVIEW, RawStatus.PROMOTED],
  PROMOTED: [], // Terminal state - cannot transition from PROMOTED
  SPAM_REVIEW: [RawStatus.READY, RawStatus.SPAM_ARCHIVED],
  SPAM_ARCHIVED: [], // Terminal state
};

export function canTransition(from: RawStatus, to: RawStatus): boolean {
  // If validation disabled, allow all transitions (backward compatible)
  if (!isFeatureEnabled('statusValidation')) {
    return true;
  }

  const allowed = ALLOWED_TRANSITIONS[from] || [];
  return allowed.includes(to);
}

export function validateStatusTransition(
  currentStatus: RawStatus,
  newStatus: RawStatus,
  context?: string
): { valid: boolean; error?: string } {
  // If validation disabled, always valid (backward compatible)
  if (!isFeatureEnabled('statusValidation')) {
    return { valid: true };
  }

  if (currentStatus === newStatus) {
    return { valid: true }; // No change is always valid
  }

  if (!canTransition(currentStatus, newStatus)) {
    const error = `Invalid status transition: ${currentStatus} → ${newStatus}${context ? ` (${context})` : ''}`;
    log('error', error);
    return {
      valid: false,
      error,
    };
  }

  return { valid: true };
}

