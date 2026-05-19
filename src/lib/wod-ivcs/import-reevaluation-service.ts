import type {
  Prisma,
  PrismaClient,
  WodIvcsOperationalQueue,
  WodIvcsPresenceState,
  WodIvcsSourceReportType,
  WodIvcsWorkflowDropOffBehavior,
} from "@prisma/client";
import { isCityBeautyDocumentNumber } from "./city-beauty";
import { isWodIvcsV2Enabled } from "./feature-flag";
import type { ImportRunReevaluationSummary } from "./types";

export type OrderForDropOffCheck = {
  id: string;
  documentNumber: string;
  documentNumberNormalized: string;
  isCityBeauty: boolean;
  operationalQueue: WodIvcsOperationalQueue;
  presenceNetSuite: WodIvcsPresenceState;
  presenceAging: WodIvcsPresenceState;
  droppedFromNetSuiteAt: Date | null;
  droppedFromAgingAt: Date | null;
  assignedToId: string | null;
  cases: Array<{ sourceReportType: WodIvcsSourceReportType }>;
};

function presenceForReport(
  order: Pick<OrderForDropOffCheck, "presenceNetSuite" | "presenceAging">,
  reportType: WodIvcsSourceReportType
): WodIvcsPresenceState {
  return reportType === "NETSUITE_REPORT" ? order.presenceNetSuite : order.presenceAging;
}

/** Reports the order participates in for drop-off confirmation (not blindly both). */
export function getRequiredReportTypesForDropOff(
  order: Pick<OrderForDropOffCheck, "presenceNetSuite" | "presenceAging" | "cases">
): WodIvcsSourceReportType[] {
  const required = new Set<WodIvcsSourceReportType>();
  for (const c of order.cases) {
    required.add(c.sourceReportType);
  }
  if (order.presenceNetSuite !== "UNKNOWN") {
    required.add("NETSUITE_REPORT");
  }
  if (order.presenceAging !== "UNKNOWN") {
    required.add("AGING_REPORT");
  }
  return [...required];
}

export function hasConfirmedDropOff(
  order: Pick<OrderForDropOffCheck, "presenceNetSuite" | "presenceAging" | "cases">
): { confirmed: boolean; requiredReports: WodIvcsSourceReportType[] } {
  const requiredReports = getRequiredReportTypesForDropOff(order);
  if (requiredReports.length === 0) {
    return { confirmed: false, requiredReports };
  }
  const confirmed = requiredReports.every(
    (reportType) => presenceForReport(order, reportType) === "DROPPED"
  );
  return { confirmed, requiredReports };
}

export function isCityBeautyExcludedFromReevaluation(order: {
  isCityBeauty: boolean;
  documentNumberNormalized: string;
}): boolean {
  return order.isCityBeauty || isCityBeautyDocumentNumber(order.documentNumberNormalized);
}

type DropOffResolution = {
  dropOffBehavior: WodIvcsWorkflowDropOffBehavior;
  submissionId: string;
  matchedRoutingRuleId: string | null;
};

export async function resolveDropOffBehaviorForOrder(
  prisma: PrismaClient,
  orderId: string
): Promise<DropOffResolution | null> {
  const submission = await prisma.wodIvcsWorkflowSubmission.findFirst({
    where: { orderId },
    orderBy: { submittedAt: "desc" },
    select: {
      id: true,
      matchedRoutingRuleId: true,
      matchedRoutingRule: { select: { dropOffBehavior: true } },
    },
  });

  if (!submission) return null;

  const dropOffBehavior =
    submission.matchedRoutingRule?.dropOffBehavior ?? "NO_AUTOMATIC_CHANGE";

  return {
    dropOffBehavior,
    submissionId: submission.id,
    matchedRoutingRuleId: submission.matchedRoutingRuleId,
  };
}

export type ApplyDropOffBehaviorResult = {
  targetQueue: WodIvcsOperationalQueue;
  orderUpdate: Prisma.WodIvcsOrderUpdateInput;
} | null;

/** Maps routing rule dropOffBehavior to queue/status updates (consumes matrix; does not modify it). */
export function applyDropOffBehaviorToOrderUpdate(
  behavior: WodIvcsWorkflowDropOffBehavior,
  now: Date
): ApplyDropOffBehaviorResult | null {
  switch (behavior) {
    case "MARK_COMPLETED":
      return {
        targetQueue: "COMPLETED",
        orderUpdate: {
          operationalQueue: "COMPLETED",
          operationalStatus: "OPERATIONALLY_COMPLETE",
        },
      };
    case "ARCHIVE_ORDER":
      return {
        targetQueue: "ARCHIVED",
        orderUpdate: {
          operationalQueue: "ARCHIVED",
          operationalStatus: "ARCHIVED",
          archivedAt: now,
        },
      };
    case "NEEDS_REVIEW":
      return {
        targetQueue: "NEEDS_REVIEW",
        orderUpdate: {
          operationalQueue: "NEEDS_REVIEW",
          operationalStatus: "OPEN",
        },
      };
    case "NO_AUTOMATIC_CHANGE":
    case "REMAIN_AWAITING_DROP_OFF":
      return null;
    default:
      return null;
  }
}

