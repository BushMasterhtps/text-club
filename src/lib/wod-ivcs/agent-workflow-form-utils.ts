/**
 * Client helpers for the agent guided workflow form (Phase 4A.4).
 * Answer keys match agent-workflow-service / workflow-engine conventions.
 */

import {
  enrichAnswersWithSubDisposition,
  followUpAnswerKey,
  followUpNotesKey,
  isFollowUpQuestionVisibleForAnswers,
  type FollowUpQuestion,
} from "./follow-up-questions";
import {
  findBestMatchingRoutingRule,
  isCatchAllRoutingRule,
  rulePartiallyMatchesAgentCorePath,
} from "./routing-rule-match";

export { followUpAnswerKey, followUpNotesKey };

const CORE_STEP_SLUGS = [
  "root_cause",
  "cash_sale_exists",
  "merchant",
  "fix_type",
] as const;

export type WorkflowAnswersState = Record<
  string,
  string | string[] | boolean | number | null | undefined
>;

export type AgentCatalogOption = {
  id: string;
  value: string;
  label: string;
  sortOrder: number;
  metadataJson?: unknown;
};

export type AgentWorkflowStep = {
  id: string;
  slug: string;
  label: string;
  helpText: string | null;
  fieldType: string;
  sortOrder: number;
  isRequired: boolean;
  catalogId: string | null;
  catalog: {
    slug: string;
    catalogType: string;
    options: AgentCatalogOption[];
  } | null;
};

export type AgentRoutingRuleRef = {
  id: string;
  label: string | null;
  displayOrder: number;
  targetQueue: string;
  rootCauseOption: { id: string; value: string; label: string } | null;
  cashSaleExistsOption: { id: string; value: string; label: string } | null;
  merchantOption: { id: string; value: string; label: string } | null;
  fixTypeOption: { id: string; value: string; label: string } | null;
  followUpQuestions: FollowUpQuestion[];
  requiresRetriggerConfirmation: boolean;
  requiresItEscalation: boolean;
  requiresReplacementOrderNumber: boolean;
  requiresProcessedReship: boolean;
  itEscalationPrompt: string | null;
};

export type AgentActiveWorkflow = {
  definition: { id: string; slug: string; displayName: string };
  version: {
    id: string;
    version: number;
    status: string;
    routingMatrixHash: string | null;
    publishedAt: string | null;
  };
  catalogs: Array<{
    id: string;
    catalogType: string;
    slug: string;
    displayName: string;
    options: AgentCatalogOption[];
  }>;
  steps: AgentWorkflowStep[];
  routingRules: AgentRoutingRuleRef[];
};

const CONFIRMATION_STEP_SLUGS = new Set([
  "retrigger_confirmation",
  "replacement_order_number",
  "processed_reship_confirmation",
  "it_escalation_note",
  "sub_disposition",
]);

export const CORE_STEP_ORDER = [...CORE_STEP_SLUGS] as const;

type CoreStepSlug = (typeof CORE_STEP_ORDER)[number];

export function isConfirmationStepSlug(slug: string): boolean {
  return CONFIRMATION_STEP_SLUGS.has(slug);
}

export function getCoreSteps(active: AgentActiveWorkflow): AgentWorkflowStep[] {
  return active.steps
    .filter((s) => (CORE_STEP_ORDER as readonly string[]).includes(s.slug))
    .sort(
      (a, b) =>
        CORE_STEP_ORDER.indexOf(a.slug as CoreStepSlug) -
        CORE_STEP_ORDER.indexOf(b.slug as CoreStepSlug)
    );
}

export function getStepOptions(step: AgentWorkflowStep): AgentCatalogOption[] {
  const opts = step.catalog?.options ?? [];
  return [...opts].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
}

function answerString(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return value.length > 0 ? String(value[0]) : null;
  return String(value);
}

/** Partial match: rule dimensions that are set must match current answers (wildcards allowed). */
export function rulePartiallyMatchesCorePath(
  rule: AgentRoutingRuleRef,
  answers: WorkflowAnswersState
): boolean {
  return rulePartiallyMatchesAgentCorePath(rule, answers);
}

type RuleDimensionOption = { id: string; value: string; label: string } | null;

function ruleDimensionValue(opt: RuleDimensionOption): string | null {
  const v = opt?.value?.trim();
  return v ? v : null;
}

/**
 * True when upstream routing dimensions (before targetStep) match agent answers.
 * Unset rule dimensions (manager "Any") are wildcards and are not compared.
 * Agent answers are catalog option values (see SelectField value={o.value}).
 */
