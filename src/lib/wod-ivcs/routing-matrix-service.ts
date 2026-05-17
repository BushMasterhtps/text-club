import {
  Prisma,
  type PrismaClient,
  type WodIvcsOperationalCompletionMode,
  type WodIvcsOperationalQueue,
  type WodIvcsProductivityCreditMode,
  type WodIvcsWorkflowDropOffBehavior,
} from "@prisma/client";
import {
  compileRoutingMatrix,
  computeRoutingMatrixHash,
  type RoutingRuleCompileInput,
  validateRoutingMatrix,
} from "./routing-matrix-compiler";
import {
  getWorkflowVersionGraph,
  listCatalogs,
  requireWorkflowDefinition,
  simulateWorkflowVersion,
  writeWorkflowConfigAudit,
} from "./workflow-config-service";
import {
  evaluateStepConditions,
  loadMatchJson,
  resolveOutcomeRule,
  validateAnswers,
  type WorkflowAnswers,
} from "./workflow-engine";

export class RoutingMatrixError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400,
    public code?: string
  ) {
    super(message);
    this.name = "RoutingMatrixError";
  }
}

const ruleInclude = {
  rootCauseOption: true,
  cashSaleExistsOption: true,
  merchantOption: true,
  fixTypeOption: true,
  subDispositionOptions: { orderBy: { displayOrder: "asc" as const } },
} satisfies Prisma.WodIvcsWorkflowRoutingRuleInclude;

export type RoutingRuleInput = {
  rootCauseOptionId?: string | null;
  cashSaleExistsOptionId?: string | null;
  merchantOptionId?: string | null;
  fixTypeOptionId?: string | null;
  subDispositionRequired?: boolean;
  subDispositionQuestion?: string | null;
  subDispositionOptions?: Array<{ label: string; displayOrder?: number; isActive?: boolean }>;
  requiresRetriggerConfirmation?: boolean;
  requiresItEscalation?: boolean;
  requiresReplacementOrderNumber?: boolean;
  requiresProcessedReship?: boolean;
  itEscalationPrompt?: string | null;
  targetQueue?: WodIvcsOperationalQueue;
  operationalCompletionMode?: WodIvcsOperationalCompletionMode;
  productivityCreditMode?: WodIvcsProductivityCreditMode;
  dropOffBehavior?: WodIvcsWorkflowDropOffBehavior;
  isActive?: boolean;
  label?: string | null;
  metadataJson?: unknown;
};

function slugifyLabel(label: string): string {
  const base = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return base || "option";
}

async function requireDraftVersion(prisma: PrismaClient, versionId: string) {
  const version = await prisma.wodIvcsWorkflowVersion.findUnique({
    where: { id: versionId },
  });
  if (!version) {
    throw new RoutingMatrixError("Workflow version not found", 404, "VERSION_NOT_FOUND");
  }
  if (version.status !== "DRAFT") {
    throw new RoutingMatrixError(
      `Only DRAFT versions can be edited (status: ${version.status})`,
      409,
      "NOT_DRAFT"
    );
  }
  return version;
}

function toCompileInput(
  rule: Prisma.WodIvcsWorkflowRoutingRuleGetPayload<{ include: typeof ruleInclude }>
): RoutingRuleCompileInput {
  return {
    id: rule.id,
    displayOrder: rule.displayOrder,
    isActive: rule.isActive,
    label: rule.label,
    rootCauseOptionId: rule.rootCauseOptionId,
    cashSaleExistsOptionId: rule.cashSaleExistsOptionId,
    merchantOptionId: rule.merchantOptionId,
    fixTypeOptionId: rule.fixTypeOptionId,
    subDispositionRequired: rule.subDispositionRequired,
    subDispositionQuestion: rule.subDispositionQuestion,
    requiresRetriggerConfirmation: rule.requiresRetriggerConfirmation,
    requiresItEscalation: rule.requiresItEscalation,
    requiresReplacementOrderNumber: rule.requiresReplacementOrderNumber,
    requiresProcessedReship: rule.requiresProcessedReship,
    itEscalationPrompt: rule.itEscalationPrompt,
    targetQueue: rule.targetQueue,
    operationalCompletionMode: rule.operationalCompletionMode,
    productivityCreditMode: rule.productivityCreditMode,
    dropOffBehavior: rule.dropOffBehavior,
    metadataJson: rule.metadataJson,
    rootCauseOption: rule.rootCauseOption
      ? { value: rule.rootCauseOption.value, label: rule.rootCauseOption.label }
      : null,
    cashSaleExistsOption: rule.cashSaleExistsOption
      ? { value: rule.cashSaleExistsOption.value, label: rule.cashSaleExistsOption.label }
      : null,
    merchantOption: rule.merchantOption
      ? { value: rule.merchantOption.value, label: rule.merchantOption.label }
      : null,
    fixTypeOption: rule.fixTypeOption
      ? { value: rule.fixTypeOption.value, label: rule.fixTypeOption.label }
      : null,
    subDispositionOptions: rule.subDispositionOptions.map((o) => ({
      label: o.label,
      isActive: o.isActive,
    })),
  };
}

