/**
 * Task Weight System
 * Based on actual average handle times from production data (22,676 tasks)
 * Weight = Average Handle Time in Minutes (1 min = 1.0 point)
 * 
 * Data Source: Production Railway Database Query (Nov 2025)
 */

export interface DispositionWeight {
  disposition: string;
  taskType: string;
  weight: number;
  avgMinutes: number;
  taskCount: number;
}

// ============================================================================
// TEXT_CLUB Disposition Weights (11,129 tasks analyzed)
// ============================================================================
const TEXT_CLUB_WEIGHTS: Record<string, number> = {
  "Answered in SF": 6.95,
  "Answered in Attentive": 4.01,
  "Spam - Negative Feedback": 1.34,
  "Previously Assisted": 1.31,
  "Spam - Positive Feedback": 1.21,
  "Spam - Reaction Message": 1.06,
  "No Response Required (leadership advised)": 1.03,
  "Spam - Off topic": 0.78,
  "Spam - Gibberish": 0.76,
  "Spam - One word statement": 0.57,
};

// ============================================================================
// WOD/IVCS Disposition Weights (9,963 tasks analyzed)
// ============================================================================
const WOD_IVCS_WEIGHTS: Record<string, number> = {
  "Completed - Added PayPal Payment info": 4.47,
  "Completed - Fixed Amounts - Unable to fix amounts (everything is matching)": 4.36,
  "Completed - Fixed Amounts - Completed SO only - CS line location error": 2.80,
  "Completed - Completed SO only - CS line location error": 2.68,
  "Reviewed / Unable to Complete - Unable to Edit Cash Sale": 2.49,
  "Unable to Complete - Not Completed - Locked (CS was able to be edited)": 2.36,
  "Reviewed / Unable to Complete - Invalid Cash Sale / Not Able to Fix": 2.35,
  "Completed - Fixed Amounts": 2.26,
  "Unable to Complete - Not Completed - Meta": 1.53,
  "Completed - Unable to fix amounts (everything is matching)": 1.52,
  "Unable to Complete - Not Completed - Canada Lock": 1.46,
  "Completed - Cannot edit CS": 1.13,
  "Reviewed / Unable to Complete - Canadian Order / Unable to Edit Sales Order": 1.08,
  "Reviewed / Unable to Complete - Unable to Edit Sales Order": 0.71,
};

// ============================================================================
// EMAIL_REQUESTS Disposition Weights (986 tasks analyzed)
// ============================================================================
const EMAIL_REQUESTS_WEIGHTS: Record<string, number> = {
  "Unable to Complete - Link/Sale Unavailable": 7.17,
  "Completed": 6.31,
  "Unable to Complete - No Specification on Requests": 5.53,
  "Unable to Complete - Unfeasable request / Information not available": 2.45,
  "Unable to Complete - Incomplete or Missing Info": 2.29,
  "Unable to Complete - Duplicate Request": 2.08,
  "Unable to Complete - Requesting info on ALL Products": 1.81,
};

// ============================================================================
// YOTPO Disposition Weights (598 tasks analyzed)
// ============================================================================
const YOTPO_WEIGHTS: Record<string, number> = {
  "Information – Unfeasible request or information not available": 23.20,
  "Information – Tracking or delivery status provided": 12.39,
  "Return Authorization – Created and sent to customer": 8.45,
  "Refund – Return to sender (RTS)": 8.53,
  "Refund – Partial refund issued": 8.21,
  "Reship – Damaged or quality issue": 8.20,
  "AER – None Serious AER - RA Issued": 7.78,
  "Refund – Full refund issued": 7.62,
  "Unsubscribed – Customer removed from communications": 7.42,
  "Subscription – Cancelled": 7.37,
  "Information – Product usage or transition tips sent": 7.31,
  "Subscription – Updated (next charge date, frequency, etc.)": 7.29,
  "Information – Product Information sent": 7.13,
  "Reship – Item or order not received": 6.77,
  "Information – Billing Inquiry": 6.67,
  "Subscription – Cancelled due to PayPal limitations": 6.68,
  "Escalation – Sent Negative Feedback Macro": 5.46,
  "Duplicate Request – No new action required": 5.24,
  "Information – Medical or veterinary guidance provided": 4.84,
  "Refund – Refund issued with condolences (pet passing or sensitive case)": 4.72,
  "Passed MBG": 3.85,
  "Delivered – Order delivered after review, no further action required": 3.14,
  "Previously Assisted – Issue already resolved or refund previously issued": 2.18,
  "No Match – No valid account or order located": 0.68,
  "AER – Serious AER - Refund Issued": 0.23,
};

// ============================================================================
// Task Type Default Weights (when disposition is missing)
// ============================================================================
const TASK_TYPE_DEFAULTS: Record<string, number> = {
  TEXT_CLUB: 2.60,           // Avg of all TEXT_CLUB dispositions
  WOD_IVCS: 2.14,            // Avg of all WOD_IVCS dispositions
  EMAIL_REQUESTS: 5.27,      // Avg of all EMAIL_REQUESTS dispositions
  YOTPO: 6.22,               // Weighted avg of all YOTPO dispositions (598 tasks)
  TRELLO: 3.0,               // Fixed weight (no disposition/time tracking)
  HOLDS: 4.0,                // Estimate (moderate complexity)
  STANDALONE_REFUNDS: 3.0,   // Estimate
};

