/**
 * Holds Disposition Impact Configuration
 * 
 * This file maps each Holds disposition to its financial impact:
 * - "saved": Disposition saved the company money (positive impact)
 * - "lost": Disposition lost the company money (negative impact - full order amount)
 * - "neutral": Disposition has no financial impact (e.g., administrative, moved to another queue)
 * 
 * TODO: Fill in the impact for each disposition below based on business logic.
 * 
 * Dispositions are organized by the queue they appear in or the action they trigger.
 */

export type DispositionImpact = "saved" | "lost" | "neutral";

export interface DispositionConfig {
  disposition: string;
  impact: DispositionImpact;
  description?: string; // Optional: brief description of why this impact
}

/**
 * All Holds Dispositions by Category
 * 
 * Based on code analysis from:
 * - src/app/api/agent/tasks/[id]/complete/route.ts
 * - Actual database usage
 */

// ============================================================================
// COMPLETION DISPOSITIONS (Move task to "Completed" queue - Fully Resolved)
// ============================================================================
// These dispositions mark the task as fully completed and move it to "Completed" queue
// They typically represent successful resolutions

const COMPLETION_DISPOSITIONS: DispositionConfig[] = [
  // NEGATIVE (Lost Money) - Full order amount is lost
  {
    disposition: "Refunded & Closed",
    impact: "lost",
    description: "Task completed - refund issued and order closed (lost money)"
  },
  {
    disposition: "Refunded & Closed - Customer Requested Cancelation",
    impact: "lost",
    description: "Task completed - customer requested cancellation, refund issued (lost money)"
  },
  {
    disposition: "Refunded & Closed - No Contact",
    impact: "lost",
    description: "Task completed - no contact made, refund issued (lost money)"
  },
  {
    disposition: "Refunded & Closed - Comma Issue",
    impact: "lost",
    description: "Task completed - comma issue resolved, refund issued (lost money)"
  },
  // POSITIVE (Saved Money) - Order proceeds, revenue maintained
  {
    disposition: "Resolved - fixed format / fixed address",
    impact: "saved",
    description: "Task completed - address/format fixed, order can proceed (saved money)"
  },
  {
    disposition: "Resolved - Customer Clarified",
    impact: "saved",
    description: "Task completed - customer provided clarification, order can proceed (saved money)"
  },
  {
    disposition: "Resolved - FRT Released",
    impact: "saved",
    description: "Task completed - FRT (Fraud Review Team) released order (saved money)"
  },
  {
    disposition: "Resolved - other",
    impact: "saved",
    description: "Task completed - resolved through other means (saved money)"
  },
  {
    disposition: "Resolved - Other",
    impact: "saved",
    description: "Task completed - resolved through other means (capitalized variant) (saved money)"
  },
  // NEUTRAL (No Financial Impact)
  {
    disposition: "Closed & Refunded - Fraud/Reseller",
    impact: "neutral",
    description: "Task completed - fraud/reseller detected, order closed and refunded (no financial impact)"
  }
];

// ============================================================================
// QUEUE MOVEMENT DISPOSITIONS (Move task to another queue - Not Fully Resolved)
// ============================================================================
// These dispositions move the task to another queue but still count as "completed" for the agent
// They represent work done but task not fully resolved yet

// QUEUE MOVEMENT DISPOSITIONS (Not fully resolved - No financial impact)
// These dispositions move the task to another queue but still count as "completed" for the agent
// They represent work done but task not fully resolved yet - no financial impact until final completion
const QUEUE_MOVEMENT_DISPOSITIONS: DispositionConfig[] = [
  {
    disposition: "Duplicate",
    impact: "neutral",
    description: "Moves to Duplicates queue - task is a duplicate of existing work (no financial impact - not fully resolved)"
  },
  {
    disposition: "Unable to Resolve",
    impact: "neutral",
    description: "Moves to Customer Contact or Escalated Call queue - needs further work (no financial impact - not fully resolved)"
  },
  {
    disposition: "In Communication",
    impact: "neutral",
    description: "Moves back to Customer Contact queue - agent is in communication with customer (no financial impact - not fully resolved)"
  },
  {
    disposition: "International Order - Unable to Call/ Sent Email",
    impact: "neutral",
    description: "Moves to Customer Contact queue - international order, email sent instead of call (no financial impact - not fully resolved)"
  },
  {
    disposition: "International Order - Unable to Call / Sent Email",
    impact: "neutral",
    description: "Moves to Customer Contact queue - international order, email sent (variant with space) (no financial impact - not fully resolved)"
  }
];

// ============================================================================
// ALL DISPOSITIONS (Combined List)
// ============================================================================

export const ALL_HOLDS_DISPOSITIONS: DispositionConfig[] = [
  ...COMPLETION_DISPOSITIONS,
  ...QUEUE_MOVEMENT_DISPOSITIONS
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get the financial impact of a disposition
 * @param disposition The disposition string
 * @returns "saved", "lost", or "neutral"
 */
export function getDispositionImpact(disposition: string | null): DispositionImpact {
  if (!disposition) return "neutral";
  
  const config = ALL_HOLDS_DISPOSITIONS.find(
    d => d.disposition.toLowerCase() === disposition.toLowerCase()
  );
  
  return config?.impact || "neutral";
}

/**
 * Check if a disposition moves the task to "Completed" queue
 * @param disposition The disposition string
 * @returns true if disposition moves task to Completed queue
 */
export function isCompletionDisposition(disposition: string | null): boolean {
  if (!disposition) return false;
  
  return COMPLETION_DISPOSITIONS.some(
    d => d.disposition.toLowerCase() === disposition.toLowerCase()
  ) || disposition === "Closed & Refunded - Fraud/Reseller";
}

/**
 * Calculate financial impact for a task
 * @param disposition The disposition string
 * @param orderAmount The order amount (from holdsOrderAmount)
 * @returns Object with savedAmount, lostAmount, and netAmount
 */
export function calculateFinancialImpact(
  disposition: string | null,
  orderAmount: number | null
): {
  savedAmount: number;
  lostAmount: number;
  netAmount: number;
} {
  const amount = orderAmount || 0;
  const impact = getDispositionImpact(disposition);
  
  switch (impact) {
    case "saved":
      return {
        savedAmount: amount,
        lostAmount: 0,
        netAmount: amount
      };
    case "lost":
      return {
        savedAmount: 0,
        lostAmount: amount,
        netAmount: -amount
      };
    case "neutral":
    default:
      return {
        savedAmount: 0,
        lostAmount: 0,
        netAmount: 0
      };
  }
}