async function buildRuleLabel(
  prisma: PrismaClient,
  input: RoutingRuleInput
): Promise<string> {
  const parts: string[] = [];
  const load = async (id: string | null | undefined) => {
    if (!id) return null;
    const opt = await prisma.wodIvcsWorkflowCatalogOption.findUnique({ where: { id } });
    return opt?.label ?? null;
  };
  const rc = await load(input.rootCauseOptionId);
  const cs = await load(input.cashSaleExistsOptionId);
  const m = await load(input.merchantOptionId);
  const ft = await load(input.fixTypeOptionId);
  if (rc) parts.push(rc);
  if (cs) parts.push(cs);
  if (m) parts.push(m);
  if (ft) parts.push(ft);
  return parts.length > 0 ? parts.join(" · ") : "Routing rule";
}

export async function getRoutingRules(prisma: PrismaClient, versionId: string) {
  const version = await prisma.wodIvcsWorkflowVersion.findUnique({
    where: { id: versionId },
  });
  if (!version) {
    throw new RoutingMatrixError("Workflow version not found", 404, "VERSION_NOT_FOUND");
  }

  const rules = await prisma.wodIvcsWorkflowRoutingRule.findMany({
    where: { versionId },
    orderBy: { displayOrder: "asc" },
    include: ruleInclude,
  });

  return { version, rules };
}

export async function createRoutingRule(
  prisma: PrismaClient,
  versionId: string,
  input: RoutingRuleInput,
  actorId: string
) {
  await requireDraftVersion(prisma, versionId);

  const maxOrder = await prisma.wodIvcsWorkflowRoutingRule.aggregate({
    where: { versionId },
    _max: { displayOrder: true },
  });
  const displayOrder = (maxOrder._max.displayOrder ?? 0) + 10;
  const label = input.label?.trim() || (await buildRuleLabel(prisma, input));

  const rule = await prisma.wodIvcsWorkflowRoutingRule.create({
    data: {
      versionId,
      displayOrder,
      isActive: input.isActive ?? true,
      label,
      rootCauseOptionId: input.rootCauseOptionId ?? null,
      cashSaleExistsOptionId: input.cashSaleExistsOptionId ?? null,
      merchantOptionId: input.merchantOptionId ?? null,
      fixTypeOptionId: input.fixTypeOptionId ?? null,
      subDispositionRequired: input.subDispositionRequired ?? false,
      subDispositionQuestion: input.subDispositionQuestion ?? null,
      requiresRetriggerConfirmation: input.requiresRetriggerConfirmation ?? false,
      requiresItEscalation: input.requiresItEscalation ?? false,
      requiresReplacementOrderNumber: input.requiresReplacementOrderNumber ?? false,
      requiresProcessedReship: input.requiresProcessedReship ?? false,
      itEscalationPrompt: input.itEscalationPrompt ?? null,
      targetQueue: input.targetQueue ?? "NEEDS_ACTION",
      operationalCompletionMode: input.operationalCompletionMode ?? "REMAIN_OPEN",
      productivityCreditMode: input.productivityCreditMode ?? "NONE",
      dropOffBehavior: input.dropOffBehavior ?? "NO_AUTOMATIC_CHANGE",
      metadataJson:
        input.metadataJson === undefined
          ? undefined
          : (input.metadataJson as Prisma.InputJsonValue),
      subDispositionOptions: input.subDispositionOptions?.length
        ? {
            create: input.subDispositionOptions.map((o, i) => ({
              label: o.label.trim(),
              displayOrder: o.displayOrder ?? (i + 1) * 10,
              isActive: o.isActive ?? true,
            })),
          }
        : undefined,
    },
    include: ruleInclude,
  });

  await writeWorkflowConfigAudit(prisma, {
    actorId,
    action: "CREATED",
    entityType: "ROUTING_RULE",
    entityId: rule.id,
    afterJson: { label: rule.label, versionId },
  });

  return rule;
}

