import {
  Prisma,
  type PrismaClient,
  type WodIvcsOperationalQueue,
  type WodIvcsWorkflowCatalogType,
  type WodIvcsWorkflowConfigAuditAction,
  type WodIvcsWorkflowStepFieldType,
  WodIvcsOperationalQueue as OperationalQueueEnum,
  WodIvcsWorkflowCatalogType as CatalogTypeEnum,
} from "@prisma/client";
import {
  evaluateStepConditions,
  loadMatchJson,
  resolveOutcomeRule,
  validateAnswers,
  type WorkflowAnswers,
  type WorkflowMatchJson,
  type WorkflowOutcomeRuleInput,
  type WorkflowStepInput,
} from "./workflow-engine";

export const WORKFLOW_SLUG = "invalid-cash-sale-v1";

export const CORE_STEP_SLUGS = [
  "root_cause",
  "cash_sale_exists",
  "merchant",
  "fix_type",
] as const;

const OPERATIONAL_QUEUES = new Set<string>(Object.values(OperationalQueueEnum));
const CATALOG_TYPES = new Set<string>(Object.values(CatalogTypeEnum));

export class WorkflowConfigError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400,
    public code?: string
  ) {
    super(message);
    this.name = "WorkflowConfigError";
  }
}

export function normalizeCatalogType(raw: string): WodIvcsWorkflowCatalogType | null {
  const upper = raw.trim().toUpperCase().replace(/-/g, "_");
  return CATALOG_TYPES.has(upper) ? (upper as WodIvcsWorkflowCatalogType) : null;
}

export function validateMatchJson(raw: unknown): {
  ok: boolean;
  errors: string[];
  matchJson: WorkflowMatchJson;
} {
  const errors: string[] = [];
  if (raw === null || raw === undefined) {
    return { ok: true, errors, matchJson: { clauses: [] } };
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, errors: ["matchJson must be an object"], matchJson: { clauses: [] } };
  }
  const obj = raw as Record<string, unknown>;
  const clauses = obj.clauses;
  if (clauses === undefined) {
    return { ok: true, errors, matchJson: { clauses: [] } };
  }
  if (!Array.isArray(clauses)) {
    return { ok: false, errors: ["matchJson.clauses must be an array"], matchJson: { clauses: [] } };
  }
  for (let i = 0; i < clauses.length; i++) {
    const c = clauses[i];
    if (!c || typeof c !== "object") {
      errors.push(`matchJson.clauses[${i}] must be an object`);
      continue;
    }
    const clause = c as Record<string, unknown>;
    if (typeof clause.stepSlug !== "string" || !clause.stepSlug.trim()) {
      errors.push(`matchJson.clauses[${i}].stepSlug is required`);
    }
    if (typeof clause.operator !== "string") {
      errors.push(`matchJson.clauses[${i}].operator is required`);
    }
  }
  return { ok: errors.length === 0, errors, matchJson: raw as WorkflowMatchJson };
}

export async function writeWorkflowConfigAudit(
  prisma: PrismaClient,
  input: {
    actorId: string;
    action: WodIvcsWorkflowConfigAuditAction;
    entityType: string;
    entityId?: string | null;
    beforeJson?: unknown;
    afterJson?: unknown;
    reason?: string | null;
  }
) {
  return prisma.wodIvcsWorkflowConfigAuditLog.create({
    data: {
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      beforeJson:
        input.beforeJson === undefined
          ? undefined
          : (input.beforeJson as Prisma.InputJsonValue),
      afterJson:
        input.afterJson === undefined
          ? undefined
          : (input.afterJson as Prisma.InputJsonValue),
      reason: input.reason ?? null,
    },
  });
}

async function requireWorkflowDefinition(prisma: PrismaClient) {
  const def = await prisma.wodIvcsWorkflowDefinition.findUnique({
    where: { slug: WORKFLOW_SLUG },
  });
  if (!def) {
    throw new WorkflowConfigError(
      `Workflow definition "${WORKFLOW_SLUG}" not found. Run seed script.`,
      404,
      "WORKFLOW_NOT_FOUND"
    );
  }
  return def;
}

