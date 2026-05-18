/**
 * Shared routing-rule path matching for agent workflow (wildcards + specificity).
 *
 * Manager "Any" on Cash Sale Exists / Merchant is stored as null option IDs.
 * Null/blank rule dimensions are wildcards and match any agent answer for that field.
 */

import type { WorkflowAnswers } from "./workflow-engine";

export type RoutingRulePathRef = {
  id?: string;
  displayOrder: number;
  isActive?: boolean;
  metadataJson?: unknown;
  rootCauseOptionId?: string | null;
  fixTypeOptionId?: string | null;
  cashSaleExistsOptionId?: string | null;
  merchantOptionId?: string | null;
  rootCauseOption?: { value: string; label?: string } | null;
  cashSaleExistsOption?: { value: string; label?: string } | null;
  merchantOption?: { value: string; label?: string } | null;
  fixTypeOption?: { value: string; label?: string } | null;
};

function normalizeAnswerValue(value: unknown): string | string[] | null {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

function isEmptyAnswer(value: string | string[] | null): boolean {
  if (value === null) return true;
  if (Array.isArray(value)) return value.length === 0;
  return value.trim() === "";
}

/** Catch-all rows have no root cause and no fix type (metadata or IDs). */
export function isCatchAllRoutingRule(rule: RoutingRulePathRef): boolean {
  const meta =
    rule.metadataJson && typeof rule.metadataJson === "object"
      ? (rule.metadataJson as Record<string, unknown>)
      : {};
  if (meta.isCatchAll === true) return true;

  const hasRoot =
    Boolean(rule.rootCauseOptionId) || Boolean(rule.rootCauseOption?.value?.trim());
  const hasFix = Boolean(rule.fixTypeOptionId) || Boolean(rule.fixTypeOption?.value?.trim());
  return !hasRoot && !hasFix;
}

/** Higher = more specific (fewer wildcards). Root cause weighted highest, then fix type. */
export function routingRulePathSpecificityScore(rule: RoutingRulePathRef): number {
  let score = 0;
  if (rule.rootCauseOption?.value) score += 8;
  if (rule.fixTypeOption?.value) score += 4;
  if (rule.cashSaleExistsOption?.value) score += 2;
  if (rule.merchantOption?.value) score += 1;
  return score;
}

/**
 * True when agent answers satisfy the rule path.
 * Unset rule dimensions (manager "Any") are wildcards.
 */
export function ruleMatchesAgentCorePath(
  rule: RoutingRulePathRef,
  answers: WorkflowAnswers | Record<string, unknown>
): boolean {
  if (isCatchAllRoutingRule(rule)) return false;
  if (!rule.rootCauseOption?.value || !rule.fixTypeOption?.value) return false;

  const dimensions: Array<[string, string]> = [
    ["root_cause", rule.rootCauseOption.value],
    ["cash_sale_exists", rule.cashSaleExistsOption?.value ?? ""],
    ["merchant", rule.merchantOption?.value ?? ""],
    ["fix_type", rule.fixTypeOption.value],
  ];

  for (const [slug, expected] of dimensions) {
    if (!expected) continue;
    const actual = normalizeAnswerValue(answers[slug]);
    if (isEmptyAnswer(actual)) return false;
    const actualList = Array.isArray(actual) ? actual : [actual];
    if (!actualList.includes(expected)) return false;
  }

  return true;
}

/**
 * Partial path match for fix-type filtering (root/cash/merchant only; fix type optional).
 */
export function rulePartiallyMatchesAgentCorePath(
  rule: RoutingRulePathRef,
  answers: WorkflowAnswers | Record<string, unknown>
): boolean {
  if (isCatchAllRoutingRule(rule)) return false;
  if (!rule.rootCauseOption?.value) return false;

  const dimensions: Array<[string, string | undefined]> = [
    ["root_cause", rule.rootCauseOption.value],
    ["cash_sale_exists", rule.cashSaleExistsOption?.value],
    ["merchant", rule.merchantOption?.value],
  ];

  for (const [slug, expected] of dimensions) {
    if (!expected) continue;
    const actual = normalizeAnswerValue(answers[slug]);
    if (isEmptyAnswer(actual)) return false;
    const actualList = Array.isArray(actual) ? actual : [actual];
    if (!actualList.includes(expected)) return false;
  }

  return true;
}

/**
 * Pick the best matching active rule:
 * 1. Among matches, highest specificity (most constrained path).
 * 2. Tie-break: lower displayOrder (earlier in matrix).
 * 3. If none match, fall back to catch-all.
 */
export function findBestMatchingRoutingRule<T extends RoutingRulePathRef>(
  rules: T[],
  answers: WorkflowAnswers | Record<string, unknown>
): T | null {
  const active = rules
    .filter((r) => r.isActive !== false)
    .sort((a, b) => a.displayOrder - b.displayOrder);

  const matching = active.filter((r) => ruleMatchesAgentCorePath(r, answers));
  if (matching.length === 0) {
    return active.find((r) => isCatchAllRoutingRule(r)) ?? null;
  }

  return matching.reduce((best, candidate) => {
    const scoreCandidate = routingRulePathSpecificityScore(candidate);
    const scoreBest = routingRulePathSpecificityScore(best);
    if (scoreCandidate !== scoreBest) {
      return scoreCandidate > scoreBest ? candidate : best;
    }
    return candidate.displayOrder < best.displayOrder ? candidate : best;
  });
}