export async function updateRoutingRule(
  prisma: PrismaClient,
  ruleId: string,
  input: RoutingRuleInput,
  actorId: string
) {
  const existing = await prisma.wodIvcsWorkflowRoutingRule.findUnique({
    where: { id: ruleId },
    include: ruleInclude,
  });
  if (!existing) {
    throw new RoutingMatrixError("Routing rule not found", 404, "RULE_NOT_FOUND");
  }
  await requireDraftVersion(prisma, existing.versionId);

  const label =
    input.label !== undefined
      ? input.label?.trim() || (await buildRuleLabel(prisma, { ...input, ...existing }))
      : existing.label;

  const updated = await prisma.$transaction(async (tx) => {
    if (input.subDispositionOptions) {
      await tx.wodIvcsWorkflowRoutingSubDispositionOption.deleteMany({
        where: { routingRuleId: ruleId },
      });
      for (let i = 0; i < input.subDispositionOptions.length; i++) {
        const o = input.subDispositionOptions[i];
        await tx.wodIvcsWorkflowRoutingSubDispositionOption.create({
          data: {
            routingRuleId: ruleId,
            label: o.label.trim(),
            displayOrder: o.displayOrder ?? (i + 1) * 10,
            isActive: o.isActive ?? true,
          },
        });
      }
    }

    return tx.wodIvcsWorkflowRoutingRule.update({
      where: { id: ruleId },
      data: {
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        label,
        ...(input.rootCauseOptionId !== undefined
          ? { rootCauseOptionId: input.rootCauseOptionId }
          : {}),
        ...(input.cashSaleExistsOptionId !== undefined
          ? { cashSaleExistsOptionId: input.cashSaleExistsOptionId }
          : {}),
        ...(input.merchantOptionId !== undefined
          ? { merchantOptionId: input.merchantOptionId }
          : {}),
        ...(input.fixTypeOptionId !== undefined
          ? { fixTypeOptionId: input.fixTypeOptionId }
          : {}),
        ...(input.subDispositionRequired !== undefined
          ? { subDispositionRequired: input.subDispositionRequired }
          : {}),
        ...(input.subDispositionQuestion !== undefined
          ? { subDispositionQuestion: input.subDispositionQuestion }
          : {}),
        ...(input.requiresRetriggerConfirmation !== undefined
          ? { requiresRetriggerConfirmation: input.requiresRetriggerConfirmation }
          : {}),
        ...(input.requiresItEscalation !== undefined
          ? { requiresItEscalation: input.requiresItEscalation }
          : {}),
        ...(input.requiresReplacementOrderNumber !== undefined
          ? { requiresReplacementOrderNumber: input.requiresReplacementOrderNumber }
          : {}),
        ...(input.requiresProcessedReship !== undefined
          ? { requiresProcessedReship: input.requiresProcessedReship }
          : {}),
        ...(input.itEscalationPrompt !== undefined
          ? { itEscalationPrompt: input.itEscalationPrompt }
          : {}),
        ...(input.targetQueue !== undefined ? { targetQueue: input.targetQueue } : {}),
        ...(input.operationalCompletionMode !== undefined
          ? { operationalCompletionMode: input.operationalCompletionMode }
          : {}),
        ...(input.productivityCreditMode !== undefined
          ? { productivityCreditMode: input.productivityCreditMode }
          : {}),
        ...(input.dropOffBehavior !== undefined
          ? { dropOffBehavior: input.dropOffBehavior }
          : {}),
        ...(input.metadataJson !== undefined
          ? { metadataJson: input.metadataJson as Prisma.InputJsonValue }
          : {}),
      },
      include: ruleInclude,
    });
  });

  await writeWorkflowConfigAudit(prisma, {
    actorId,
    action: "UPDATED",
    entityType: "ROUTING_RULE",
    entityId: ruleId,
    beforeJson: { label: existing.label },
    afterJson: { label: updated.label },
  });

  return updated;
}

