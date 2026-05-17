import {
  Prisma,
  type WodIvcsOperationalCompletionMode,
  type WodIvcsOperationalQueue,
  type WodIvcsProductivityCreditMode,
  type WodIvcsWorkflowDropOffBehavior,
  type WodIvcsWorkflowStepFieldType,
} from "@prisma/client";
import type { WorkflowMatchJson } from "./workflow-engine";

export type RoutingRuleCompileInput = {
  id: string;
  displayOrder: number;
  isActive: boolean;
  label: string | null;
  rootCauseOptionId: string | null;
  cashSaleExistsOptionId: string | null;
  merchantOptionId: string | null;
  fixTypeOptionId: string | null;
  subDispositionRequired: boolean;
  subDispositionQuestion: string | null;
  requiresRetriggerConfirmation: boolean;
  requiresItEscalation: boolean;
  requiresReplacementOrderNumber: boolean;
  requiresProcessedReship: boolean;
  itEscalationPrompt: string | null;
  targetQueue: WodIvcsOperationalQueue;
  operationalCompletionMode: WodIvcsOperationalCompletionMode;
  productivityCreditMode: WodIvcsProductivityCreditMode;
  dropOffBehavior: WodIvcsWorkflowDropOffBehavior;
  metadataJson: unknown;
  rootCauseOption?: { value: string; label: string } | null;
  cashSaleExistsOption?: { value: string; label: string } | null;
  merchantOption?: { value: string; label: string } | null;
  fixTypeOption?: { value: string; label: string } | null;
  subDispositionOptions: Array<{ label: string; isActive: boolean }>;
};

export type CatalogCompileRef = {
  id: string;
  slug: string;
  groupKey: string | null;
  catalogType: string;
};

export type RoutingMatrixValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};

export type CompiledStep = {
  slug: string;
  label: string;
  helpText?: string | null;
  fieldType: WodIvcsWorkflowStepFieldType;
  catalogId: string | null;
  sortOrder: number;
  isRequired: boolean;
  conditions: Array<{
    dependsOnStepSlug: string;
    operator: "EQ" | "IN" | "NEQ" | "NOT_IN" | "IS_EMPTY" | "IS_NOT_EMPTY";
    valueJson: unknown;
  }>;
};

export type CompiledOutcomeRule = {
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
  effectsJson: Record<string, unknown>;
  isActive: boolean;
  routingRuleId: string;
};

export type CompileResult = {
  steps: CompiledStep[];
  outcomeRules: CompiledOutcomeRule[];
};

const CORE_STEP_DEFS: Array<{
  slug: string;
  label: string;
  catalogSlug: string;
  sortOrder: number;
}> = [
  { slug: "root_cause", label: "Root cause", catalogSlug: "root-cause", sortOrder: 10 },
  {
    slug: "cash_sale_exists",
    label: "Cash sale exists?",
    catalogSlug: "cash-sale-exists",
    sortOrder: 20,
  },
  { slug: "merchant", label: "Merchant", catalogSlug: "merchant", sortOrder: 30 },
  { slug: "fix_type", label: "Fix type", catalogSlug: "fix-type", sortOrder: 40 },
];

function isCatchAllRule(rule: RoutingRuleCompileInput): boolean {
  const meta =
    rule.metadataJson && typeof rule.metadataJson === "object"
      ? (rule.metadataJson as Record<string, unknown>)
      : {};
  if (meta.isCatchAll === true) return true;
  return !rule.rootCauseOptionId && !rule.fixTypeOptionId;
}

export function pathKey(rule: RoutingRuleCompileInput): string {
  return [
    rule.rootCauseOptionId ?? "",
    rule.cashSaleExistsOptionId ?? "",
    rule.merchantOptionId ?? "",
    rule.fixTypeOptionId ?? "",
  ].join("|");
}

