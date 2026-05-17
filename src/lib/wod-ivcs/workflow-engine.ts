import type {
  WodIvcsOperationalCompletionMode,
  WodIvcsOperationalQueue,
  WodIvcsProductivityCreditMode,
  WodIvcsWorkflowConditionOperator,
  WodIvcsWorkflowStepFieldType,
} from "@prisma/client";

export type WorkflowAnswers = Record<string, string | string[] | boolean | number | null | undefined>;

export type WorkflowMatchClause = {
  stepSlug: string;
  operator: WodIvcsWorkflowConditionOperator;
  values?: unknown[];
};

export type WorkflowMatchJson = {
  clauses?: WorkflowMatchClause[];
};

export type WorkflowStepInput = {
  slug: string;
  label: string;
  fieldType: WodIvcsWorkflowStepFieldType;
  sortOrder: number;
  isRequired: boolean;
  conditions: Array<{
    dependsOnStepSlug: string;
    operator: WodIvcsWorkflowConditionOperator;
    valueJson: unknown;
  }>;
};

export type WorkflowOutcomeRuleInput = {
  priority: number;
  name: string;
  matchJson: WorkflowMatchJson;
  targetQueue: WodIvcsOperationalQueue;
  productivityCreditMode: WodIvcsProductivityCreditMode;
  operationalCompletionMode: WodIvcsOperationalCompletionMode;
  requiresReplacementOrderNumber: boolean;
  requiresProcessedReship: boolean;
  requiresItEscalation: boolean;
  requiresRetriggerConfirmation: boolean;
  effectsJson?: Record<string, unknown> | null;
  isActive: boolean;
};

export type WorkflowValidationResult = {
  valid: boolean;
  errors: string[];
};

export type ResolvedOutcomeRule = WorkflowOutcomeRuleInput & {
  matchedBy: "rule" | "fallback";
};

const FALLBACK_RULE: WorkflowOutcomeRuleInput = {
  priority: 999999,
  name: "Default — no rule matched",
  matchJson: { clauses: [] },
  targetQueue: "NEEDS_ACTION",
  productivityCreditMode: "NONE",
  operationalCompletionMode: "REMAIN_OPEN",
  requiresReplacementOrderNumber: false,
  requiresProcessedReship: false,
  requiresItEscalation: false,
  requiresRetriggerConfirmation: false,
  isActive: true,
};

function normalizeAnswerValue(value: unknown): string | string[] | null {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

function parseConditionValues(valueJson: unknown): string[] {
  if (Array.isArray(valueJson)) return valueJson.map(String);
  if (valueJson && typeof valueJson === "object" && "values" in valueJson) {
    const v = (valueJson as { values: unknown }).values;
    return Array.isArray(v) ? v.map(String) : [String(v)];
  }
  if (valueJson === null || valueJson === undefined) return [];
  return [String(valueJson)];
}

function isEmptyAnswer(value: string | string[] | null): boolean {
  if (value === null) return true;
  if (Array.isArray(value)) return value.length === 0;
  return value.trim() === "";
}

export function evaluateCondition(
  operator: WodIvcsWorkflowConditionOperator,
  expectedValues: string[],
  actual: string | string[] | null
): boolean {
  const actualList = actual === null ? [] : Array.isArray(actual) ? actual : [actual];

  switch (operator) {
    case "IS_EMPTY":
      return isEmptyAnswer(actual);
    case "IS_NOT_EMPTY":
      return !isEmptyAnswer(actual);
    case "EQ":
      return expectedValues.length > 0 && actualList.some((a) => a === expectedValues[0]);
    case "NEQ":
      return expectedValues.length > 0 && !actualList.some((a) => a === expectedValues[0]);
    case "IN":
      return actualList.some((a) => expectedValues.includes(a));
    case "NOT_IN":
      return actualList.every((a) => !expectedValues.includes(a));
    default:
      return false;
  }
}

export function evaluateStepConditions(
  step: WorkflowStepInput,
  answers: WorkflowAnswers
): boolean {
  if (step.fieldType === "SECTION_HEADER" || step.fieldType === "READ_ONLY") {
    return true;
  }
  if (step.conditions.length === 0) return true;

  return step.conditions.every((cond) => {
    const actual = normalizeAnswerValue(answers[cond.dependsOnStepSlug]);
    const expected = parseConditionValues(cond.valueJson);
    return evaluateCondition(cond.operator, expected, actual);
  });
}

function isAnswerProvided(fieldType: WodIvcsWorkflowStepFieldType, value: unknown): boolean {
  if (fieldType === "SECTION_HEADER" || fieldType === "READ_ONLY") return true;
  const normalized = normalizeAnswerValue(value);
  return !isEmptyAnswer(normalized);
}

export function validateAnswers(
  steps: WorkflowStepInput[],
  answers: WorkflowAnswers
): WorkflowValidationResult {
  const errors: string[] = [];
  const sorted = [...steps].sort((a, b) => a.sortOrder - b.sortOrder);

  for (const step of sorted) {
    if (!evaluateStepConditions(step, answers)) continue;
    if (!step.isRequired) continue;
    if (!isAnswerProvided(step.fieldType, answers[step.slug])) {
      errors.push(`Missing required answer for step "${step.slug}" (${step.label}).`);
    }
  }

  return { valid: errors.length === 0, errors };
}

function clauseMatches(clause: WorkflowMatchClause, answers: WorkflowAnswers): boolean {
  const actual = normalizeAnswerValue(answers[clause.stepSlug]);
  const expected = (clause.values ?? []).map(String);
  return evaluateCondition(clause.operator, expected, actual);
}

export function ruleMatches(matchJson: WorkflowMatchJson, answers: WorkflowAnswers): boolean {
  const clauses = matchJson.clauses ?? [];
  if (clauses.length === 0) return true;
  return clauses.every((clause) => clauseMatches(clause, answers));
}

export function resolveOutcomeRule(
  rules: WorkflowOutcomeRuleInput[],
  answers: WorkflowAnswers
): ResolvedOutcomeRule {
  const active = rules
    .filter((r) => r.isActive)
    .sort((a, b) => a.priority - b.priority);

  for (const rule of active) {
    const matchJson =
      typeof rule.matchJson === "object" && rule.matchJson !== null
        ? (rule.matchJson as WorkflowMatchJson)
        : { clauses: [] };

    if (ruleMatches(matchJson, answers)) {
      return { ...rule, matchedBy: "rule" };
    }
  }

  return { ...FALLBACK_RULE, matchedBy: "fallback" };
}

export function loadMatchJson(raw: unknown): WorkflowMatchJson {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as WorkflowMatchJson;
  }
  return { clauses: [] };
}