export async function duplicateRoutingRule(
  prisma: PrismaClient,
  ruleId: string,
  actorId: string
) {
  const source = await prisma.wodIvcsWorkflowRoutingRule.findUnique({
    where: { id: ruleId },
    include: ruleInclude,
  });
  if (!source) {
    throw new RoutingMatrixError("Routing rule not found", 404, "RULE_NOT_FOUND");
  }
  await requireDraftVersion(prisma, source.versionId);

  return createRoutingRule(
    prisma,
    source.versionId,
    {
      rootCauseOptionId: source.rootCauseOptionId,
      cashSaleExistsOptionId: source.cashSaleExistsOptionId,
      merchantOptionId: source.merchantOptionId,
      fixTypeOptionId: source.fixTypeOptionId,
      subDispositionRequired: source.subDispositionRequired,
      subDispositionQuestion: source.subDispositionQuestion,
      subDispositionOptions: source.subDispositionOptions.map((o) => ({
        label: o.label,
        displayOrder: o.displayOrder,
        isActive: o.isActive,
      })),
      requiresRetriggerConfirmation: source.requiresRetriggerConfirmation,
      requiresItEscalation: source.requiresItEscalation,
      requiresReplacementOrderNumber: source.requiresReplacementOrderNumber,
      requiresProcessedReship: source.requiresProcessedReship,
      itEscalationPrompt: source.itEscalationPrompt,
      targetQueue: source.targetQueue,
      operationalCompletionMode: source.operationalCompletionMode,
      productivityCreditMode: source.productivityCreditMode,
      dropOffBehavior: source.dropOffBehavior,
      metadataJson: source.metadataJson,
      label: source.label ? `${source.label} (copy)` : undefined,
    },
    actorId
  );
}

export async function moveRoutingRule(
  prisma: PrismaClient,
  ruleId: string,
  direction: "up" | "down",
  actorId: string
) {
  const rule = await prisma.wodIvcsWorkflowRoutingRule.findUnique({ where: { id: ruleId } });
  if (!rule) {
    throw new RoutingMatrixError("Routing rule not found", 404, "RULE_NOT_FOUND");
  }
  await requireDraftVersion(prisma, rule.versionId);

  const rules = await prisma.wodIvcsWorkflowRoutingRule.findMany({
    where: { versionId: rule.versionId },
    orderBy: { displayOrder: "asc" },
  });
  const idx = rules.findIndex((r) => r.id === ruleId);
  if (idx < 0) throw new RoutingMatrixError("Rule not in version", 400);

  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= rules.length) {
    return prisma.wodIvcsWorkflowRoutingRule.findUnique({
      where: { id: ruleId },
      include: ruleInclude,
    });
  }

  const a = rules[idx];
  const b = rules[swapIdx];

  await prisma.$transaction([
    prisma.wodIvcsWorkflowRoutingRule.update({
      where: { id: a.id },
      data: { displayOrder: b.displayOrder },
    }),
    prisma.wodIvcsWorkflowRoutingRule.update({
      where: { id: b.id },
      data: { displayOrder: a.displayOrder },
    }),
  ]);

  await writeWorkflowConfigAudit(prisma, {
    actorId,
    action: "UPDATED",
    entityType: "ROUTING_RULE",
    entityId: ruleId,
    afterJson: { moved: direction },
  });

  return getRoutingRules(prisma, rule.versionId);
}

export async function deactivateRoutingRule(
  prisma: PrismaClient,
  ruleId: string,
  actorId: string
) {
  return updateRoutingRule(prisma, ruleId, { isActive: false }, actorId);
}

async function loadCompileContext(prisma: PrismaClient, versionId: string) {
  const rules = await prisma.wodIvcsWorkflowRoutingRule.findMany({
    where: { versionId },
    orderBy: { displayOrder: "asc" },
    include: ruleInclude,
  });
  const compileInputs = rules.map(toCompileInput);
  const catalogs = await prisma.wodIvcsWorkflowCatalog.findMany();
  const catalogsBySlug = new Map(
    catalogs.map((c) => [c.slug, { id: c.id, slug: c.slug, groupKey: c.groupKey, catalogType: c.catalogType }])
  );
  return { rules, compileInputs, catalogsBySlug };
}

export async function validateRoutingMatrixVersion(prisma: PrismaClient, versionId: string) {
  const version = await prisma.wodIvcsWorkflowVersion.findUnique({
    where: { id: versionId },
  });
  if (!version) {
    throw new RoutingMatrixError("Workflow version not found", 404, "VERSION_NOT_FOUND");
  }
  const { compileInputs } = await loadCompileContext(prisma, versionId);
  return { versionId, ...validateRoutingMatrix(compileInputs) };
}

