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

export function isConfirmationStepSlug(slug: string): boolean {
  return CONFIRMATION_STEP_SLUGS.has(slug);
}

export function getCoreSteps(active: AgentActiveWorkflow): AgentWorkflowStep[] {
  return active.steps
    .filter((s) => (CORE_STEP_ORDER as readonly string[]).includes(s.slug))
    .sort(
      (a, b) =>
        CORE_STEP_ORDER.indexOf(a.slug as (typeof CORE_STEP_ORDER)[number]) -
        CORE_STEP_ORDER.indexOf(b.slug as (typeof CORE_STEP_ORDER)[number])
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

/** Collect fix-type values from routing rules that match the current partial core path. */
export function collectFixTypeValuesFromRules(
  routingRules: AgentRoutingRuleRef[],
  answers: WorkflowAnswersState
): Set<string> {
  const values = new Set<string>();
  for (const rule of routingRules) {
    if (!rule.fixTypeOption?.value) continue;
    if (!rulePartiallyMatchesCorePath(rule, answers)) continue;
    values.add(rule.fixTypeOption.value);
  }
  return values;
}

/**
 * Filter fix-type catalog options using published routing rules.
 * Falls back to full catalog when filtering would hide everything.
 */
export function filterFixTypeCatalogOptions(
  allOptions: AgentCatalogOption[],
  routingRules: AgentRoutingRuleRef[],
  answers: WorkflowAnswersState
): AgentCatalogOption[] {
  if (!answerString(answers.root_cause)) return allOptions;

  const allowed = collectFixTypeValuesFromRules(routingRules, answers);
  if (allowed.size === 0) return allOptions;

  const filtered = allOptions.filter((o) => allowed.has(o.value));
  return filtered.length > 0 ? filtered : allOptions;
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
  changedSlug: (typeof CORE_STEP_ORDER)[number],
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
