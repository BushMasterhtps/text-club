import type {
  Prisma,
  PrismaClient,
  WodIvcsActionType,
  WodIvcsOperationalQueue,
  WodIvcsWorkflowRoutingRule,
} from "@prisma/client";
import { isWodIvcsV2Enabled } from "./feature-flag";
import {
  getFollowUpQuestionsForRule,
  type FollowUpQuestion,
} from "./follow-up-questions";
import { getRoutingRules } from "./routing-matrix-service";
import { getActiveWorkflowDefinition, simulateWorkflowVersion } from "./workflow-config-service";
import { type WorkflowAnswers } from "./workflow-engine";

const TERMINAL_QUEUES: WodIvcsOperationalQueue[] = ["COMPLETED", "ARCHIVED"];
const DROP_OFF_DURATION_MS = 48 * 60 * 60 * 1000;

const ruleInclude = {
  rootCauseOption: true,
  cashSaleExistsOption: true,
  merchantOption: true,
  fixTypeOption: true,
  subDispositionOptions: { orderBy: { displayOrder: "asc" as const } },
} as const;

type RoutingRuleWithOptions = WodIvcsWorkflowRoutingRule & {
  rootCauseOption: { value: string; label: string } | null;
  cashSaleExistsOption: { value: string; label: string } | null;
  merchantOption: { value: string; label: string } | null;
  fixTypeOption: { value: string; label: string } | null;
  subDispositionOptions: Array<{ label: string; isActive: boolean }>;
};

export class AgentWorkflowError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400,
    public code?: string
  ) {
    super(message);
    this.name = "AgentWorkflowError";
  }
}

export type WodIvcsOrderSummary = {
  id: string;
  documentNumber: string;
  operationalQueue: WodIvcsOperationalQueue;
  operationalStatus: string;
  assignedToId: string | null;
  activeWorkflowVersionId: string | null;
  workStartedAt: Date | null;
  workStartedById: string | null;
};

export type MatchedRoutingRuleSummary = {
  id: string;
  label: string | null;
  targetQueue: WodIvcsOperationalQueue;
  requiresRetriggerConfirmation: boolean;
  requiresItEscalation: boolean;
  requiresReplacementOrderNumber: boolean;
  requiresProcessedReship: boolean;
  followUpQuestions: FollowUpQuestion[];
};

export type MatchedOutcomeSummary = {
  name: string;
  priority: number;
  matchedBy: string;
  targetQueue: WodIvcsOperationalQueue;
  operationalCompletionMode: string;
  requiresReplacementOrderNumber: boolean;
  requiresProcessedReship: boolean;
  requiresItEscalation: boolean;
  requiresRetriggerConfirmation: boolean;
};

function isCatchAllRoutingRule(rule: {
  rootCauseOptionId: string | null;
  fixTypeOptionId: string | null;
  metadataJson: unknown;
}): boolean {
  const meta =
    rule.metadataJson && typeof rule.metadataJson === "object"
      ? (rule.metadataJson as Record<string, unknown>)
      : {};
  if (meta.isCatchAll === true) return true;
  return !rule.rootCauseOptionId && !rule.fixTypeOptionId;
}

function assertV2Enabled() {
  if (!isWodIvcsV2Enabled()) {
    throw new AgentWorkflowError("WOD/IVCS v2 is not enabled", 503, "V2_DISABLED");
  }
}

function toOrderSummary(order: {
  id: string;
  documentNumber: string;
  operationalQueue: WodIvcsOperationalQueue;
  operationalStatus: string;
  assignedToId: string | null;
  activeWorkflowVersionId: string | null;
  workStartedAt: Date | null;
  workStartedById: string | null;
}): WodIvcsOrderSummary {
  return {
    id: order.id,
    documentNumber: order.documentNumber,
    operationalQueue: order.operationalQueue,
    operationalStatus: order.operationalStatus,
    assignedToId: order.assignedToId,
    activeWorkflowVersionId: order.activeWorkflowVersionId,
    workStartedAt: order.workStartedAt,
    workStartedById: order.workStartedById,
  };
}

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