export async function compileRoutingMatrixVersion(
  prisma: PrismaClient,
  versionId: string,
  actorId: string
) {
  await requireDraftVersion(prisma, versionId);
  const validation = await validateRoutingMatrixVersion(prisma, versionId);
  if (!validation.valid) {
    throw new RoutingMatrixError(
      `Cannot compile: ${validation.errors.join("; ")}`,
      400,
      "VALIDATION_FAILED"
    );
  }

  const { rules, compileInputs, catalogsBySlug } = await loadCompileContext(prisma, versionId);
  const compiled = compileRoutingMatrix(compileInputs, catalogsBySlug);
  const hash = computeRoutingMatrixHash(compileInputs);

  await prisma.$transaction(async (tx) => {
    await tx.wodIvcsWorkflowStepCondition.deleteMany({
      where: { step: { versionId } },
    });
    await tx.wodIvcsWorkflowStep.deleteMany({ where: { versionId } });
    await tx.wodIvcsWorkflowOutcomeRule.deleteMany({ where: { versionId } });

    for (const step of compiled.steps) {
      const created = await tx.wodIvcsWorkflowStep.create({
        data: {
          versionId,
          slug: step.slug,
          label: step.label,
          helpText: step.helpText ?? null,
          fieldType: step.fieldType,
          catalogId: step.catalogId,
          sortOrder: step.sortOrder,
          isRequired: step.isRequired,
        },
      });
      for (const cond of step.conditions) {
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

    for (const rule of compiled.outcomeRules) {
      await tx.wodIvcsWorkflowOutcomeRule.create({
        data: {
          versionId,
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
          effectsJson: rule.effectsJson as Prisma.InputJsonValue,
          isActive: rule.isActive,
        },
      });
      await tx.wodIvcsWorkflowRoutingRule.update({
        where: { id: rule.routingRuleId },
        data: { compiledOutcomeRulePriority: rule.priority },
      });
    }

    await tx.wodIvcsWorkflowVersion.update({
      where: { id: versionId },
      data: {
        compiledAt: new Date(),
        routingMatrixHash: hash,
      },
    });
  });

  await writeWorkflowConfigAudit(prisma, {
    actorId,
    action: "UPDATED",
    entityType: "ROUTING_MATRIX",
    entityId: versionId,
    afterJson: {
      stepCount: compiled.steps.length,
      outcomeRuleCount: compiled.outcomeRules.length,
      routingMatrixHash: hash,
    },
    reason: "Routing matrix compiled to workflow steps and outcome rules",
  });

  return {
    validation,
    compiled: {
      stepCount: compiled.steps.length,
      outcomeRuleCount: compiled.outcomeRules.length,
    },
    routingMatrixHash: hash,
    graph: await getWorkflowVersionGraph(prisma, versionId),
  };
}

export async function publishRoutingMatrixVersion(
  prisma: PrismaClient,
  versionId: string,
  actorId: string
) {
  await compileRoutingMatrixVersion(prisma, versionId, actorId);

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
      routingMatrixHash: published.routingMatrixHash,
    },
    reason: "Routing matrix version published",
  });

  return getWorkflowVersionGraph(prisma, versionId);
}