async function requireDraftVersion(prisma: PrismaClient, versionId: string) {
  const version = await prisma.wodIvcsWorkflowVersion.findUnique({
    where: { id: versionId },
  });
  if (!version) {
    throw new WorkflowConfigError("Workflow version not found", 404, "VERSION_NOT_FOUND");
  }
  if (version.status !== "DRAFT") {
    throw new WorkflowConfigError(
      `Only DRAFT versions can be edited (status: ${version.status})`,
      409,
      "NOT_DRAFT"
    );
  }
  return version;
}

export async function getActiveWorkflowDefinition(prisma: PrismaClient) {
  const definition = await requireWorkflowDefinition(prisma);
  const publishedVersion = await prisma.wodIvcsWorkflowVersion.findFirst({
    where: { workflowId: definition.id, status: "PUBLISHED" },
    orderBy: { version: "desc" },
    include: {
      publishedBy: { select: { id: true, name: true, email: true } },
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });
  return { definition, publishedVersion };
}

export async function listCatalogs(prisma: PrismaClient) {
  const catalogs = await prisma.wodIvcsWorkflowCatalog.findMany({
    orderBy: [{ catalogType: "asc" }, { slug: "asc" }],
    include: {
      options: {
        orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
      },
      _count: { select: { options: true } },
    },
  });
  return catalogs;
}

export async function getCatalogByType(prisma: PrismaClient, catalogType: WodIvcsWorkflowCatalogType) {
  const catalog = await prisma.wodIvcsWorkflowCatalog.findFirst({
    where: { catalogType },
    include: {
      options: { orderBy: [{ sortOrder: "asc" }, { label: "asc" }] },
    },
  });
  if (!catalog) {
    throw new WorkflowConfigError(`Catalog not found for type ${catalogType}`, 404, "CATALOG_NOT_FOUND");
  }
  return catalog;
}

export async function addCatalogOption(
  prisma: PrismaClient,
  input: {
    catalogType: WodIvcsWorkflowCatalogType;
    value: string;
    label: string;
    sortOrder?: number;
    isActive?: boolean;
    metadataJson?: unknown;
    actorId: string;
  }
) {
  const catalog = await getCatalogByType(prisma, input.catalogType);
  const value = input.value.trim();
  if (!value) throw new WorkflowConfigError("value is required");

  const existing = await prisma.wodIvcsWorkflowCatalogOption.findUnique({
    where: { catalogId_value: { catalogId: catalog.id, value } },
  });
  if (existing) {
    throw new WorkflowConfigError(
      `Option value "${value}" already exists in this catalog`,
      409,
      "DUPLICATE_VALUE"
    );
  }

  const option = await prisma.wodIvcsWorkflowCatalogOption.create({
    data: {
      catalogId: catalog.id,
      value,
      label: input.label.trim(),
      sortOrder: input.sortOrder ?? 100,
      isActive: input.isActive ?? true,
      metadataJson:
        input.metadataJson === undefined
          ? undefined
          : (input.metadataJson as Prisma.InputJsonValue),
    },
  });

  await writeWorkflowConfigAudit(prisma, {
    actorId: input.actorId,
    action: "CREATED",
    entityType: "CATALOG_OPTION",
    entityId: option.id,
    afterJson: option,
  });

  return option;
}

export async function updateCatalogOption(
  prisma: PrismaClient,
  input: {
    optionId: string;
    actorId: string;
    value?: string;
    label?: string;
    sortOrder?: number;
    isActive?: boolean;
    metadataJson?: unknown;
  }
) {
  const before = await prisma.wodIvcsWorkflowCatalogOption.findUnique({
    where: { id: input.optionId },
  });
  if (!before) {
    throw new WorkflowConfigError("Catalog option not found", 404, "OPTION_NOT_FOUND");
  }

  if (input.value !== undefined && input.value.trim() !== before.value) {
    const dup = await prisma.wodIvcsWorkflowCatalogOption.findFirst({
      where: {
        catalogId: before.catalogId,
        value: input.value.trim(),
        id: { not: input.optionId },
      },
    });
    if (dup) {
      throw new WorkflowConfigError(
        `Option value "${input.value}" already exists in this catalog`,
        409,
        "DUPLICATE_VALUE"
      );
    }
  }

  const after = await prisma.wodIvcsWorkflowCatalogOption.update({
    where: { id: input.optionId },
    data: {
      ...(input.value !== undefined ? { value: input.value.trim() } : {}),
      ...(input.label !== undefined ? { label: input.label.trim() } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.metadataJson !== undefined
        ? { metadataJson: input.metadataJson as Prisma.InputJsonValue }
        : {}),
    },
  });

  await writeWorkflowConfigAudit(prisma, {
    actorId: input.actorId,
    action: "UPDATED",
    entityType: "CATALOG_OPTION",
    entityId: after.id,
    beforeJson: before,
    afterJson: after,
  });

  return after;
}

function toStepInputs(
  steps: Array<{
    slug: string;
    label: string;
    fieldType: WodIvcsWorkflowStepFieldType;
    sortOrder: number;
    isRequired: boolean;
    conditions: Array<{
      dependsOnStepSlug: string;
      operator: import("@prisma/client").WodIvcsWorkflowConditionOperator;
      valueJson: unknown;
    }>;
  }>
): WorkflowStepInput[] {
  return steps.map((s) => ({
    slug: s.slug,
    label: s.label,
    fieldType: s.fieldType,
    sortOrder: s.sortOrder,
    isRequired: s.isRequired,
    conditions: s.conditions.map((c) => ({
      dependsOnStepSlug: c.dependsOnStepSlug,
      operator: c.operator,
      valueJson: c.valueJson,
    })),
  }));
}

export async function getWorkflowVersionGraph(prisma: PrismaClient, versionId: string) {
  const version = await prisma.wodIvcsWorkflowVersion.findUnique({
    where: { id: versionId },
    include: {
      workflow: true,
      publishedBy: { select: { id: true, name: true, email: true } },
      createdBy: { select: { id: true, name: true, email: true } },
      steps: {
        orderBy: { sortOrder: "asc" },
        include: {
          conditions: true,
          catalog: {
            include: {
              options: { where: { isActive: true }, orderBy: { sortOrder: "asc" } },
            },
          },
        },
      },
      outcomeRules: { orderBy: { priority: "asc" } },
    },
  });
  if (!version) {
    throw new WorkflowConfigError("Workflow version not found", 404, "VERSION_NOT_FOUND");
  }

  const catalogs = await listCatalogs(prisma);

  return { version, catalogs };
}

export async function listWorkflowVersions(prisma: PrismaClient) {
  const definition = await requireWorkflowDefinition(prisma);
  return prisma.wodIvcsWorkflowVersion.findMany({
    where: { workflowId: definition.id },
    orderBy: { version: "desc" },
    include: {
      publishedBy: { select: { id: true, name: true, email: true } },
      createdBy: { select: { id: true, name: true, email: true } },
      _count: { select: { steps: true, outcomeRules: true } },
    },
  });
}

export async function createDraftVersion(
  prisma: PrismaClient,
  input: { actorId: string; cloneFromPublished?: boolean; notes?: string }
) {
  const definition = await requireWorkflowDefinition(prisma);

  const existingDraft = await prisma.wodIvcsWorkflowVersion.findFirst({
    where: { workflowId: definition.id, status: "DRAFT" },
  });
  if (existingDraft) {
    throw new WorkflowConfigError(
      "A draft version already exists. Edit or publish it before creating another.",
      409,
      "DRAFT_EXISTS"
    );
  }

  const maxVersion = await prisma.wodIvcsWorkflowVersion.aggregate({
    where: { workflowId: definition.id },
    _max: { version: true },
  });
  const nextVersion = (maxVersion._max.version ?? 0) + 1;

  let sourceVersionId: string | null = null;
  if (input.cloneFromPublished !== false) {
    const published = await prisma.wodIvcsWorkflowVersion.findFirst({
      where: { workflowId: definition.id, status: "PUBLISHED" },
      orderBy: { version: "desc" },
    });
    sourceVersionId = published?.id ?? null;
  }

  const draft = await prisma.$transaction(async (tx) => {
    const created = await tx.wodIvcsWorkflowVersion.create({
      data: {
        workflowId: definition.id,
        version: nextVersion,
        status: "DRAFT",
        notes: input.notes ?? (sourceVersionId ? `Cloned from published v${nextVersion - 1}` : null),
        createdById: input.actorId,
      },
    });

    if (sourceVersionId) {
      const source = await tx.wodIvcsWorkflowVersion.findUnique({
        where: { id: sourceVersionId },
        include: {
          steps: { include: { conditions: true } },
          outcomeRules: true,
        },
      });
      if (source) {
        for (const step of source.steps) {
          const newStep = await tx.wodIvcsWorkflowStep.create({
            data: {
              versionId: created.id,
              slug: step.slug,
              label: step.label,
              helpText: step.helpText,
              fieldType: step.fieldType,
              catalogId: step.catalogId,
              sortOrder: step.sortOrder,
              isRequired: step.isRequired,
              inlineOptionsJson: step.inlineOptionsJson ?? undefined,
              validationRulesJson: step.validationRulesJson ?? undefined,
            },
          });
          for (const cond of step.conditions) {
            await tx.wodIvcsWorkflowStepCondition.create({
              data: {
                stepId: newStep.id,
                dependsOnStepSlug: cond.dependsOnStepSlug,
                operator: cond.operator,
                valueJson: cond.valueJson as Prisma.InputJsonValue,
              },
            });
          }
        }
        for (const rule of source.outcomeRules) {
          await tx.wodIvcsWorkflowOutcomeRule.create({
            data: {
              versionId: created.id,
              priority: rule.priority,
              name: rule.name,
              matchJson: rule.matchJson as Prisma.InputJsonValue,
              targetQueue: rule.targetQueue,
              productivityCreditMode: rule.productivityCreditMode,
              operationalCompletionMode: rule.operationalCompletionMode,
              requiresReplacementOrderNumber: rule.requiresReplacementOrderNumber,
              requiresProcessedReship: rule.requiresProcessedReship,
              requiresItEscalation: rule.requiresItEscalation,
              requiresRetriggerConfirmation: rule.requiresRetriggerConfirmation,
              effectsJson: rule.effectsJson ?? undefined,
              isActive: rule.isActive,
            },
          });
        }
      }
    }

    return created;
  });

  await writeWorkflowConfigAudit(prisma, {
    actorId: input.actorId,
    action: "CREATED",
    entityType: "WORKFLOW_VERSION",
    entityId: draft.id,
    afterJson: { version: draft.version, status: draft.status, clonedFrom: sourceVersionId },
  });

  return getWorkflowVersionGraph(prisma, draft.id);
}

export async function updateDraftVersionMetadata(
  prisma: PrismaClient,
  versionId: string,
  input: { actorId: string; notes?: string | null }
) {
  const before = await requireDraftVersion(prisma, versionId);
  const after = await prisma.wodIvcsWorkflowVersion.update({
    where: { id: versionId },
    data: {
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    },
  });

  await writeWorkflowConfigAudit(prisma, {
    actorId: input.actorId,
    action: "UPDATED",
    entityType: "WORKFLOW_VERSION",
    entityId: versionId,
    beforeJson: { notes: before.notes },
    afterJson: { notes: after.notes },
  });

  return after;
}

export type DraftStepPayload = {
  slug: string;
  label: string;
  helpText?: string | null;
  fieldType: WodIvcsWorkflowStepFieldType;
  catalogId?: string | null;
  sortOrder: number;
  isRequired?: boolean;
  inlineOptionsJson?: unknown;
  validationRulesJson?: unknown;
  conditions?: Array<{
    dependsOnStepSlug: string;
    operator: import("@prisma/client").WodIvcsWorkflowConditionOperator;
    valueJson: unknown;
  }>;
};

export async function replaceDraftSteps(
  prisma: PrismaClient,
  versionId: string,
  steps: DraftStepPayload[],
  actorId: string
) {
  await requireDraftVersion(prisma, versionId);

  const slugs = steps.map((s) => s.slug.trim());
  const unique = new Set(slugs);
  if (unique.size !== slugs.length) {
    throw new WorkflowConfigError("Step slugs must be unique", 400, "DUPLICATE_SLUG");
  }

  const slugSet = new Set(slugs);
  for (const step of steps) {
    for (const cond of step.conditions ?? []) {
      if (!slugSet.has(cond.dependsOnStepSlug)) {
        throw new WorkflowConfigError(
          `Condition references unknown step slug "${cond.dependsOnStepSlug}"`,
          400,
          "INVALID_CONDITION"
        );
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.wodIvcsWorkflowStep.deleteMany({ where: { versionId } });
    for (const step of steps) {
      const created = await tx.wodIvcsWorkflowStep.create({
        data: {
          versionId,
          slug: step.slug.trim(),
          label: step.label.trim(),
          helpText: step.helpText ?? null,
          fieldType: step.fieldType,
          catalogId: step.catalogId ?? null,
          sortOrder: step.sortOrder,
          isRequired: step.isRequired ?? false,
          inlineOptionsJson:
            step.inlineOptionsJson === undefined
              ? undefined
              : (step.inlineOptionsJson as Prisma.InputJsonValue),
          validationRulesJson:
            step.validationRulesJson === undefined
              ? undefined
              : (step.validationRulesJson as Prisma.InputJsonValue),
        },
      });
      for (const cond of step.conditions ?? []) {
        await tx.wodIvcsWorkflowStepCondition.create({
          data: {
            stepId: created.id,
            dependsOnStepSlug: cond.dependsOnStepSlug,
            operator: cond.operator,
            valueJson: cond.valueJson as Prisma.InputJsonValue,
          },
        });
      }
    }
  });

  await writeWorkflowConfigAudit(prisma, {
    actorId,
    action: "UPDATED",
    entityType: "WORKFLOW_STEPS",
    entityId: versionId,
    afterJson: { stepCount: steps.length, slugs },
  });

  return getWorkflowVersionGraph(prisma, versionId);
}

export type DraftOutcomeRulePayload = {
  priority: number;
  name: string;
  matchJson: unknown;
  targetQueue: string;
  productivityCreditMode?: import("@prisma/client").WodIvcsProductivityCreditMode;
  operationalCompletionMode?: import("@prisma/client").WodIvcsOperationalCompletionMode;
  requiresReplacementOrderNumber?: boolean;
  requiresProcessedReship?: boolean;
  requiresItEscalation?: boolean;
  requiresRetriggerConfirmation?: boolean;
  effectsJson?: unknown;
  isActive?: boolean;
};

export async function replaceDraftOutcomeRules(
  prisma: PrismaClient,
  versionId: string,
  rules: DraftOutcomeRulePayload[],
  actorId: string
) {
  await requireDraftVersion(prisma, versionId);

  const graph = await getWorkflowVersionGraph(prisma, versionId);
  const stepSlugs = new Set(graph.version.steps.map((s) => s.slug));
  const priorities = new Set<number>();

  for (const rule of rules) {
    if (priorities.has(rule.priority)) {
      throw new WorkflowConfigError(
        `Duplicate outcome rule priority ${rule.priority}`,
        400,
        "DUPLICATE_PRIORITY"
      );
    }
    priorities.add(rule.priority);

    if (!OPERATIONAL_QUEUES.has(rule.targetQueue)) {
      throw new WorkflowConfigError(`Invalid targetQueue: ${rule.targetQueue}`, 400, "INVALID_QUEUE");
    }

    const matchResult = validateMatchJson(rule.matchJson);
    if (!matchResult.ok) {
      throw new WorkflowConfigError(matchResult.errors.join("; "), 400, "INVALID_MATCH_JSON");
    }

    for (const clause of matchResult.matchJson.clauses ?? []) {
      if (!stepSlugs.has(clause.stepSlug)) {
        throw new WorkflowConfigError(
          `Outcome rule "${rule.name}" references unknown step "${clause.stepSlug}"`,
          400,
          "INVALID_MATCH_STEP"
        );
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.wodIvcsWorkflowOutcomeRule.deleteMany({ where: { versionId } });
    for (const rule of rules) {
      const matchResult = validateMatchJson(rule.matchJson);
      await tx.wodIvcsWorkflowOutcomeRule.create({
        data: {
          versionId,
          priority: rule.priority,
          name: rule.name.trim(),
          matchJson: matchResult.matchJson as Prisma.InputJsonValue,
          targetQueue: rule.targetQueue as WodIvcsOperationalQueue,
          productivityCreditMode: rule.productivityCreditMode ?? "NONE",
          operationalCompletionMode: rule.operationalCompletionMode ?? "REMAIN_OPEN",
          requiresReplacementOrderNumber: rule.requiresReplacementOrderNumber ?? false,
          requiresProcessedReship: rule.requiresProcessedReship ?? false,
          requiresItEscalation: rule.requiresItEscalation ?? false,
          requiresRetriggerConfirmation: rule.requiresRetriggerConfirmation ?? false,
          effectsJson:
            rule.effectsJson === undefined
              ? undefined
              : (rule.effectsJson as Prisma.InputJsonValue),
          isActive: rule.isActive ?? true,
        },
      });
    }
  });

  await writeWorkflowConfigAudit(prisma, {
    actorId,
    action: "UPDATED",
    entityType: "WORKFLOW_OUTCOME_RULES",
    entityId: versionId,
    afterJson: { ruleCount: rules.length },
  });

  return getWorkflowVersionGraph(prisma, versionId);
}

export async function validateWorkflowVersion(prisma: PrismaClient, versionId: string) {
  const graph = await getWorkflowVersionGraph(prisma, versionId);
  const errors: string[] = [];
  const warnings: string[] = [];

  const { version } = graph;
  const steps = version.steps;
  const rules = version.outcomeRules.filter((r) => r.isActive);

  if (steps.length === 0) {
    errors.push("Workflow version has no steps.");
  }

  const slugs = steps.map((s) => s.slug);
  const slugSet = new Set(slugs);
  if (slugSet.size !== slugs.length) {
    errors.push("Step slugs must be unique.");
  }

  for (const required of CORE_STEP_SLUGS) {
    if (!slugSet.has(required)) {
      errors.push(`Missing required core step: ${required}`);
    }
  }

  for (const step of steps) {
    for (const cond of step.conditions) {
      if (!slugSet.has(cond.dependsOnStepSlug)) {
        errors.push(
          `Step "${step.slug}" condition references unknown slug "${cond.dependsOnStepSlug}"`
        );
      }
    }
  }

  if (rules.length === 0) {
    errors.push("At least one active outcome rule is required.");
  }

  const priorities = new Set(rules.map((r) => r.priority));
  if (priorities.size !== rules.length) {
    errors.push("Outcome rule priorities must be unique.");
  }

  for (const rule of rules) {
    if (!OPERATIONAL_QUEUES.has(rule.targetQueue)) {
      errors.push(`Rule "${rule.name}" has invalid targetQueue.`);
    }
    const matchResult = validateMatchJson(rule.matchJson);
    if (!matchResult.ok) {
      errors.push(...matchResult.errors.map((e) => `Rule "${rule.name}": ${e}`));
    } else {
      for (const clause of matchResult.matchJson.clauses ?? []) {
        if (!slugSet.has(clause.stepSlug)) {
          errors.push(`Rule "${rule.name}" references unknown step "${clause.stepSlug}"`);
        }
      }
    }
  }

  const catchAll = rules.some((r) => {
    const mj = loadMatchJson(r.matchJson);
    return (mj.clauses ?? []).length === 0;
  });
  if (!catchAll) {
    warnings.push("No catch-all outcome rule (empty matchJson.clauses) — engine will use fallback.");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    versionId,
    status: version.status,
  };
}

export async function simulateWorkflowVersion(
  prisma: PrismaClient,
  versionId: string,
  answers: Record<string, unknown>
) {
  const graph = await getWorkflowVersionGraph(prisma, versionId);
  const stepInputs = toStepInputs(
    graph.version.steps.map((s) => ({
      slug: s.slug,
      label: s.label,
      fieldType: s.fieldType,
      sortOrder: s.sortOrder,
      isRequired: s.isRequired,
      conditions: s.conditions,
    }))
  );

  const workflowAnswers: WorkflowAnswers = answers;
  const validation = validateAnswers(stepInputs, workflowAnswers);

  const visibleSteps = stepInputs
    .filter((s) => evaluateStepConditions(s, workflowAnswers))
    .map((s) => s.slug);

  const ruleInputs: WorkflowOutcomeRuleInput[] = graph.version.outcomeRules.map((r) => ({
    priority: r.priority,
    name: r.name,
    matchJson: loadMatchJson(r.matchJson),
    targetQueue: r.targetQueue,
    productivityCreditMode: r.productivityCreditMode,
    operationalCompletionMode: r.operationalCompletionMode,
    requiresReplacementOrderNumber: r.requiresReplacementOrderNumber,
    requiresProcessedReship: r.requiresProcessedReship,
    requiresItEscalation: r.requiresItEscalation,
    requiresRetriggerConfirmation: r.requiresRetriggerConfirmation,
    effectsJson: r.effectsJson as Record<string, unknown> | null,
    isActive: r.isActive,
  }));

  const matched = resolveOutcomeRule(ruleInputs, workflowAnswers);

  return {
    validation,
    visibleSteps,
    matchedRule: {
      name: matched.name,
      priority: matched.priority,
      matchedBy: matched.matchedBy,
      targetQueue: matched.targetQueue,
      operationalCompletionMode: matched.operationalCompletionMode,
      productivityCreditMode: matched.productivityCreditMode,
      requiresReplacementOrderNumber: matched.requiresReplacementOrderNumber,
      requiresProcessedReship: matched.requiresProcessedReship,
      requiresItEscalation: matched.requiresItEscalation,
      requiresRetriggerConfirmation: matched.requiresRetriggerConfirmation,
      effectsJson: matched.effectsJson ?? null,
    },
  };
}

export async function publishWorkflowVersion(
  prisma: PrismaClient,
  versionId: string,
  actorId: string
) {
  await requireDraftVersion(prisma, versionId);
  const validation = await validateWorkflowVersion(prisma, versionId);
  if (!validation.valid) {
    throw new WorkflowConfigError(
      `Cannot publish: ${validation.errors.join("; ")}`,
      400,
      "VALIDATION_FAILED"
    );
  }

  const draft = await prisma.wodIvcsWorkflowVersion.findUniqueOrThrow({
    where: { id: versionId },
  });

  const published = await prisma.$transaction(async (tx) => {
    await tx.wodIvcsWorkflowVersion.updateMany({
      where: {
        workflowId: draft.workflowId,
        status: "PUBLISHED",
        id: { not: versionId },
      },
      data: { status: "ARCHIVED" },
    });

    return tx.wodIvcsWorkflowVersion.update({
      where: { id: versionId },
      data: {
        status: "PUBLISHED",
        publishedAt: new Date(),
        publishedById: actorId,
      },
    });
  });

  await writeWorkflowConfigAudit(prisma, {
    actorId,
    action: "PUBLISHED",
    entityType: "WORKFLOW_VERSION",
    entityId: versionId,
    afterJson: {
      version: published.version,
      status: published.status,
      publishedAt: published.publishedAt,
    },
    reason: "Workflow version published",
  });

  return getWorkflowVersionGraph(prisma, versionId);
}

export async function getActiveWorkflowGraph(prisma: PrismaClient) {
  const { definition, publishedVersion } = await getActiveWorkflowDefinition(prisma);
  if (!publishedVersion) {
    throw new WorkflowConfigError("No published workflow version", 404, "NO_PUBLISHED_VERSION");
  }
  const graph = await getWorkflowVersionGraph(prisma, publishedVersion.id);
  return { definition, ...graph };
}

export async function listWorkflowAuditLog(
  prisma: PrismaClient,
  filters: {
    action?: string;
    entityType?: string;
    entityId?: string;
    actorId?: string;
    take?: number;
    skip?: number;
  }
) {
  const where: Prisma.WodIvcsWorkflowConfigAuditLogWhereInput = {};
  if (filters.action) {
    where.action = filters.action as WodIvcsWorkflowConfigAuditAction;
  }
  if (filters.entityType) where.entityType = filters.entityType;
  if (filters.entityId) where.entityId = filters.entityId;
  if (filters.actorId) where.actorId = filters.actorId;

  const take = Math.min(Math.max(filters.take ?? 50, 1), 100);
  const skip = Math.max(filters.skip ?? 0, 0);

  const [total, entries] = await Promise.all([
    prisma.wodIvcsWorkflowConfigAuditLog.count({ where }),
    prisma.wodIvcsWorkflowConfigAuditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      skip,
      include: {
        actor: { select: { id: true, name: true, email: true } },
      },
    }),
  ]);

  return { total, entries };
}