function ruleMatchesCorePath(rule: RoutingRuleWithOptions, answers: WorkflowAnswers): boolean {
  if (isCatchAllRoutingRule(rule)) return false;

  const dimensions: Array<[keyof WorkflowAnswers, string | undefined]> = [
    ["root_cause", rule.rootCauseOption?.value],
    ["cash_sale_exists", rule.cashSaleExistsOption?.value],
    ["merchant", rule.merchantOption?.value],
    ["fix_type", rule.fixTypeOption?.value],
  ];

  for (const [slug, expected] of dimensions) {
    if (!expected) continue;
    const actual = normalizeAnswerValue(answers[slug]);
    if (isEmptyAnswer(actual)) return false;
    const actualList = Array.isArray(actual) ? actual : [actual];
    if (!actualList.includes(expected)) return false;
  }

  return Boolean(rule.rootCauseOption?.value && rule.fixTypeOption?.value);
}

export function findMatchingRoutingRule(
  rules: RoutingRuleWithOptions[],
  answers: WorkflowAnswers
): RoutingRuleWithOptions | null {
  const active = rules.filter((r) => r.isActive).sort((a, b) => a.displayOrder - b.displayOrder);
  const specific = active.find((r) => ruleMatchesCorePath(r, answers));
  if (specific) return specific;
  const catchAll = active.find((r) => isCatchAllRoutingRule(r));
  return catchAll ?? null;
}

function followUpAnswerKey(questionId: string): string {
  return `follow_up.${questionId}`;
}

function followUpNotesKey(questionId: string): string {
  return `follow_up.${questionId}_notes`;
}

function isFollowUpQuestionVisible(question: FollowUpQuestion, answers: WorkflowAnswers): boolean {
  if (!question.showWhen?.questionId) return true;
  const priorKey = followUpAnswerKey(question.showWhen.questionId);
  const prior = normalizeAnswerValue(answers[priorKey] ?? answers.sub_disposition);
  const priorList = prior === null ? [] : Array.isArray(prior) ? prior : [prior];
  return priorList.includes(question.showWhen.value);
}

