"use client";

import React from "react";
import type { QAReviewLineResponse } from "@prisma/client";
import {
  computeQualityReviewScores,
  type QualityReviewScoreBreakdown,
} from "@/lib/quality-review-scoring";

export type QaScoreLineInput = {
  id: string;
  weight: unknown;
  isCritical: boolean;
  allowNa: boolean;
};

export type LiveScorePreviewResult =
  | { kind: "breakdown"; breakdown: QualityReviewScoreBreakdown }
  | { kind: "error"; code: "missing_line" | "no_applicable" | "na_not_allowed" | "other" };

export function computeLiveScorePreviewResult(
  lines: QaScoreLineInput[],
  responses: Record<string, QAReviewLineResponse>
): LiveScorePreviewResult | null {
  if (!lines.length) return null;
  const map = new Map<string, QAReviewLineResponse>();
  for (const line of lines) {
    const r = responses[line.id];
    if (!r) return { kind: "error", code: "missing_line" };
    map.set(line.id, r);
  }
  const linesForScore = lines.map((l) => ({
    id: l.id,
    weight: { toNumber: () => Number(l.weight) },
    isCritical: l.isCritical,
    allowNa: l.allowNa,
  }));
  try {
    return { kind: "breakdown", breakdown: computeQualityReviewScores(linesForScore, map) };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.startsWith("NO_APPLICABLE_LINES")) return { kind: "error", code: "no_applicable" };
    if (msg.startsWith("NA_NOT_ALLOWED")) return { kind: "error", code: "na_not_allowed" };
    return { kind: "error", code: "other" };
  }
}

export function QaLiveScorePreviewBody({ result }: { result: LiveScorePreviewResult | null }) {
  if (!result) {
    return <p className="text-xs text-white/45">Load checklist lines to see the estimate.</p>;
  }
  if (result.kind === "breakdown") {
    const b = result.breakdown;
    return (
      <dl className="space-y-2.5 text-sm">
        <div className="flex justify-between gap-2">
          <dt className="text-white/45">Earned weight</dt>
          <dd className="font-mono text-white tabular-nums">{b.earnedWeight.toFixed(2)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-white/45">Possible weight</dt>
          <dd className="font-mono text-white tabular-nums">{b.possibleWeight.toFixed(2)}</dd>
        </div>
        <div className="flex justify-between gap-2 border-t border-white/10 pt-2">
          <dt className="text-white/45">Weighted %</dt>
          <dd className="font-semibold text-violet-200 tabular-nums">{b.weightedPercent.toFixed(1)}%</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-white/45">Weighted score</dt>
          <dd className="font-mono text-white/85 tabular-nums">{b.weightedScore.toFixed(1)}%</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-white/45">Critical fails</dt>
          <dd className="tabular-nums text-white">{b.failedCriticalCount}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-white/45">Score cap</dt>
          <dd className="tabular-nums text-white">{b.scoreCap != null ? `${b.scoreCap}%` : "—"}</dd>
        </div>
        <div className="flex justify-between gap-2 border-t border-white/10 pt-3">
          <dt className="text-white/60 font-medium">Projected final</dt>
          <dd className="text-lg font-bold text-emerald-300 tabular-nums">{b.finalScore.toFixed(1)}%</dd>
        </div>
      </dl>
    );
  }
  return (
    <div className="text-xs text-amber-200/85 leading-relaxed space-y-2">
      <p className="font-medium text-white/70">Preview unavailable</p>
      {result.code === "no_applicable" ? (
        <p>
          No scorable lines (all N/A or zero weight). Submit will be blocked until at least one line
          counts toward the score.
        </p>
      ) : result.code === "na_not_allowed" ? (
        <p>N/A is not allowed on one or more lines you marked N/A.</p>
      ) : result.code === "missing_line" ? (
        <p>Select a response on every line to preview.</p>
      ) : (
        <p>Adjust responses to see a live estimate.</p>
      )}
    </div>
  );
}

export const QA_LIVE_SCORE_DISCLAIMER = (
  <p className="text-[10px] leading-snug text-white/38 mt-3 pt-2 border-t border-white/10">
    Live preview only — submit confirms the official score.
  </p>
);
