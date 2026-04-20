import type { QAReviewLineResponse } from "@prisma/client";

export type LineForScoring = {
  id: string;
  weight: { toNumber(): number };
  isCritical: boolean;
  allowNa: boolean;
};

export type LineResponseInput = {
  lineId: string;
  response: QAReviewLineResponse;
};

/**
 * Deduction model: start at 100, subtract line weight on FAIL; PASS and NA deduct 0.
 * cap = max(50, 100 - failedCriticalCount * 10); finalScore = min(weightedScore, cap).
 */
export function computeQualityReviewScores(
  lines: LineForScoring[],
  responsesByLineId: Map<string, QAReviewLineResponse>
): {
  weightedScore: number;
  failedCriticalCount: number;
  scoreCap: number;
  finalScore: number;
} {
  let deduction = 0;
  let failedCriticalCount = 0;

  for (const line of lines) {
    const r = responsesByLineId.get(line.id);
    if (!r) {
      throw new Error(`MISSING_RESPONSE_FOR_LINE:${line.id}`);
    }
    if (r === "FAIL") {
      deduction += line.weight.toNumber();
      if (line.isCritical) failedCriticalCount += 1;
    }
    if (r === "NA" && !line.allowNa) {
      throw new Error(`NA_NOT_ALLOWED:${line.id}`);
    }
  }

  const weightedScore = Math.max(0, Math.min(100, 100 - deduction));
  const scoreCap = Math.max(50, 100 - failedCriticalCount * 10);
  const finalScore = Math.min(weightedScore, scoreCap);

  return {
    weightedScore,
    failedCriticalCount,
    scoreCap,
    finalScore,
  };
}
