/**
 * Task Weight System
 * Based on actual average handle times from production data (22,078 tasks)
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
// Task Type Default Weights (when disposition is missing)
// ============================================================================
const TASK_TYPE_DEFAULTS: Record<string, number> = {
  TEXT_CLUB: 2.60,           // Avg of all TEXT_CLUB dispositions
  WOD_IVCS: 2.14,            // Avg of all WOD_IVCS dispositions
  EMAIL_REQUESTS: 5.27,      // Avg of all EMAIL_REQUESTS dispositions
  YOTPO: 7.0,                // Initial estimate (will update after ~1 week of data)
  TRELLO: 5.0,               // Fixed estimate (no disposition data)
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
                      Object.keys(EMAIL_REQUESTS_WEIGHTS).length,
  totalTasksAnalyzed: 22078, // 11129 + 9963 + 986
  taskTypes: {
    TEXT_CLUB: { avgWeight: 2.60, dispositions: Object.keys(TEXT_CLUB_WEIGHTS).length, tasksAnalyzed: 11129 },
    WOD_IVCS: { avgWeight: 2.14, dispositions: Object.keys(WOD_IVCS_WEIGHTS).length, tasksAnalyzed: 9963 },
    EMAIL_REQUESTS: { avgWeight: 5.27, dispositions: Object.keys(EMAIL_REQUESTS_WEIGHTS).length, tasksAnalyzed: 986 },
    YOTPO: { avgWeight: 7.0, dispositions: 0, tasksAnalyzed: 0 }, // Initial estimate
    TRELLO: { avgWeight: 5.0, dispositions: 0, tasksAnalyzed: 0 },
  },
  highestWeight: 7.17, // EMAIL: Unable to Complete - Link/Sale Unavailable
  lowestWeight: 0.57,  // TEXT_CLUB: Spam - One word statement
};