export function ruleMatchesUpstreamBeforeTargetStep(
  rule: AgentRoutingRuleRef,
  answers: WorkflowAnswersState,
  targetStep: CoreStepSlug
): boolean {
  if (isCatchAllRoutingRule(rule)) return false;

  const rootExpected = ruleDimensionValue(rule.rootCauseOption);
  if (!rootExpected) return false;

  const rootAnswer = answerString(answers.root_cause);
  if (!rootAnswer || rootAnswer !== rootExpected) return false;

  if (targetStep === "cash_sale_exists") return true;

  const cashExpected = ruleDimensionValue(rule.cashSaleExistsOption);
  if (cashExpected) {
    const cashAnswer = answerString(answers.cash_sale_exists);
    if (!cashAnswer || cashAnswer !== cashExpected) return false;
  }

  if (targetStep === "merchant") return true;

  const merchantExpected = ruleDimensionValue(rule.merchantOption);
  if (merchantExpected) {
    const merchantAnswer = answerString(answers.merchant);
    if (!merchantAnswer || merchantAnswer !== merchantExpected) return false;
  }

  return true;
}

/**
 * @deprecated Use ruleMatchesUpstreamBeforeTargetStep — kept for tests/scripts.
 */
export function ruleMatchesUpstreamForOptionCollection(
  rule: AgentRoutingRuleRef,
  answers: WorkflowAnswersState,
  targetStep: "cash_sale_exists" | "merchant" | "fix_type"
): boolean {
  return ruleMatchesUpstreamBeforeTargetStep(rule, answers, targetStep);
}

type StepOptionCollection = {
  /** Catalog option values (slugs) allowed for the step. */
  values: Set<string>;
  /** At least one matching rule has manager "Any" on this dimension. */
  hasWildcard: boolean;
};

/**
 * Collect allowed catalog values for a core step from routing rules.
 * Matching uses option values (agent answers are values, not option IDs).
 */
export function collectCoreStepOptionValuesFromRules(
  routingRules: AgentRoutingRuleRef[],
  answers: WorkflowAnswersState,
  targetStep: CoreStepSlug,
  getOption: (rule: AgentRoutingRuleRef) => RuleDimensionOption
): StepOptionCollection {
  const values = new Set<string>();
  let hasWildcard = false;

  for (const rule of routingRules) {
    if (!ruleMatchesUpstreamBeforeTargetStep(rule, answers, targetStep)) continue;

    const value = ruleDimensionValue(getOption(rule));
    if (value) {
      values.add(value);
    } else {
      hasWildcard = true;
    }
  }

  return { values, hasWildcard };
}

function filterCatalogOptionsByAllowedValues(
  allOptions: AgentCatalogOption[],
  allowedValues: Set<string>
): AgentCatalogOption[] {
  if (allowedValues.size === 0) return [];
  return allOptions.filter((o) => allowedValues.has(o.value));
}

function filterCoreStepCatalogOptions(
  allOptions: AgentCatalogOption[],
  routingRules: AgentRoutingRuleRef[],
  answers: WorkflowAnswersState,
  targetStep: CoreStepSlug,
  getOption: (rule: AgentRoutingRuleRef) => RuleDimensionOption
): AgentCatalogOption[] {
  const { values, hasWildcard } = collectCoreStepOptionValuesFromRules(
    routingRules,
    answers,
    targetStep,
    getOption
  );

  // Manager "Any" on this dimension: show active step catalog options (not matrix-wide fallback).
  if (hasWildcard) {
    return allOptions;
  }

  return filterCatalogOptionsByAllowedValues(allOptions, values);
}

/** Root cause values referenced by at least one active non-catch-all routing rule. */
export function collectRootCauseOptionValuesFromRules(
  routingRules: AgentRoutingRuleRef[]
): Set<string> {
  const values = new Set<string>();
  for (const rule of routingRules) {
    if (isCatchAllRoutingRule(rule)) continue;
    const v = ruleDimensionValue(rule.rootCauseOption);
    if (v) values.add(v);
  }
  return values;
}

/**
 * Root cause options limited to those used by the published routing matrix.
 * Catalog labels/values are preserved; options not referenced by any active rule are hidden.
 */
export function filterRootCauseCatalogOptions(
  allOptions: AgentCatalogOption[],
  routingRules: AgentRoutingRuleRef[]
): AgentCatalogOption[] {
  return filterCatalogOptionsByAllowedValues(
    allOptions,
    collectRootCauseOptionValuesFromRules(routingRules)
  );
}

/** @deprecated Prefer collectCoreStepOptionValuesFromRules — values, not IDs. */
export function collectRootCauseOptionIdsFromRules(
  routingRules: AgentRoutingRuleRef[]
): Set<string> {
  const ids = new Set<string>();
  for (const rule of routingRules) {
    if (isCatchAllRoutingRule(rule)) continue;
    if (rule.rootCauseOption?.id) ids.add(rule.rootCauseOption.id);
  }
  return ids;
}