export function validateRoutingMatrix(rules: RoutingRuleCompileInput[]): RoutingMatrixValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const active = rules.filter((r) => r.isActive);

  if (active.length === 0) {
    errors.push("At least one active routing rule is required.");
  }

  const seen = new Map<string, string>();
  for (const rule of active) {
    if (!isCatchAllRule(rule)) {
      if (!rule.rootCauseOptionId) {
        errors.push(`Active rule "${rule.label ?? rule.id}" requires a root cause.`);
      }
      if (!rule.fixTypeOptionId) {
        errors.push(`Active rule "${rule.label ?? rule.id}" requires a fix type.`);
      }
    }

    if (rule.subDispositionRequired) {
      if (!rule.subDispositionQuestion?.trim()) {
        errors.push(
          `Rule "${rule.label ?? rule.id}" requires a sub-disposition question when sub-disposition is enabled.`
        );
      }
      const activeSubs = rule.subDispositionOptions.filter((o) => o.isActive);
      if (activeSubs.length === 0) {
        errors.push(
          `Rule "${rule.label ?? rule.id}" requires at least one active sub-disposition option.`
        );
      }
    }

    if (!isCatchAllRule(rule)) {
      const key = pathKey(rule);
      const existing = seen.get(key);
      if (existing) {
        errors.push(
          `Duplicate active path: "${rule.label ?? rule.id}" conflicts with "${existing}".`
        );
      } else {
        seen.set(key, rule.label ?? rule.id);
      }
    }
  }

  const hasCatchAll = active.some(isCatchAllRule);
  if (!hasCatchAll) {
    warnings.push(
      "No catch-all routing rule (empty root cause and fix type). Unmatched paths will use engine fallback."
    );
  }

  return { valid: errors.length === 0, errors, warnings };
}

function buildMatchJson(rule: RoutingRuleCompileInput): WorkflowMatchJson {
  if (isCatchAllRule(rule)) {
    return { clauses: [] };
  }

  const clauses: WorkflowMatchJson["clauses"] = [];

  if (rule.rootCauseOption?.value) {
    clauses.push({
      stepSlug: "root_cause",
      operator: "EQ",
      values: [rule.rootCauseOption.value],
    });
  }
  if (rule.cashSaleExistsOption?.value) {
    clauses.push({
      stepSlug: "cash_sale_exists",
      operator: "EQ",
      values: [rule.cashSaleExistsOption.value],
    });
  }
  if (rule.merchantOption?.value) {
    clauses.push({
      stepSlug: "merchant",
      operator: "EQ",
      values: [rule.merchantOption.value],
    });
  }
  if (rule.fixTypeOption?.value) {
    clauses.push({
      stepSlug: "fix_type",
      operator: "EQ",
      values: [rule.fixTypeOption.value],
    });
  }

  return { clauses };
}

function fixTypeValues(rules: RoutingRuleCompileInput[], predicate: (r: RoutingRuleCompileInput) => boolean) {
  const values = new Set<string>();
  for (const rule of rules) {
    if (!rule.isActive || !predicate(rule)) continue;
    if (rule.fixTypeOption?.value) values.add(rule.fixTypeOption.value);
  }
  return [...values];
}