export function validateFollowUpAnswers(
  questions: FollowUpQuestion[],
  answers: WorkflowAnswers,
  contextLabel: string
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    if (!isFollowUpQuestionVisible(q, answers)) continue;

    const key = followUpAnswerKey(q.id);
    const raw = answers[key];
    const normalized = normalizeAnswerValue(raw);

    if (q.required && isEmptyAnswer(normalized)) {
      errors.push(`${contextLabel}: follow-up "${q.question.trim() || q.id}" is required.`);
      continue;
    }

    if (isEmptyAnswer(normalized)) continue;

    if (q.type === "single_select" || q.type === "multi_select") {
      const selected = Array.isArray(normalized) ? normalized : [normalized];
      for (const label of selected) {
        const opt = q.options.find((o) => o.label === label);
        if (opt?.requiresNotes) {
          const notes = answers[followUpNotesKey(q.id)];
          const notesNorm = normalizeAnswerValue(notes);
          if (isEmptyAnswer(notesNorm)) {
            errors.push(
              `${contextLabel}: notes are required when "${label}" is selected for "${q.question.trim() || q.id}".`
            );
          }
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

function toMatchedRoutingRuleSummary(rule: RoutingRuleWithOptions): MatchedRoutingRuleSummary {
  return {
    id: rule.id,
    label: rule.label,
    targetQueue: rule.targetQueue,
    requiresRetriggerConfirmation: rule.requiresRetriggerConfirmation,
    requiresItEscalation: rule.requiresItEscalation,
    requiresReplacementOrderNumber: rule.requiresReplacementOrderNumber,
    requiresProcessedReship: rule.requiresProcessedReship,
    followUpQuestions: getFollowUpQuestionsForRule({
      metadataJson: rule.metadataJson,
      subDispositionRequired: rule.subDispositionRequired,
      subDispositionQuestion: rule.subDispositionQuestion,
      subDispositionOptions: rule.subDispositionOptions,
    }),
  };
}

async function writeOrderAuditEvent(
  tx: Prisma.TransactionClient,
  input: {
    orderId: string;
    actorId: string;
    actionType: WodIvcsActionType;
    fromQueue: WodIvcsOperationalQueue | null;
    toQueue: WodIvcsOperationalQueue | null;
    payloadJson: Prisma.InputJsonValue;
  }
) {
  await tx.wodIvcsActionEvent.create({
    data: {
      orderId: input.orderId,
      actorId: input.actorId,
      actionType: input.actionType,
      fromQueue: input.fromQueue ?? undefined,
      toQueue: input.toQueue ?? undefined,
      payloadJson: input.payloadJson,
    },
  });
}

async function loadOrderForAgent(prisma: PrismaClient, orderId: string) {
  const order = await prisma.wodIvcsOrder.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      documentNumber: true,
      operationalQueue: true,
      operationalStatus: true,
      assignedToId: true,
      activeWorkflowVersionId: true,
      workStartedAt: true,
      workStartedById: true,
      archivedAt: true,
    },
  });
  if (!order) {
    throw new AgentWorkflowError("Order not found", 404, "ORDER_NOT_FOUND");
  }
  return order;
}

function assertAssignee(order: { assignedToId: string | null }, actorId: string) {
  if (order.assignedToId !== actorId) {
    throw new AgentWorkflowError("Order is not assigned to you", 403, "NOT_ASSIGNED_TO_ACTOR");
  }
}

async function resolveWorkflowVersionId(
  prisma: PrismaClient,
  order: { activeWorkflowVersionId: string | null }
): Promise<{ versionId: string; routingMatrixHash: string | null }> {
  if (order.activeWorkflowVersionId) {
    const version = await prisma.wodIvcsWorkflowVersion.findUnique({
      where: { id: order.activeWorkflowVersionId },
      select: { id: true, routingMatrixHash: true, status: true },
    });
    if (version) {
      return { versionId: version.id, routingMatrixHash: version.routingMatrixHash };
    }
  }

  const { publishedVersion } = await getActiveWorkflowDefinition(prisma);
  if (!publishedVersion) {
    throw new AgentWorkflowError("No published workflow version", 503, "NO_PUBLISHED_VERSION");
  }
  return {
    versionId: publishedVersion.id,
    routingMatrixHash: publishedVersion.routingMatrixHash,
  };
}

async function runWorkflowSimulation(
  prisma: PrismaClient,
  versionId: string,
  answers: WorkflowAnswers
) {
  const stepCount = await prisma.wodIvcsWorkflowStep.count({ where: { versionId } });
  if (stepCount === 0) {
    throw new AgentWorkflowError(
      "Workflow version has no compiled steps; publish routing matrix first",
      409,
      "WORKFLOW_NOT_COMPILED"
    );
  }
  return simulateWorkflowVersion(prisma, versionId, answers);
}

export async function startAgentWodIvcsWork(
  prisma: PrismaClient,
  input: { orderId: string; actorId: string }
) {
  assertV2Enabled();

  const order = await loadOrderForAgent(prisma, input.orderId);

  if (TERMINAL_QUEUES.includes(order.operationalQueue)) {
    throw new AgentWorkflowError(
      `Cannot start work on orders in ${order.operationalQueue}`,
      409,
      "TERMINAL_QUEUE"
    );
  }

  if (order.assignedToId !== input.actorId) {
    throw new AgentWorkflowError("Order is not assigned to you", 403, "NOT_ASSIGNED_TO_ACTOR");
  }

  if (order.operationalQueue === "IN_PROGRESS") {
    return {
      order: toOrderSummary(order),
      workflowVersionId: order.activeWorkflowVersionId,
      idempotent: true as const,
    };
  }

  if (order.operationalQueue !== "ASSIGNED") {
    throw new AgentWorkflowError(
      `Order must be in ASSIGNED to start (current: ${order.operationalQueue})`,
      409,
      "INVALID_QUEUE_FOR_START"
    );
  }

  const { publishedVersion } = await getActiveWorkflowDefinition(prisma);
  if (!publishedVersion) {
    throw new AgentWorkflowError("No published workflow version", 503, "NO_PUBLISHED_VERSION");
  }

  const now = new Date();
  const fromQueue = order.operationalQueue;

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.wodIvcsOrder.update({
      where: { id: input.orderId },
      data: {
        operationalQueue: "IN_PROGRESS",
        activeWorkflowVersionId: publishedVersion.id,
        workStartedAt: order.workStartedAt ?? now,
        workStartedById: input.actorId,
      },
      select: {
        id: true,
        documentNumber: true,
        operationalQueue: true,
        operationalStatus: true,
        assignedToId: true,
        activeWorkflowVersionId: true,
        workStartedAt: true,
        workStartedById: true,
      },
    });

    await writeOrderAuditEvent(tx, {
      orderId: input.orderId,
      actorId: input.actorId,
      actionType: "AGENT_WORK_STARTED",
      fromQueue,
      toQueue: "IN_PROGRESS",
      payloadJson: {
        workflowVersionId: publishedVersion.id,
        routingMatrixHash: publishedVersion.routingMatrixHash,
        documentNumber: order.documentNumber,
      },
    });

    if (fromQueue !== "IN_PROGRESS") {
      await writeOrderAuditEvent(tx, {
        orderId: input.orderId,
        actorId: input.actorId,
        actionType: "QUEUE_CHANGED",
        fromQueue,
        toQueue: "IN_PROGRESS",
        payloadJson: {
          action: "AGENT_START",
          documentNumber: order.documentNumber,
        },
      });
    }

    return row;
  });

  return {
    order: toOrderSummary(updated),
    workflowVersionId: publishedVersion.id,
    idempotent: false as const,
  };
}