async function writeReevaluationQueueChanged(
  tx: Prisma.TransactionClient,
  input: {
    orderId: string;
    actorId: string;
    importRunId: string;
    sourceReportType: WodIvcsSourceReportType;
    previousQueue: WodIvcsOperationalQueue;
    targetQueue: WodIvcsOperationalQueue;
    order: OrderForDropOffCheck;
    requiredReports: WodIvcsSourceReportType[];
    dropOffBehavior: WodIvcsWorkflowDropOffBehavior;
    submissionId: string;
    matchedRoutingRuleId: string | null;
  }
) {
  await tx.wodIvcsActionEvent.create({
    data: {
      orderId: input.orderId,
      importRunId: input.importRunId,
      actorId: input.actorId,
      actionType: "QUEUE_CHANGED",
      fromQueue: input.previousQueue,
      toQueue: input.targetQueue,
      payloadJson: {
        reason: "IMPORT_REEVALUATION",
        subreason: "DROP_OFF_CONFIRMED",
        importRunId: input.importRunId,
        sourceReportType: input.sourceReportType,
        previousQueue: input.previousQueue,
        targetQueue: input.targetQueue,
        presenceNetSuite: input.order.presenceNetSuite,
        presenceAging: input.order.presenceAging,
        requiredReports: input.requiredReports,
        dropOffBehavior: input.dropOffBehavior,
        submissionId: input.submissionId,
        matchedRoutingRuleId: input.matchedRoutingRuleId,
        droppedFromNetSuiteAt: input.order.droppedFromNetSuiteAt?.toISOString() ?? null,
        droppedFromAgingAt: input.order.droppedFromAgingAt?.toISOString() ?? null,
        documentNumber: input.order.documentNumber,
      },
    },
  });
}

function emptyReevaluationSummary(): ImportRunReevaluationSummary {
  return {
    awaitingDropOffChecked: 0,
    dropOffConfirmed: 0,
    movedToCompleted: 0,
    movedToArchived: 0,
    movedToNeedsReview: 0,
    noAutomaticChange: 0,
    skippedCityBeauty: 0,
    skippedMissingSubmission: 0,
    skippedMissingRule: 0,
    skippedNotFullyDropped: 0,
    skippedNoRequiredReports: 0,
  };
}

/**
 * After presence reconcile, confirm Awaiting Drop-Off orders that dropped from all participating
 * reports and apply dropOffBehavior from the latest workflow submission's matched routing rule.
 */
export async function reevaluateAwaitingDropOffAfterImport(
  prisma: PrismaClient,
  input: {
    importRunId: string;
    sourceReportType: WodIvcsSourceReportType;
    actorId: string;
  }
): Promise<ImportRunReevaluationSummary> {
  if (!isWodIvcsV2Enabled()) {
    return emptyReevaluationSummary();
  }

  const summary = emptyReevaluationSummary();
  const now = new Date();

  const orders = await prisma.wodIvcsOrder.findMany({
    where: {
      operationalQueue: "AWAITING_DROP_OFF",
      operationalStatus: "OPEN",
      archivedAt: null,
    },
    select: {
      id: true,
      documentNumber: true,
      documentNumberNormalized: true,
      isCityBeauty: true,
      operationalQueue: true,
      presenceNetSuite: true,
      presenceAging: true,
      droppedFromNetSuiteAt: true,
      droppedFromAgingAt: true,
      assignedToId: true,
      cases: { select: { sourceReportType: true } },
    },
  });

  for (const order of orders) {
    summary.awaitingDropOffChecked++;

    if (isCityBeautyExcludedFromReevaluation(order)) {
      summary.skippedCityBeauty++;
      continue;
    }

    const { confirmed, requiredReports } = hasConfirmedDropOff(order);
    if (requiredReports.length === 0) {
      summary.skippedNoRequiredReports++;
      continue;
    }

    if (!confirmed) {
      summary.skippedNotFullyDropped++;
      continue;
    }

    const resolution = await resolveDropOffBehaviorForOrder(prisma, order.id);
    if (!resolution) {
      summary.skippedMissingSubmission++;
      continue;
    }

    if (!resolution.matchedRoutingRuleId) {
      summary.skippedMissingRule++;
    }

    const applied = applyDropOffBehaviorToOrderUpdate(resolution.dropOffBehavior, now);
    if (!applied) {
      summary.noAutomaticChange++;
      continue;
    }

    const previousQueue = order.operationalQueue;

    const moved = await prisma.$transaction(async (tx) => {
      const current = await tx.wodIvcsOrder.findUnique({
        where: { id: order.id },
        select: { operationalQueue: true },
      });
      if (!current || current.operationalQueue !== "AWAITING_DROP_OFF") {
        return false;
      }

      await tx.wodIvcsOrder.update({
        where: { id: order.id },
        data: applied.orderUpdate,
      });

      await writeReevaluationQueueChanged(tx, {
        orderId: order.id,
        actorId: input.actorId,
        importRunId: input.importRunId,
        sourceReportType: input.sourceReportType,
        previousQueue,
        targetQueue: applied.targetQueue,
        order,
        requiredReports,
        dropOffBehavior: resolution.dropOffBehavior,
        submissionId: resolution.submissionId,
        matchedRoutingRuleId: resolution.matchedRoutingRuleId,
      });

      return true;
    });

    if (!moved) continue;

    summary.dropOffConfirmed++;
    switch (applied.targetQueue) {
      case "COMPLETED":
        summary.movedToCompleted++;
        break;
      case "ARCHIVED":
        summary.movedToArchived++;
        break;
      case "NEEDS_REVIEW":
        summary.movedToNeedsReview++;
        break;
      default:
        break;
    }
  }

  return summary;
}