export function filterCashSaleExistsCatalogOptions(
  allOptions: AgentCatalogOption[],
  routingRules: AgentRoutingRuleRef[],
  answers: WorkflowAnswersState
): AgentCatalogOption[] {
  if (!answerString(answers.root_cause)) return [];
  return filterCoreStepCatalogOptions(
    allOptions,
    routingRules,
    answers,
    "cash_sale_exists",
    (rule) => rule.cashSaleExistsOption
  );
}

/** @deprecated Prefer value-based collection. */
export function collectCashSaleExistsOptionIdsFromRules(
  routingRules: AgentRoutingRuleRef[],
  answers: WorkflowAnswersState
): Set<string> {
  const ids = new Set<string>();
  for (const rule of routingRules) {
    if (!ruleMatchesUpstreamBeforeTargetStep(rule, answers, "cash_sale_exists")) continue;
    if (rule.cashSaleExistsOption?.id) ids.add(rule.cashSaleExistsOption.id);
  }
  return ids;
}

export function filterMerchantCatalogOptions(
  allOptions: AgentCatalogOption[],
  routingRules: AgentRoutingRuleRef[],
  answers: WorkflowAnswersState
): AgentCatalogOption[] {
  if (!answerString(answers.root_cause)) return [];
  if (!answerString(answers.cash_sale_exists)) return [];
  return filterCoreStepCatalogOptions(
    allOptions,
    routingRules,
    answers,
    "merchant",
    (rule) => rule.merchantOption
  );
}

/** @deprecated Prefer value-based collection. */
export function collectMerchantOptionIdsFromRules(
  routingRules: AgentRoutingRuleRef[],
  answers: WorkflowAnswersState
): Set<string> {
  const ids = new Set<string>();
  for (const rule of routingRules) {
    if (!ruleMatchesUpstreamBeforeTargetStep(rule, answers, "merchant")) continue;
    if (rule.merchantOption?.id) ids.add(rule.merchantOption.id);
  }
  return ids;
}

/** Collect fix-type values from routing rules that match the current partial core path. */
export function collectFixTypeValuesFromRules(
  routingRules: AgentRoutingRuleRef[],
  answers: WorkflowAnswersState
): Set<string> {
  return collectCoreStepOptionValuesFromRules(
    routingRules,
    answers,
    "fix_type",
    (rule) => rule.fixTypeOption
  ).values;
}

/**
 * Filter fix-type catalog options using published routing rules for the partial core path.
 * Does not fall back to the full catalog when no rules match (avoids showing invalid fix types).
 */
export function filterFixTypeCatalogOptions(
  allOptions: AgentCatalogOption[],
  routingRules: AgentRoutingRuleRef[],
  answers: WorkflowAnswersState
): AgentCatalogOption[] {
  if (!answerString(answers.root_cause)) return [];

  const allowed = collectFixTypeValuesFromRules(routingRules, answers);
  if (allowed.size === 0) return [];

  return allOptions.filter((o) => allowed.has(o.value));
}

/** Core step options filtered by the active published routing matrix. */
export function getFilteredCoreStepOptions(
  step: AgentWorkflowStep,
  routingRules: AgentRoutingRuleRef[],
  answers: WorkflowAnswersState
): AgentCatalogOption[] {
  const allOptions = getStepOptions(step);
  switch (step.slug) {
    case "root_cause":
      return filterRootCauseCatalogOptions(allOptions, routingRules);
    case "cash_sale_exists":
      return filterCashSaleExistsCatalogOptions(allOptions, routingRules, answers);
    case "merchant":
      return filterMerchantCatalogOptions(allOptions, routingRules, answers);
    case "fix_type":
      return filterFixTypeCatalogOptions(allOptions, routingRules, answers);
    default:
      return allOptions;
  }
}

export function isFollowUpQuestionVisible(
  question: FollowUpQuestion,
  answers: WorkflowAnswersState
): boolean {
  return isFollowUpQuestionVisibleForAnswers(question, answers);
}

/** Client-side routing match (same rules as agent-workflow-service.findMatchingRoutingRule). */
export function findMatchingAgentRoutingRule(
  rules: AgentRoutingRuleRef[],
  answers: WorkflowAnswersState
): AgentRoutingRuleRef | null {
  return findBestMatchingRoutingRule(rules, answers);
}

function keysToClearBeyondCore(changedIndex: number): string[] {
  const slugs = [...CORE_STEP_ORDER.slice(changedIndex + 1)];
  return slugs;
}

/** Clear downstream core answers, follow-ups, and confirmations after a core answer changes. */
export function pruneAnswersAfterCoreChange(
  changedSlug: CoreStepSlug,
  answers: WorkflowAnswersState
): WorkflowAnswersState {
  const idx = CORE_STEP_ORDER.indexOf(changedSlug);
  if (idx < 0) return answers;

  const next: WorkflowAnswersState = { ...answers };
  for (const slug of keysToClearBeyondCore(idx)) {
    delete next[slug];
  }
  for (const key of Object.keys(next)) {
    if (key.startsWith("follow_up.") || isConfirmationStepSlug(key)) {
      delete next[key];
    }
  }
  return next;
}