export async function previewAgentWodIvcsWorkflow(
  prisma: PrismaClient,
  input: { orderId: string; actorId: string; answers: Record<string, unknown> }
) {
  assertV2Enabled();

  const order = await loadOrderForAgent(prisma, input.orderId);
  assertAssignee(order, input.actorId);

  const answers: WorkflowAnswers = input.answers;
  const { versionId } = await resolveWorkflowVersionId(prisma, order);
  const { rules } = await getRoutingRules(prisma, versionId);
  const matchedRoutingRule = findMatchingRoutingRule(rules as RoutingRuleWithOptions[], answers);

  const simulation = await runWorkflowSimulation(prisma, versionId, answers);

  const allErrors = [...simulation.validation.errors];
  if (matchedRoutingRule) {
    const followUps = getFollowUpQuestionsForRule({
      metadataJson: matchedRoutingRule.metadataJson,
      subDispositionRequired: matchedRoutingRule.subDispositionRequired,
      subDispositionQuestion: matchedRoutingRule.subDispositionQuestion,
      subDispositionOptions: matchedRoutingRule.subDispositionOptions,
    });
    const followUpVal = validateFollowUpAnswers(
      followUps,
      answers,
      matchedRoutingRule.label ?? "Routing rule"
    );
    allErrors.push(...followUpVal.errors);
  }

  return {
    order: toOrderSummary(order),
    workflowVersionId: versionId,
    answers,
    validation: { valid: allErrors.length === 0, errors: allErrors },
    visibleSteps: simulation.visibleSteps,
    matchedRoutingRule: matchedRoutingRule
      ? toMatchedRoutingRuleSummary(matchedRoutingRule as RoutingRuleWithOptions)
      : null,
    matchedOutcome: simulation.matchedRule as MatchedOutcomeSummary,
    predictedTargetQueue: simulation.matchedRule.targetQueue,
  };
}

