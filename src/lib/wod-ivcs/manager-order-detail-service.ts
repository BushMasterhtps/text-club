import type { PrismaClient } from "@prisma/client";
import {
  extractFollowUpQuestionsFromRule,
  followUpAnswerKey,
  followUpNotesKey,
  isFollowUpQuestionVisibleForAnswers,
  type FollowUpQuestion,
} from "./follow-up-questions";
import { buildAgentOrderSynopsis, type AgentOrderSynopsisRow } from "./agent-order-synopsis";
import {
  agentFlowStepLabel,
  dropOffBehaviorLabel,
  operationalCompletionModeLabel,
  operationalQueueLabel,
} from "./routing-matrix-labels";
import { CORE_STEP_SLUGS } from "./workflow-config-service";

export type ManagerDetailRow = { label: string; value: string };

export type ManagerLatestSubmissionSummary = {
  id: string;
  submittedAt: string;
  submittedBy: { id: string; name: string | null; email: string };
  workStartedAt: string | null;
  durationLabel: string | null;
  workflowVersion: {
    id: string;
    version: number;
    status: string;
    routingMatrixHash: string | null;
  };
  matchedRoutingRule: {
    id: string;
    label: string | null;
    targetQueue: string;
    dropOffBehavior: string;
  } | null;
  matchedOutcome: {
    name: string;
    priority: number | null;
    targetQueue: string;
    operationalCompletionMode: string | null;
  } | null;
  targetQueue: string;
  answerRows: ManagerDetailRow[];
};

export type AwaitingDropOffReviewSummary = {
  whyAwaiting: string;
  agentSubmittedAction: string;
  agentSelectionsSummary: string;
  startedAt: string | null;
  deadlineAt: string | null;
  stillOnNetSuiteReport: boolean;
  stillOnAgingReport: boolean;
  reportsToCheckOnNextImport: string[];
};

export type ManagerOrderDetailPayload = {
  order: Record<string, unknown>;
  synopsisRows: AgentOrderSynopsisRow[];
  managerRows: ManagerDetailRow[];
  latestSubmission: ManagerLatestSubmissionSummary | null;
  awaitingDropOffReview: AwaitingDropOffReviewSummary | null;
};

function labelForStep(slug: string, stepLabel?: string | null): string {
  if (stepLabel?.trim()) return stepLabel.trim();
  return agentFlowStepLabel[slug] ?? slug.replace(/_/g, " ");
}

function formatAnswerValue(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) {
    const parts = value.map(String).filter((s) => s.trim());
    return parts.length > 0 ? parts.join(", ") : null;
  }
  const s = String(value).trim();
  return s || null;
}