// ============================================================================
// Main Weight Calculation Function
// ============================================================================

export function getTaskWeight(taskType: string, disposition?: string | null): number {
  // If no disposition, use task type default
  if (!disposition) {
    return TASK_TYPE_DEFAULTS[taskType] || 1.0;
  }

  // Look up disposition-specific weight
  let weight: number | undefined;

  switch (taskType) {
    case "TEXT_CLUB":
      weight = TEXT_CLUB_WEIGHTS[disposition];
      break;
    case "WOD_IVCS":
      weight = WOD_IVCS_WEIGHTS[disposition];
      break;
    case "EMAIL_REQUESTS":
      weight = EMAIL_REQUESTS_WEIGHTS[disposition];
      break;
    case "YOTPO":
      weight = YOTPO_WEIGHTS[disposition];
      break;
    case "TRELLO":
      return TASK_TYPE_DEFAULTS.TRELLO;
    default:
      weight = undefined;
  }

  // If disposition not found, use task type default
  return weight !== undefined ? weight : (TASK_TYPE_DEFAULTS[taskType] || 1.0);
}

// ============================================================================
// Get All Weights (for Weight Index/Legend)
// ============================================================================

export function getAllWeights(): DispositionWeight[] {
  const weights: DispositionWeight[] = [];

  // TEXT_CLUB
  Object.entries(TEXT_CLUB_WEIGHTS).forEach(([disposition, weight]) => {
    weights.push({
      disposition,
      taskType: "TEXT_CLUB",
      weight,
      avgMinutes: weight,
      taskCount: 0 // This would need to be pulled from DB for exact counts
    });
  });

  // WOD_IVCS
  Object.entries(WOD_IVCS_WEIGHTS).forEach(([disposition, weight]) => {
    weights.push({
      disposition,
      taskType: "WOD_IVCS",
      weight,
      avgMinutes: weight,
      taskCount: 0
    });
  });

  // EMAIL_REQUESTS
  Object.entries(EMAIL_REQUESTS_WEIGHTS).forEach(([disposition, weight]) => {
    weights.push({
      disposition,
      taskType: "EMAIL_REQUESTS",
      weight,
      avgMinutes: weight,
      taskCount: 0
    });
  });

  // YOTPO
  Object.entries(YOTPO_WEIGHTS).forEach(([disposition, weight]) => {
    weights.push({
      disposition,
      taskType: "YOTPO",
      weight,
      avgMinutes: weight,
      taskCount: 0
    });
  });

  // Sort by weight descending
  return weights.sort((a, b) => b.weight - a.weight);
}

// ============================================================================
// Get Weights by Task Type (for UI display)
// ============================================================================

export function getWeightsByTaskType(taskType: string): Array<{ disposition: string; weight: number }> {
  let weights: Record<string, number>;

  switch (taskType) {
    case "TEXT_CLUB":
      weights = TEXT_CLUB_WEIGHTS;
      break;
    case "WOD_IVCS":
      weights = WOD_IVCS_WEIGHTS;
      break;
    case "EMAIL_REQUESTS":
      weights = EMAIL_REQUESTS_WEIGHTS;
      break;
    case "YOTPO":
      weights = YOTPO_WEIGHTS;
      break;
    default:
      return [];
  }

  return Object.entries(weights)
    .map(([disposition, weight]) => ({ disposition, weight }))
    .sort((a, b) => b.weight - a.weight);
}

// ============================================================================
// Summary Stats
// ============================================================================

export const WEIGHT_SUMMARY = {
  totalDispositions: Object.keys(TEXT_CLUB_WEIGHTS).length + 
                      Object.keys(WOD_IVCS_WEIGHTS).length + 
                      Object.keys(EMAIL_REQUESTS_WEIGHTS).length +
                      Object.keys(YOTPO_WEIGHTS).length,
  totalTasksAnalyzed: 22676, // 11129 + 9963 + 986 + 598
  taskTypes: {
    TEXT_CLUB: { avgWeight: 2.60, dispositions: Object.keys(TEXT_CLUB_WEIGHTS).length, tasksAnalyzed: 11129 },
    WOD_IVCS: { avgWeight: 2.14, dispositions: Object.keys(WOD_IVCS_WEIGHTS).length, tasksAnalyzed: 9963 },
    EMAIL_REQUESTS: { avgWeight: 5.27, dispositions: Object.keys(EMAIL_REQUESTS_WEIGHTS).length, tasksAnalyzed: 986 },
    YOTPO: { avgWeight: 6.22, dispositions: Object.keys(YOTPO_WEIGHTS).length, tasksAnalyzed: 598 },
    TRELLO: { avgWeight: 3.0, dispositions: 0, tasksAnalyzed: 0 }, // Fixed weight (no tracking)
  },
  highestWeight: 23.20, // YOTPO: Information – Unfeasible request or information not available
  lowestWeight: 0.23,  // YOTPO: AER – Serious AER - Refund Issued
};

