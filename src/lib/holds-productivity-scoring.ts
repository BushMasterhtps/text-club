/**
 * Holds productivity scoring (v1) — fixed disposition / outcome weights.
 *
 * v1 uses fixed weights only (no dynamic calibration). Final-resolution weights are
 * grounded in historical completed Holds warehouse/CSV aggregates (median / p90–aware
 * tiers, ~0.5 pt increments). Queue-handoff and duplicate weights are conservative
 * starters until enough TaskWorkSession data validates them.
 *
 * Future v2 may replace or augment these with DB-backed, manager-reviewed calibration.
 *
 * Consumers (sprint-rankings, performance-scorecard) should import from this module
 * so Holds scoring logic stays identical across routes.
 */

import { TaskType } from "@prisma/client";

/** First calendar day (UTC) for which TaskWorkSession-based Holds scoring is meaningful. Aligns with migration `20260509100000_add_task_work_session_table`. */
export const HOLDS_SESSION_SCORING_STARTS_AT = new Date(
  Date.UTC(2026, 4, 9, 0, 0, 0, 0)
);

export const HOLDS_OUTCOME_TYPES = [
  "FINAL_RESOLUTION",
  "QUEUE_HANDOFF",
  "DUPLICATE_ROUTING",
  "ESCALATION_STAY",
  "OTHER",
] as const;

export type HoldsOutcomeType = (typeof HOLDS_OUTCOME_TYPES)[number];

export function isHoldsOutcomeType(
  value: string | null | undefined
): value is HoldsOutcomeType {
  return (
    value !== undefined &&
    value !== null &&
    (HOLDS_OUTCOME_TYPES as readonly string[]).includes(value)
  );
}

/** Narrow input accepted by {@link getHoldsWorkSessionWeight} (Prisma row or plain object). */
export interface HoldsWorkSessionLike {
  disposition: string | null;
  outcomeType: string | null;
  isFinalResolution?: boolean | null;
}

export interface HoldsWeightIndexRow {
  taskType: typeof TaskType.HOLDS;
  disposition: string;
  outcomeType?: HoldsOutcomeType;
  weight: number;
  label: string;
  category: "final-resolution" | "queue-handoff" | "duplicate" | "fallback";
  note?: string;
}

const CANONICAL_RESOLVED_OTHER = "Resolved - Other";

const INTERNATIONAL_CANONICAL =
  "International Order - Unable to Call / Sent Email";

const INTERNATIONAL_ALIASES = [
  "International Order - Unable to Call/ Sent Email",
  "International Order - Unable to Call / Sent Email",
] as const;

/**
 * Trim and canonicalize Holds disposition strings for stable weight keys.
 * Returns null for null/blank input.
 */
export function normalizeHoldsDisposition(
  disposition: string | null | undefined
): string | null {
  if (disposition === null || disposition === undefined) return null;
  const t = disposition.trim();
  if (t === "") return null;

  if (t === "Resolved - other" || t === "Resolved - Other") {
    return CANONICAL_RESOLVED_OTHER;
  }

  if ((INTERNATIONAL_ALIASES as readonly string[]).includes(t)) {
    return INTERNATIONAL_CANONICAL;
  }

  return t;
}

const FINAL_RESOLUTION_WEIGHTS: Readonly<Record<string, number>> = {
  "Refunded & Closed": 3.5,
  "Refunded & Closed - Customer Requested Cancelation": 2.5,
  "Refunded & Closed - No Contact": 3.5,
  "Refunded & Closed - Comma Issue": 4.0,
  "Refunded & Closed - Out of Stock": 3.5,
  "Resolved - fixed format / fixed address": 4.0,
  "Resolved - Customer Clarified": 3.5,
  "Resolved - FRT Released": 4.0,
  [CANONICAL_RESOLVED_OTHER]: 3.5,
  "Closed & Refunded - Fraud/Reseller": 4.0,
};

/**
 * Fixed complexity weight (points) for one Holds TaskWorkSession–like row.
 *
 * - Null/blank disposition → 0
 * - Unknown non-null disposition → 3.5
 * - Unable to Resolve uses outcomeType: ESCALATION_STAY = 4.0, else 3.5
 */