function formatDurationMs(ms: number): string {
  if (ms < 0) return "—";
  const totalMinutes = Math.floor(ms / 60_000);
  if (totalMinutes < 1) return "Under 1 minute";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${totalMinutes} minute${totalMinutes === 1 ? "" : "s"}`;
  if (minutes === 0) return `${hours} hour${hours === 1 ? "" : "s"}`;
  return `${hours}h ${minutes}m`;
}

function presenceOnReport(state: string): boolean {
  return state === "PRESENT";
}

function buildReportsToCheck(input: {
  presenceNetSuite: string;
  presenceAging: string;
}): string[] {
  const reports: string[] = [];
  if (presenceOnReport(input.presenceNetSuite)) reports.push("NetSuite report");
  if (presenceOnReport(input.presenceAging)) reports.push("Aging report");
  if (reports.length === 0) {
    return ["NetSuite and/or Aging report (verify presence on next import)"];
  }
  return reports;
}

type StepWithCatalog = {
  slug: string;
  label: string;
  catalog: {
    options: Array<{ value: string; label: string }>;
  } | null;
};

function optionLabelForStep(
  step: StepWithCatalog | undefined,
  rawValue: unknown
): string | null {
  const formatted = formatAnswerValue(rawValue);
  if (!formatted) return null;
  const opt = step?.catalog?.options.find(
    (o) => o.value === formatted || o.label === formatted
  );
  return opt?.label ?? formatted;
}

function decodeSubmissionAnswerRows(input: {
  answers: Record<string, unknown>;
  steps: StepWithCatalog[];
  followUpQuestions: FollowUpQuestion[];
}): ManagerDetailRow[] {
  const rows: ManagerDetailRow[] = [];
  const stepBySlug = new Map(input.steps.map((s) => [s.slug, s]));
  const usedKeys = new Set<string>();

  for (const slug of CORE_STEP_SLUGS) {
    const raw = input.answers[slug];
    const value = optionLabelForStep(stepBySlug.get(slug), raw);
    if (!value) continue;
    usedKeys.add(slug);
    rows.push({
      label: labelForStep(slug, stepBySlug.get(slug)?.label),
      value,
    });
  }

  const subDisp = formatAnswerValue(input.answers.sub_disposition);
  if (subDisp) {
    usedKeys.add("sub_disposition");
    const subStep = stepBySlug.get("sub_disposition");
    rows.push({
      label: subStep?.label?.trim() || "Sub-disposition",
      value: subDisp,
    });
  }

  for (const q of input.followUpQuestions) {
    if (!isFollowUpQuestionVisibleForAnswers(q, input.answers)) continue;
    const answerKey = followUpAnswerKey(q.id);
    const notesKey = followUpNotesKey(q.id);
    const answer = formatAnswerValue(input.answers[answerKey]);
    const notes = formatAnswerValue(input.answers[notesKey]);
    if (answer) {
      usedKeys.add(answerKey);
      rows.push({
        label: q.question.trim() || "Follow-up",
        value: answer,
      });
    }
    if (notes) {
      usedKeys.add(notesKey);
      rows.push({
        label: `${q.question.trim() || "Follow-up"} — notes`,
        value: notes,
      });
    }
  }

  const confirmationSlugs = [
    "retrigger_confirmation",
    "replacement_order_number",
    "processed_reship_confirmation",
    "it_escalation_note",
  ] as const;

  for (const slug of confirmationSlugs) {
    const value = formatAnswerValue(input.answers[slug]);
    if (!value) continue;
    usedKeys.add(slug);
    rows.push({
      label: labelForStep(slug, stepBySlug.get(slug)?.label),
      value,
    });
  }

  for (const [key, raw] of Object.entries(input.answers)) {
    if (usedKeys.has(key)) continue;
    if (key.startsWith("follow_up.")) continue;
    const value = formatAnswerValue(raw);
    if (!value) continue;
    rows.push({
      label: labelForStep(key),
      value,
    });
  }

  return rows;
}

/**
 * Future: on NetSuite/Aging import, reevaluate all operational queues (Needs Action,
 * Awaiting Drop-Off auto-promote/complete per dropOffBehavior, analytics for silent drop-offs).
 * See Phase 4A.5 manager visibility — not implemented in this patch.
 */
export async function buildManagerOrderDetail(
  prisma: PrismaClient,
  orderId: string
): Promise<ManagerOrderDetailPayload | null> {
  const order = await prisma.wodIvcsOrder.findUnique({
    where: { id: orderId },
    include: {
      cases: true,
      assignedTo: { select: { id: true, name: true, email: true } },
      createdByImportRun: { select: { id: true, fileName: true, createdAt: true } },
      updatedByImportRun: { select: { id: true, fileName: true, createdAt: true } },
    },
  });

  if (!order) return null;

  const latestSubmission = await prisma.wodIvcsWorkflowSubmission.findFirst({
    where: { orderId },
    orderBy: { submittedAt: "desc" },
    include: {
      submittedBy: { select: { id: true, name: true, email: true } },
      workflowVersion: {
        select: {
          id: true,
          version: true,
          status: true,
          routingMatrixHash: true,
        },
      },
      matchedRoutingRule: {
        select: {
          id: true,
          label: true,
          targetQueue: true,
          dropOffBehavior: true,
          metadataJson: true,
          subDispositionRequired: true,
          subDispositionQuestion: true,
          subDispositionOptions: { where: { isActive: true }, orderBy: { displayOrder: "asc" } },
        },
      },
    },
  });

  let submissionSummary: ManagerLatestSubmissionSummary | null = null;
  let answerRowsForDropOff: ManagerDetailRow[] = [];

  if (latestSubmission) {
    const steps = await prisma.wodIvcsWorkflowStep.findMany({
      where: { versionId: latestSubmission.workflowVersionId },
      orderBy: { sortOrder: "asc" },
      include: {
        catalog: {
          include: {
            options: { where: { isActive: true }, orderBy: { sortOrder: "asc" } },
          },
        },
      },
    });

    const answers =
      latestSubmission.answersJson &&
      typeof latestSubmission.answersJson === "object" &&
      !Array.isArray(latestSubmission.answersJson)
        ? (latestSubmission.answersJson as Record<string, unknown>)
        : {};

    const followUpQuestions = latestSubmission.matchedRoutingRule
      ? extractFollowUpQuestionsFromRule({
          metadataJson: latestSubmission.matchedRoutingRule.metadataJson,
          subDispositionRequired: latestSubmission.matchedRoutingRule.subDispositionRequired,
          subDispositionQuestion: latestSubmission.matchedRoutingRule.subDispositionQuestion,
          subDispositionOptions: latestSubmission.matchedRoutingRule.subDispositionOptions,
        })
      : [];

    answerRowsForDropOff = decodeSubmissionAnswerRows({
      answers,
      steps,
      followUpQuestions,
    });

    let operationalCompletionMode: string | null = null;
    if (latestSubmission.matchedOutcomeRuleName) {
      const outcome = await prisma.wodIvcsWorkflowOutcomeRule.findFirst({
        where: {
          versionId: latestSubmission.workflowVersionId,
          name: latestSubmission.matchedOutcomeRuleName,
          ...(latestSubmission.matchedOutcomeRulePriority != null
            ? { priority: latestSubmission.matchedOutcomeRulePriority }
            : {}),
        },
        select: { operationalCompletionMode: true },
      });
      operationalCompletionMode = outcome?.operationalCompletionMode ?? null;
    }

    const workStartedAt = order.workStartedAt;
    const durationLabel =
      workStartedAt && latestSubmission.submittedAt
        ? formatDurationMs(
            latestSubmission.submittedAt.getTime() - workStartedAt.getTime()
          )
        : null;

    submissionSummary = {
      id: latestSubmission.id,
      submittedAt: latestSubmission.submittedAt.toISOString(),
      submittedBy: latestSubmission.submittedBy,
      workStartedAt: workStartedAt?.toISOString() ?? null,
      durationLabel,
      workflowVersion: latestSubmission.workflowVersion,
      matchedRoutingRule: latestSubmission.matchedRoutingRule
        ? {
            id: latestSubmission.matchedRoutingRule.id,
            label: latestSubmission.matchedRoutingRule.label,
            targetQueue: latestSubmission.matchedRoutingRule.targetQueue,
            dropOffBehavior: latestSubmission.matchedRoutingRule.dropOffBehavior,
          }
        : null,
      matchedOutcome: latestSubmission.matchedOutcomeRuleName
        ? {
            name: latestSubmission.matchedOutcomeRuleName,
            priority: latestSubmission.matchedOutcomeRulePriority,
            targetQueue: latestSubmission.targetQueue,
            operationalCompletionMode,
          }
        : null,
      targetQueue: latestSubmission.targetQueue,
      answerRows: answerRowsForDropOff,
    };
  }

  const synopsisRows = buildAgentOrderSynopsis({
    documentNumber: order.documentNumber,
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    netSuiteDaysOld: order.netSuiteDaysOld,
    agingIsFivePlus: order.agingIsFivePlus,
    latestNetSuiteSnapshotJson: order.latestNetSuiteSnapshotJson,
    latestAgingSnapshotJson: order.latestAgingSnapshotJson,
  });

  const managerRows: ManagerDetailRow[] = [
    { label: "Document #", value: order.documentNumber },
    {
      label: "Customer name",
      value: order.customerName?.trim() || "—",
    },
    { label: "Email", value: order.customerEmail?.trim() || "—" },
    {
      label: "NetSuite presence",
      value: order.presenceNetSuite,
    },
    { label: "Aging presence", value: order.presenceAging },
    {
      label: "NetSuite order date",
      value: order.orderDateFromNetSuiteReport
        ? order.orderDateFromNetSuiteReport.toISOString().slice(0, 10)
        : "—",
    },
    {
      label: "Aging date range / days",
      value:
        [order.agingDateRangeRaw, order.netSuiteDaysOld != null ? `${order.netSuiteDaysOld}d on NetSuite` : null]
          .filter(Boolean)
          .join(" · ") || "—",
    },
    {
      label: "Current operational queue",
      value: operationalQueueLabel[order.operationalQueue] ?? order.operationalQueue,
    },
    {
      label: "Assignee",
      value: order.assignedTo
        ? order.assignedTo.name || order.assignedTo.email
        : "Unassigned",
    },
    {
      label: "Last updated",
      value: order.updatedAt.toISOString(),
    },
  ];

  let awaitingDropOffReview: AwaitingDropOffReviewSummary | null = null;
  if (order.operationalQueue === "AWAITING_DROP_OFF") {
    const ruleLabel =
      submissionSummary?.matchedRoutingRule?.label?.trim() ||
      submissionSummary?.matchedOutcome?.name ||
      "Agent completed workflow";
    const dropBehavior = submissionSummary?.matchedRoutingRule?.dropOffBehavior;
    const whyParts = [
      `Routed to ${operationalQueueLabel.AWAITING_DROP_OFF} after agent submission.`,
      ruleLabel ? `Matched rule: ${ruleLabel}.` : null,
      dropBehavior && dropBehavior !== "NO_AUTOMATIC_CHANGE"
        ? `On drop-off: ${dropOffBehaviorLabel[dropBehavior] ?? dropBehavior}.`
        : "Confirm the order drops from required report(s) on the next import.",
    ].filter(Boolean);

    const selectionSummary =
      answerRowsForDropOff.length > 0
        ? answerRowsForDropOff
            .slice(0, 4)
            .map((r) => `${r.label}: ${r.value}`)
            .join(" · ")
        : "No workflow answers recorded.";

    awaitingDropOffReview = {
      whyAwaiting: whyParts.join(" "),
      agentSubmittedAction:
        submissionSummary != null
          ? `Submitted workflow → ${operationalQueueLabel[submissionSummary.targetQueue] ?? submissionSummary.targetQueue}`
          : "No workflow submission on file",
      agentSelectionsSummary: selectionSummary,
      startedAt: order.awaitingDropOffStartedAt?.toISOString() ?? null,
      deadlineAt: order.awaitingDropOffDeadlineAt?.toISOString() ?? null,
      stillOnNetSuiteReport: presenceOnReport(order.presenceNetSuite),
      stillOnAgingReport: presenceOnReport(order.presenceAging),
      reportsToCheckOnNextImport: buildReportsToCheck({
        presenceNetSuite: order.presenceNetSuite,
        presenceAging: order.presenceAging,
      }),
    };
  }

  return {
    order: {
      id: order.id,
      documentNumber: order.documentNumber,
      customerName: order.customerName,
      customerEmail: order.customerEmail,
      operationalQueue: order.operationalQueue,
      operationalStatus: order.operationalStatus,
      presenceNetSuite: order.presenceNetSuite,
      presenceAging: order.presenceAging,
      isCityBeauty: order.isCityBeauty,
      netSuiteDaysOld: order.netSuiteDaysOld,
      agingIsFivePlus: order.agingIsFivePlus,
      agingDateRangeRaw: order.agingDateRangeRaw,
      itemSummaryJson: order.itemSummaryJson,
      latestNetSuiteSnapshotJson: order.latestNetSuiteSnapshotJson,
      latestAgingSnapshotJson: order.latestAgingSnapshotJson,
      orderDateFromNetSuiteReport:
        order.orderDateFromNetSuiteReport?.toISOString() ?? null,
      lastSeenInNetSuiteAt: order.lastSeenInNetSuiteAt?.toISOString() ?? null,
      lastSeenInAgingAt: order.lastSeenInAgingAt?.toISOString() ?? null,
      droppedFromNetSuiteAt: order.droppedFromNetSuiteAt?.toISOString() ?? null,
      droppedFromAgingAt: order.droppedFromAgingAt?.toISOString() ?? null,
      awaitingDropOffStartedAt: order.awaitingDropOffStartedAt?.toISOString() ?? null,
      awaitingDropOffDeadlineAt: order.awaitingDropOffDeadlineAt?.toISOString() ?? null,
      replacementOrderNumber: order.replacementOrderNumber,
      processedReship: order.processedReship,
      workStartedAt: order.workStartedAt?.toISOString() ?? null,
      assignedTo: order.assignedTo,
      createdByImportRun: order.createdByImportRun
        ? {
            id: order.createdByImportRun.id,
            fileName: order.createdByImportRun.fileName,
            createdAt: order.createdByImportRun.createdAt.toISOString(),
          }
        : null,
      updatedByImportRun: order.updatedByImportRun
        ? {
            id: order.updatedByImportRun.id,
            fileName: order.updatedByImportRun.fileName,
            createdAt: order.updatedByImportRun.createdAt.toISOString(),
          }
        : null,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      cases: order.cases.map((c) => ({
        sourceReportType: c.sourceReportType,
        presenceState: c.presenceState,
        lastSeenAt: c.lastSeenAt?.toISOString() ?? null,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      })),
    },
    synopsisRows,
    managerRows,
    latestSubmission: submissionSummary,
    awaitingDropOffReview,
  };
}