export function compileRoutingMatrix(
  rules: RoutingRuleCompileInput[],
  catalogsBySlug: Map<string, CatalogCompileRef>
): CompileResult {
  const active = rules
    .filter((r) => r.isActive)
    .sort((a, b) => a.displayOrder - b.displayOrder);

  const steps: CompiledStep[] = CORE_STEP_DEFS.map((def) => ({
    slug: def.slug,
    label: def.label,
    fieldType: "SINGLE_SELECT",
    catalogId: catalogsBySlug.get(def.catalogSlug)?.id ?? null,
    sortOrder: def.sortOrder,
    isRequired: true,
    conditions: [],
  }));

  let sortOrder = 50;

  const subDispFixTypes = fixTypeValues(active, (r) => r.subDispositionRequired);
  if (subDispFixTypes.length > 0) {
    steps.push({
      slug: "sub_disposition",
      label: "Sub-disposition",
      fieldType: "SINGLE_SELECT",
      catalogId: null,
      sortOrder: sortOrder++,
      isRequired: true,
      conditions: [
        {
          dependsOnStepSlug: "fix_type",
          operator: "IN",
          valueJson: subDispFixTypes,
        },
      ],
    });
  }

  const retriggerFixTypes = fixTypeValues(active, (r) => r.requiresRetriggerConfirmation);
  if (retriggerFixTypes.length > 0) {
    steps.push({
      slug: "retrigger_confirmation",
      label: "Re-trigger cash sale confirmation",
      fieldType: "BOOLEAN",
      catalogId: null,
      sortOrder: sortOrder++,
      isRequired: true,
      conditions: [
        {
          dependsOnStepSlug: "fix_type",
          operator: "IN",
          valueJson: retriggerFixTypes,
        },
      ],
    });
  }

  const replacementFixTypes = fixTypeValues(active, (r) => r.requiresReplacementOrderNumber);
  if (replacementFixTypes.length > 0) {
    steps.push({
      slug: "replacement_order_number",
      label: "Replacement order number",
      fieldType: "TEXT",
      catalogId: null,
      sortOrder: sortOrder++,
      isRequired: true,
      conditions: [
        {
          dependsOnStepSlug: "fix_type",
          operator: "IN",
          valueJson: replacementFixTypes,
        },
      ],
    });
  }

  const reshipFixTypes = fixTypeValues(active, (r) => r.requiresProcessedReship);
  if (reshipFixTypes.length > 0) {
    steps.push({
      slug: "processed_reship_confirmation",
      label: "Processed reship confirmation",
      fieldType: "BOOLEAN",
      catalogId: null,
      sortOrder: sortOrder++,
      isRequired: true,
      conditions: [
        {
          dependsOnStepSlug: "fix_type",
          operator: "IN",
          valueJson: reshipFixTypes,
        },
      ],
    });
  }

  const itRootCauses = new Set<string>();
  for (const rule of active) {
    if (rule.requiresItEscalation && rule.rootCauseOption?.value) {
      itRootCauses.add(rule.rootCauseOption.value);
    }
  }
  if (itRootCauses.size > 0) {
    steps.push({
      slug: "it_escalation_note",
      label: "IT escalation note",
      helpText: active.find((r) => r.requiresItEscalation)?.itEscalationPrompt ?? null,
      fieldType: "TEXTAREA",
      catalogId: null,
      sortOrder: sortOrder++,
      isRequired: true,
      conditions: [
        {
          dependsOnStepSlug: "root_cause",
          operator: "IN",
          valueJson: [...itRootCauses],
        },
      ],
    });
  }

  const outcomeRules: CompiledOutcomeRule[] = active.map((rule, index) => {
    const priority = (index + 1) * 10;
    const meta =
      rule.metadataJson && typeof rule.metadataJson === "object"
        ? { ...(rule.metadataJson as Record<string, unknown>) }
        : {};

    return {
      priority,
      name: rule.label ?? `Routing rule ${index + 1}`,
      matchJson: buildMatchJson(rule),
      targetQueue: rule.targetQueue,
      productivityCreditMode: rule.productivityCreditMode,
      operationalCompletionMode: rule.operationalCompletionMode,
      requiresReplacementOrderNumber: rule.requiresReplacementOrderNumber,
      requiresProcessedReship: rule.requiresProcessedReship,
      requiresItEscalation: rule.requiresItEscalation,
      requiresRetriggerConfirmation: rule.requiresRetriggerConfirmation,
      effectsJson: {
        ...meta,
        routingRuleId: rule.id,
        dropOffBehavior: rule.dropOffBehavior,
      },
      isActive: true,
      routingRuleId: rule.id,
    };
  });

  return { steps, outcomeRules };
}

export function computeRoutingMatrixHash(rules: RoutingRuleCompileInput[]): string {
  const payload = rules
    .map((r) => ({
      id: r.id,
      displayOrder: r.displayOrder,
      isActive: r.isActive,
      path: pathKey(r),
      flags: {
        subDispositionRequired: r.subDispositionRequired,
        requiresRetriggerConfirmation: r.requiresRetriggerConfirmation,
        requiresItEscalation: r.requiresItEscalation,
        requiresReplacementOrderNumber: r.requiresReplacementOrderNumber,
        requiresProcessedReship: r.requiresProcessedReship,
      },
      targetQueue: r.targetQueue,
      dropOffBehavior: r.dropOffBehavior,
    }))
    .sort((a, b) => a.displayOrder - b.displayOrder);
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

export type PersistCompileParams = {
  versionId: string;
  steps: CompiledStep[];
  outcomeRules: CompiledOutcomeRule[];
};

/** SQL-free shape for Prisma transaction writes after compile. */
export function buildPrismaCompileWrites(params: PersistCompileParams) {
  return params;
}