export async function previewAgentFlow(
  prisma: PrismaClient,
  versionId: string,
  input: { routingRuleId?: string; answers?: Record<string, unknown> }
) {
  const { rules, compileInputs, catalogsBySlug } = await loadCompileContext(prisma, versionId);
  const rule = input.routingRuleId
    ? rules.find((r) => r.id === input.routingRuleId)
    : rules.find((r) => r.isActive);

  if (!rule) {
    throw new RoutingMatrixError("Routing rule not found", 404, "RULE_NOT_FOUND");
  }

  let answers: WorkflowAnswers = input.answers ?? {};
  if (!input.answers && rule.rootCauseOption) {
    answers = {
      root_cause: rule.rootCauseOption.value,
      ...(rule.cashSaleExistsOption
        ? { cash_sale_exists: rule.cashSaleExistsOption.value }
        : {}),
      ...(rule.merchantOption ? { merchant: rule.merchantOption.value } : {}),
      ...(rule.fixTypeOption ? { fix_type: rule.fixTypeOption.value } : {}),
    };
  }

  const validation = validateRoutingMatrix(compileInputs);
  const dryCompiled = compileRoutingMatrix(compileInputs, catalogsBySlug);

  const version = await prisma.wodIvcsWorkflowVersion.findUnique({
    where: { id: versionId },
  });
  const stepCount = await prisma.wodIvcsWorkflowStep.count({ where: { versionId } });

  let simulation;
  if (stepCount > 0) {
    simulation = await simulateWorkflowVersion(prisma, versionId, answers);
  } else {
    const ruleInputs = dryCompiled.outcomeRules.map((r) => ({
      priority: r.priority,
      name: r.name,
      matchJson: r.matchJson,
      targetQueue: r.targetQueue,
      productivityCreditMode: r.productivityCreditMode,
      operationalCompletionMode: r.operationalCompletionMode,
      requiresReplacementOrderNumber: r.requiresReplacementOrderNumber,
      requiresProcessedReship: r.requiresProcessedReship,
      requiresItEscalation: r.requiresItEscalation,
      requiresRetriggerConfirmation: r.requiresRetriggerConfirmation,
      effectsJson: r.effectsJson,
      isActive: r.isActive,
    }));
    const stepInputs = dryCompiled.steps.map((s) => ({
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
    const val = validateAnswers(stepInputs, answers);
    const visibleSteps = stepInputs
      .filter((s) => evaluateStepConditions(s, answers))
      .map((s) => s.slug);
    const matched = resolveOutcomeRule(
      ruleInputs.map((r) => ({ ...r, matchJson: loadMatchJson(r.matchJson) })),
      answers
    );
    simulation = {
      validation: val,
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

  return {
    routingRule: rule,
    answers,
    validation,
    dryCompile: {
      stepCount: dryCompiled.steps.length,
      outcomeRuleCount: dryCompiled.outcomeRules.length,
    },
    simulation,
    dropOffBehavior: rule.dropOffBehavior,
    versionStatus: version?.status,
  };
}

/** Backfill catalog workflowDefinitionId, groupKey, displayOrder from catalogType. */
export async function backfillCatalogDispositionGroups(prisma: PrismaClient) {
  const definition = await requireWorkflowDefinition(prisma);
  const typeToGroup: Record<string, { groupKey: string; displayOrder: number }> = {
    ROOT_CAUSE: { groupKey: "root_cause", displayOrder: 10 },
    CASH_SALE_EXISTS: { groupKey: "cash_sale_exists", displayOrder: 20 },
    MERCHANT: { groupKey: "merchant", displayOrder: 30 },
    FIX_TYPE: { groupKey: "fix_type", displayOrder: 40 },
  };

  const catalogs = await prisma.wodIvcsWorkflowCatalog.findMany();
  for (const catalog of catalogs) {
    const meta = typeToGroup[catalog.catalogType];
    await prisma.wodIvcsWorkflowCatalog.update({
      where: { id: catalog.id },
      data: {
        workflowDefinitionId: definition.id,
        groupKey: catalog.groupKey ?? meta?.groupKey ?? catalog.slug.replace(/-/g, "_"),
        displayOrder: catalog.displayOrder || meta?.displayOrder || 0,
      },
    });
  }
}

export async function listDispositionGroups(prisma: PrismaClient) {
  await backfillCatalogDispositionGroups(prisma);
  const catalogs = await listCatalogs(prisma);
  return catalogs.map((c) => ({
    id: c.id,
    groupKey: c.groupKey ?? c.slug.replace(/-/g, "_"),
    displayName: c.displayName,
    catalogType: c.catalogType,
    displayOrder: c.displayOrder,
    isActive: c.isActive,
    optionCount: c._count?.options ?? c.options.length,
  }));
}

export async function getDispositionGroup(prisma: PrismaClient, groupKey: string) {
  await backfillCatalogDispositionGroups(prisma);
  const normalized = groupKey.trim().toLowerCase().replace(/-/g, "_");
  const catalog = await prisma.wodIvcsWorkflowCatalog.findFirst({
    where: {
      OR: [{ groupKey: normalized }, { slug: groupKey.replace(/_/g, "-") }],
    },
    include: {
      options: { orderBy: [{ sortOrder: "asc" }, { label: "asc" }] },
    },
  });
  if (!catalog) {
    throw new RoutingMatrixError(`Disposition group not found: ${groupKey}`, 404, "GROUP_NOT_FOUND");
  }
  return {
    id: catalog.id,
    groupKey: catalog.groupKey ?? normalized,
    displayName: catalog.displayName,
    catalogType: catalog.catalogType,
    options: catalog.options,
  };
}

export { slugifyLabel };