export async function submitAgentWodIvcsWorkflow(
  prisma: PrismaClient,
  input: { orderId: string; actorId: string; answers: Record<string, unknown> }
) {
  assertV2Enabled();

  const order = await loadOrderForAgent(prisma, input.orderId);
  assertAssignee(order, input.actorId);

  if (order.operationalQueue !== "IN_PROGRESS") {
    throw new AgentWorkflowError(
      `Order must be IN_PROGRESS to submit (current: ${order.operationalQueue})`,
      409,
      "INVALID_QUEUE_FOR_SUBMIT"
    );
  }

  if (!order.activeWorkflowVersionId) {
    throw new AgentWorkflowError(
      "Order has no active workflow version; start work first",
      409,
      "NO_ACTIVE_WORKFLOW_VERSION"
    );
  }

  const answers: WorkflowAnswers = input.answers;
  const versionId = order.activeWorkflowVersionId;
  const version = await prisma.wodIvcsWorkflowVersion.findUnique({
    where: { id: versionId },
    select: { id: true, routingMatrixHash: true },
  });
  if (!version) {
    throw new AgentWorkflowError("Active workflow version not found", 404, "VERSION_NOT_FOUND");
  }

  const { rules } = await getRoutingRules(prisma, versionId);
  const matchedRoutingRule = findMatchingRoutingRule(rules as RoutingRuleWithOptions[], answers);

  const simulation = await runWorkflowSimulation(prisma, versionId, answers);
  const errors = [...simulation.validation.errors];

  if (matchedRoutingRule) {
    const followUps = getFollowUpQuestionsForRule({
      metadataJson: matchedRoutingRule.metadataJson,
      subDispositionRequired: matchedRoutingRule.subDispositionRequired,
      subDispositionQuestion: matchedRoutingRule.subDispositionQuestion,
      subDispositionOptions: matchedRoutingRule.subDispositionOptions,
    });
    const followUpVal = validateFollowUpAnswers(
      followUps,
      answers,
      matchedRoutingRule.label ?? "Routing rule"
    );
    errors.push(...followUpVal.errors);
  }

  if (errors.length > 0) {
    throw new AgentWorkflowError(errors.join("; "), 400, "VALIDATION_FAILED");
  }

  const matched = simulation.matchedRule;
  const targetQueue = matched.targetQueue;
  const fromQueue = order.operationalQueue;
  const now = new Date();

  const replacementFromAnswers =
    typeof answers.replacement_order_number === "string"
      ? answers.replacement_order_number.trim()
      : null;

  const processedReshipAnswer = answers.processed_reship_confirmation;
  const processedReship =
    processedReshipAnswer === true || processedReshipAnswer === "true"
      ? true
      : processedReshipAnswer === false || processedReshipAnswer === "false"
        ? false
        : undefined;

  const result = await prisma.$transaction(async (tx) => {
    const submission = await tx.wodIvcsWorkflowSubmission.create({
      data: {
        orderId: input.orderId,
        workflowVersionId: versionId,
        submittedById: input.actorId,
        answersJson: answers as Prisma.InputJsonValue,
        matchedRoutingRuleId: matchedRoutingRule?.id ?? null,
        matchedOutcomeRuleName: matched.name,
        matchedOutcomeRulePriority: matched.priority,
        targetQueue,
        routingMatrixHash: version.routingMatrixHash,
      },
    });

    const orderUpdate: Prisma.WodIvcsOrderUpdateInput = {
      operationalQueue: targetQueue,
    };

    if (replacementFromAnswers) {
      orderUpdate.replacementOrderNumber = replacementFromAnswers;
    }
    if (processedReship !== undefined) {
      orderUpdate.processedReship = processedReship;
    }

    if (targetQueue === "AWAITING_DROP_OFF") {
      orderUpdate.awaitingDropOffStartedAt = now;
      orderUpdate.awaitingDropOffDeadlineAt = new Date(now.getTime() + DROP_OFF_DURATION_MS);
    }

    if (matched.operationalCompletionMode === "MARK_OPERATIONALLY_COMPLETE") {
      orderUpdate.operationalStatus = "OPERATIONALLY_COMPLETE";
    } else if (matched.operationalCompletionMode === "ARCHIVE_ORDER") {
      orderUpdate.operationalStatus = "ARCHIVED";
      orderUpdate.archivedAt = now;
    }

    const updatedOrder = await tx.wodIvcsOrder.update({
      where: { id: input.orderId },
      data: orderUpdate,
      select: {
        id: true,
        documentNumber: true,
        operationalQueue: true,
        operationalStatus: true,
        assignedToId: true,
        activeWorkflowVersionId: true,
        workStartedAt: true,
        workStartedById: true,
        awaitingDropOffStartedAt: true,
        awaitingDropOffDeadlineAt: true,
        replacementOrderNumber: true,
        processedReship: true,
      },
    });

    await writeOrderAuditEvent(tx, {
      orderId: input.orderId,
      actorId: input.actorId,
      actionType: "WORKFLOW_SUBMITTED",
      fromQueue,
      toQueue: targetQueue,
      payloadJson: {
        submissionId: submission.id,
        workflowVersionId: versionId,
        routingMatrixHash: version.routingMatrixHash,
        matchedRoutingRuleId: matchedRoutingRule?.id ?? null,
        matchedOutcomeRuleName: matched.name,
        matchedOutcomeRulePriority: matched.priority,
        targetQueue,
        documentNumber: order.documentNumber,
      },
    });

    if (fromQueue !== targetQueue) {
      await writeOrderAuditEvent(tx, {
        orderId: input.orderId,
        actorId: input.actorId,
        actionType: "QUEUE_CHANGED",
        fromQueue,
        toQueue: targetQueue,
        payloadJson: {
          action: "AGENT_WORKFLOW_SUBMIT",
          submissionId: submission.id,
          documentNumber: order.documentNumber,
        },
      });
    }

    return { submission, updatedOrder };
  });

  return {
    submissionId: result.submission.id,
    targetQueue,
    matchedRoutingRule: matchedRoutingRule
      ? {
          id: matchedRoutingRule.id,
          label: matchedRoutingRule.label,
        }
      : null,
    matchedOutcome: {
      name: matched.name,
      priority: matched.priority,
      matchedBy: matched.matchedBy,
      targetQueue: matched.targetQueue,
      operationalCompletionMode: matched.operationalCompletionMode,
    },
    order: toOrderSummary(result.updatedOrder),
  };
}
