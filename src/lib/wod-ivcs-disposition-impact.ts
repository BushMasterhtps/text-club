/**
 * WOD/IVCS Disposition Financial Impact Configuration
 * 
 * This file defines the financial impact (saved, lost, neutral) for each WOD/IVCS disposition.
 * 
 * Impact Categories:
 * - "saved": Order was successfully fixed/completed, money saved
 * - "lost": Unable to complete or high risk of shipping errors/refunds, negative customer experience impact
 * - "neutral": No financial impact
 * 
 * Note: "Lost" dispositions don't necessarily mean direct financial loss, but indicate orders with
 * higher risk of not shipping or erroring out if a refund is requested, negatively impacting customer experience.
 */

export type DispositionImpact = "saved" | "lost" | "neutral";

export interface DispositionConfig {
  disposition: string;
  impact: DispositionImpact;
  description?: string;
}

/**
 * Dispositions that indicate successful order completion/fix (saved money)
 */
const SAVED_DISPOSITIONS: DispositionConfig[] = [
  {
    disposition: "Completed - Fixed Amounts",
    impact: "saved",
    description: "Order amounts were successfully fixed"
  },
  {
    disposition: "Completed - Added PayPal Payment info",
    impact: "saved",
    description: "PayPal payment information was successfully added"
  }
];

/**
 * Dispositions that indicate inability to complete or high risk (lost money/negative impact)
 */
const LOST_DISPOSITIONS: DispositionConfig[] = [
  {
    disposition: "Completed - Cannot edit CS",
    impact: "lost",
    description: "Unable to edit Cash Sale, high risk of shipping errors"
  },
  {
    disposition: "Reviewed / Unable to Complete - Canadian Order / Unable to Edit Sales Order",
    impact: "lost",
    description: "Canadian order could not be edited, unable to complete"
  },
  {
    disposition: "Reviewed / Unable to Complete - Unable to Edit Cash Sale",
    impact: "lost",
    description: "Cash Sale could not be edited, unable to complete"
  },
  {
    disposition: "Reviewed / Unable to Complete - Invalid Cash Sale / Not Able to Fix",
    impact: "lost",
    description: "Invalid Cash Sale that could not be fixed"
  },
  {
    disposition: "Reviewed / Unable to Complete - Unable to Edit Sales Order",
    impact: "lost",
    description: "Sales Order could not be edited, unable to complete"
  },
  {
    disposition: "Completed - Fixed Amounts - Completed SO only - CS line location error",
    impact: "lost",
    description: "Only Sales Order completed due to Cash Sale line location error"
  },
  {
    disposition: "Completed - Completed SO only - CS line location error",
    impact: "lost",
    description: "Only Sales Order completed due to Cash Sale line location error"
  },
  {
    disposition: "Completed - Fixed Amounts - Unable to fix amounts (everything is matching)",
    impact: "lost",
    description: "Amounts appear matching but couldn't be fixed, potential discrepancy"
  },
  {
    disposition: "Unable to Complete - Not Completed - Meta",
    impact: "lost",
    description: "Meta-related order could not be completed"
  }
];

/**
 * Dispositions with no financial impact (neutral)
 */
const NEUTRAL_DISPOSITIONS: DispositionConfig[] = [
  {
    disposition: "Unable to Complete - Not Completed - Locked (CS was able to be edited)",
    impact: "neutral",
    description: "Order locked but Cash Sale was editable, no financial impact"
  },
  {
    disposition: "Completed - Unable to fix amounts (everything is matching)",
    impact: "neutral",
    description: "Amounts already matching, no fix needed"
  },
  {
    disposition: "Unable to Complete - Not Completed - Canada Lock",
    impact: "neutral",
    description: "Canadian order locked, no financial impact"
  }
];

/**
 * All WOD/IVCS dispositions with their financial impact classification
 */
export const ALL_WOD_IVCS_DISPOSITIONS: DispositionConfig[] = [
  ...SAVED_DISPOSITIONS,
  ...LOST_DISPOSITIONS,
  ...NEUTRAL_DISPOSITIONS
];

/**
 * Get the financial impact for a given disposition
 * @param disposition The disposition string to look up
 * @returns The impact type (saved, lost, or neutral)
 */
export function getDispositionImpact(disposition: string | null): DispositionImpact {
  if (!disposition) return "neutral";
  
  const config = ALL_WOD_IVCS_DISPOSITIONS.find(
    d => d.disposition.toLowerCase() === disposition.toLowerCase()
  );
  
  return config?.impact || "neutral";
}

/**
 * Check if a disposition indicates a completed/saved order
 * @param disposition The disposition string to check
 * @returns True if the disposition indicates money saved
 */
export function isSavedDisposition(disposition: string | null): boolean {
  return getDispositionImpact(disposition) === "saved";
}

/**
 * Check if a disposition indicates a lost/unable to complete order
 * @param disposition The disposition string to check
 * @returns True if the disposition indicates money lost
 */
export function isLostDisposition(disposition: string | null): boolean {
  return getDispositionImpact(disposition) === "lost";
}

/**
 * Calculate financial impact for a task based on its disposition and order amount
 * @param disposition The task's disposition
 * @param orderAmount The order amount (from the "amount" field)
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

/**
 * Get all dispositions by impact type
 * @param impact The impact type to filter by
 * @returns Array of disposition configurations matching the impact type
 */
export function getDispositionsByImpact(impact: DispositionImpact): DispositionConfig[] {
  return ALL_WOD_IVCS_DISPOSITIONS.filter(d => d.impact === impact);
}