export function getHoldsWorkSessionWeight(sessionLike: HoldsWorkSessionLike): number {
  const norm = normalizeHoldsDisposition(sessionLike.disposition);
  if (norm === null) return 0;

  const otRaw = sessionLike.outcomeType;
  const ot: HoldsOutcomeType | null = isHoldsOutcomeType(otRaw) ? otRaw : null;

  if (norm === "Unable to Resolve") {
    if (ot === "ESCALATION_STAY") return 4.0;
    return 3.5;
  }

  if (norm === "Duplicate") {
    return 1.5;
  }

  if (norm === "In Communication") {
    return 3.0;
  }

  if (norm === INTERNATIONAL_CANONICAL) {
    return 3.5;
  }

  const fixed = FINAL_RESOLUTION_WEIGHTS[norm];
  if (fixed !== undefined) return fixed;

  return 3.5;
}

/**
 * Rows for the Performance Scorecard “task weight index” (and similar UIs).
 * One row per explainable bucket; Unable to Resolve is split by outcome where needed.
 */
export function getHoldsWeightIndexRows(): HoldsWeightIndexRow[] {
  return [
    {
      taskType: TaskType.HOLDS,
      disposition: "Duplicate",
      outcomeType: "DUPLICATE_ROUTING",
      weight: 1.5,
      label: "Duplicate → Duplicates queue",
      category: "duplicate",
      note: "Conservative starter (not in historical completed export).",
    },
    {
      taskType: TaskType.HOLDS,
      disposition: "Unable to Resolve",
      outcomeType: "QUEUE_HANDOFF",
      weight: 3.5,
      label: "Unable to Resolve → Customer Contact",
      category: "queue-handoff",
      note: "Conservative starter until TaskWorkSession volume validates.",
    },
    {
      taskType: TaskType.HOLDS,
      disposition: "Unable to Resolve",
      outcomeType: "ESCALATION_STAY",
      weight: 4.0,
      label: "Unable to Resolve → stays Escalated",
      category: "queue-handoff",
      note: "Slight premium vs CC handoff; conservative starter.",
    },
    {
      taskType: TaskType.HOLDS,
      disposition: "In Communication",
      outcomeType: "QUEUE_HANDOFF",
      weight: 3.0,
      label: "In Communication → Customer Contact",
      category: "queue-handoff",
      note: "Conservative starter.",
    },
    {
      taskType: TaskType.HOLDS,
      disposition: INTERNATIONAL_CANONICAL,
      outcomeType: "QUEUE_HANDOFF",
      weight: 3.5,
      label: "International order → Customer Contact",
      category: "queue-handoff",
      note: "Canonical label; UI may show slash variant without extra space.",
    },
    ...(
      [
        ["Refunded & Closed", 3.5, "High"],
        [
          "Refunded & Closed - Customer Requested Cancelation",
          2.5,
          "Medium (smaller historical n)",
        ],
        ["Refunded & Closed - No Contact", 3.5, "High"],
        ["Refunded & Closed - Comma Issue", 4.0, "Low–medium (CSV slice sparse)"],
        ["Refunded & Closed - Out of Stock", 3.5, "Low (very small n in CSV)"],
        ["Resolved - fixed format / fixed address", 4.0, "High"],
        ["Resolved - Customer Clarified", 3.5, "High"],
        ["Resolved - FRT Released", 4.0, "Medium"],
        [CANONICAL_RESOLVED_OTHER, 3.5, "High"],
        [
          "Closed & Refunded - Fraud/Reseller",
          4.0,
          "Medium (median low, heavy tail — weight capped vs raw mean)",
        ],
      ] as const
    ).map(([disposition, weight, confidence]) => ({
      taskType: TaskType.HOLDS,
      disposition,
      outcomeType: "FINAL_RESOLUTION" as const,
      weight,
      label: disposition,
      category: "final-resolution" as const,
      note: `v1 fixed weight; CSV-backed confidence: ${confidence}.`,
    })),
    {
      taskType: TaskType.HOLDS,
      disposition: "(unknown)",
      weight: 3.5,
      label: "Unknown disposition",
      category: "fallback",
      note: "Any non-null disposition not in the v1 table; review logs periodically.",
    },
    {
      taskType: TaskType.HOLDS,
      disposition: "(null)",
      weight: 0,
      label: "Missing disposition",
      category: "fallback",
      note: "Treat as data defect; should not occur on normal agent completions.",
    },
  ];
}
