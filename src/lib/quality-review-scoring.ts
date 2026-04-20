import type { QAReviewLineResponse } from "@prisma/client";

export type LineForScoring = {
  id: string;
  weight: { toNumber(): number };
  isCritical: boolean;
  allowNa: boolean;
};

export type QualityReviewScoreBreakdown = {
  /** Sum of line weights where response is PASS or FAIL (NA excluded). */
  possibleWeight: number;
  /** Sum of line weights where response is PASS. */
  earnedWeight: number;
  /** (earnedWeight / possibleWeight) * 100 when possibleWeight > 0. */
  weightedPercent: number;
  failedCriticalCount: number;
  /** null when no critical FAILs (no cap applied). */
  scoreCap: number | null;
  /** Stored "weighted" display field: same as weightedPercent for v1.1. */
  weightedScore: number;
  finalScore: number;
};

function criticalFailCap(failedCriticalCount: number): number | null {
  if (failedCriticalCount <= 0) return null;
  if (failedCriticalCount === 1) return 70;
  if (failedCriticalCount === 2) return 50;
  return 30;
}

/**
 * Weighted percentage: possible = sum(weights) for non-NA lines; earned = sum(weights) for PASS.
 * weightedPercent = (earned / possible) * 100.
 * Critical FAIL caps: 0 → no cap; 1 → 70; 2 → 50; 3+ → 30. final = min(percent, cap) when cap applies.
 */
export function computeQualityReviewScores(
  lines: LineForScoring[],
  responsesByLineId: Map<string, QAReviewLineResponse>
): QualityReviewScoreBreakdown {
  let possibleWeight = 0;
  let earnedWeight = 0;
  let failedCriticalCount = 0;

  for (const line of lines) {
    const r = responsesByLineId.get(line.id);
    if (!r) {
      throw new Error(`MISSING_RESPONSE_FOR_LINE:${line.id}`);
    }
    if (r === "NA" && !line.allowNa) {
      throw new Error(`NA_NOT_ALLOWED:${line.id}`);
    }

    const w = line.weight.toNumber();

    if (r === "NA") {
      continue;
    }

    possibleWeight += w;
    if (r === "PASS") {
      earnedWeight += w;
    } else if (r === "FAIL") {
      if (line.isCritical) {
        failedCriticalCount += 1;
      }
    }
  }

  if (possibleWeight <= 0) {
    throw new Error("NO_APPLICABLE_LINES:All lines are N/A or no scorable weight; cannot submit.");
  }

  const weightedPercent = (earnedWeight / possibleWeight) * 100;
  const cap = criticalFailCap(failedCriticalCount);
  const finalScore = cap == null ? weightedPercent : Math.min(weightedPercent, cap);

  return {
    possibleWeight,
    earnedWeight,
    weightedPercent,
    failedCriticalCount,
    scoreCap: cap,
    weightedScore: weightedPercent,
    finalScore,
  };
}