/** Clear follow-up and confirmation answers when the matched routing rule identity changes. */
export function pruneAnswersAfterRuleChange(answers: WorkflowAnswersState): WorkflowAnswersState {
  const next: WorkflowAnswersState = { ...answers };
  for (const key of Object.keys(next)) {
    if (key.startsWith("follow_up.") || isConfirmationStepSlug(key)) {
      delete next[key];
    }
  }
  return next;
}

export function selectedOptionRequiresNotes(
  question: FollowUpQuestion,
  selected: string | string[] | undefined
): boolean {
  if (!selected) return false;
  const labels = Array.isArray(selected) ? selected : [selected];
  return labels.some((label) =>
    question.options.some((o) => o.label === label && o.requiresNotes)
  );
}

export function buildPreviewAnswersPayload(
  answers: WorkflowAnswersState,
  options?: {
    followUpQuestions?: FollowUpQuestion[] | null;
    routingRules?: AgentRoutingRuleRef[];
  }
): Record<string, unknown> {
  let followUpQuestions = options?.followUpQuestions ?? null;
  if (!followUpQuestions?.length && options?.routingRules) {
    const matched = findMatchingAgentRoutingRule(options.routingRules, answers);
    followUpQuestions = matched?.followUpQuestions ?? null;
  }

  const enriched = enrichAnswersWithSubDisposition(answers, followUpQuestions);
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(enriched)) {
    if (value === undefined) continue;
    if (value === null || value === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    payload[key] = value;
  }
  return payload;
}

export function hasAnyCoreAnswer(answers: WorkflowAnswersState): boolean {
  return CORE_STEP_ORDER.some((slug) => {
    const v = answers[slug];
    return v !== undefined && v !== null && v !== "";
  });
}

export function areCoreAnswersComplete(answers: WorkflowAnswersState): boolean {
  return CORE_STEP_ORDER.every((slug) => {
    const v = answers[slug];
    return v !== undefined && v !== null && v !== "";
  });
}

function isAnswerFilled(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.length > 0;
  return String(value).trim() !== "";
}

/** Client-side gate for enabling Submit (server preview/submit remain source of truth). */
export function canSubmitAgentWorkflow(input: {
  answers: WorkflowAnswersState;
  preview: {
    validation: { valid: boolean };
    matchedRoutingRule: unknown | null;
    predictedTargetQueue: string | null | undefined;
    requiredConfirmations?: {
      requiresRetriggerConfirmation: boolean;
      requiresItEscalation: boolean;
      requiresReplacementOrderNumber: boolean;
      requiresProcessedReship: boolean;
    };
    visibleSteps?: string[];
  } | null;
  previewLoading: boolean;
  previewError: string;
  followUpQuestions: FollowUpQuestion[];
}): boolean {
  if (input.previewLoading || input.previewError) return false;
  if (!input.preview) return false;
  if (!input.preview.validation.valid) return false;
  if (!input.preview.matchedRoutingRule) return false;
  if (!input.preview.predictedTargetQueue) return false;
  if (!areCoreAnswersComplete(input.answers)) return false;

  for (const q of input.followUpQuestions) {
    if (!isFollowUpQuestionVisible(q, input.answers)) continue;
    if (!q.required) continue;
    const key = followUpAnswerKey(q.id);
    if (!isAnswerFilled(input.answers[key])) return false;
    if (q.type === "single_select" || q.type === "multi_select") {
      if (selectedOptionRequiresNotes(q, input.answers[key] as string | string[])) {
        const notesKey = followUpNotesKey(q.id);
        if (!isAnswerFilled(input.answers[notesKey])) return false;
      }
    }
  }

  const req = input.preview.requiredConfirmations;
  const visible = new Set(input.preview.visibleSteps ?? []);

  if (
    (visible.has("retrigger_confirmation") || req?.requiresRetriggerConfirmation) &&
    input.answers.retrigger_confirmation !== true
  ) {
    return false;
  }
  if (
    (visible.has("replacement_order_number") || req?.requiresReplacementOrderNumber) &&
    !isAnswerFilled(input.answers.replacement_order_number)
  ) {
    return false;
  }
  if (
    (visible.has("processed_reship_confirmation") || req?.requiresProcessedReship) &&
    input.answers.processed_reship_confirmation !== true
  ) {
    return false;
  }
  if (
    (visible.has("it_escalation_note") || req?.requiresItEscalation) &&
    !isAnswerFilled(input.answers.it_escalation_note)
  ) {
    return false;
  }

  return true;
}
