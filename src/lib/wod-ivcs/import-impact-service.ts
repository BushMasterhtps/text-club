import type { PrismaClient } from "@prisma/client";
import { excludeCityBeautyFromOperationalQueues } from "./city-beauty";
import type {
  ImportRunImpactSummary,
  ImportRunQueueSnapshot,
  ImportRunReevaluationSummary,
  ImportRunSummary,
} from "./types";

function emptyQueueSnapshot(): ImportRunQueueSnapshot {
  return {
    needsAction: 0,
    assigned: 0,
    inProgress: 0,
    awaitingDropOff: 0,
    needsReview: 0,
    itReview: 0,
    completed: 0,
    archived: 0,
  };
}

/** Operational queue counts aligned with Task Management (non-archived orders, City Beauty excluded). */
export async function snapshotOperationalQueueCounts(
  prisma: PrismaClient
): Promise<ImportRunQueueSnapshot> {
  const snapshot = emptyQueueSnapshot();
  const rows = await prisma.wodIvcsOrder.groupBy({
    by: ["operationalQueue"],
    where: {
      archivedAt: null,
      ...excludeCityBeautyFromOperationalQueues(),
    },
    _count: { _all: true },
  });

  for (const row of rows) {
    const count = row._count._all;
    switch (row.operationalQueue) {
      case "NEEDS_ACTION":
        snapshot.needsAction = count;
        break;
      case "ASSIGNED":
        snapshot.assigned = count;
        break;
      case "IN_PROGRESS":
        snapshot.inProgress = count;
        break;
      case "AWAITING_DROP_OFF":
        snapshot.awaitingDropOff = count;
        break;
      case "NEEDS_REVIEW":
        snapshot.needsReview = count;
        break;
      case "IT_REVIEW":
        snapshot.itReview = count;
        break;
      case "COMPLETED":
        snapshot.completed = count;
        break;
      case "ARCHIVED":
        snapshot.archived = count;
        break;
      default:
        break;
    }
  }

  return snapshot;
}

function formatSignedDelta(delta: number): string {
  if (delta > 0) return `(+${delta})`;
  if (delta < 0) return `(${delta})`;
  return "(no change)";
}

export function buildImportImpactNarrative(input: {
  summary: Pick<
    ImportRunSummary,
    | "parsedRows"
    | "createdOrders"
    | "updatedOrders"
    | "skippedRows"
    | "errorRows"
    | "droppedOrders"
  >;
  impact: Pick<
    ImportRunImpactSummary,
    "queueSnapshots" | "needsActionDelta" | "cityBeautyRowsInFile" | "fivePlusRowsInFile"
  >;
  reevaluation?: ImportRunReevaluationSummary;
}): string {
  const { before, after } = input.impact.queueSnapshots;
  const parts: string[] = [
    `Needs Action changed from ${before.needsAction} to ${after.needsAction} ${formatSignedDelta(input.impact.needsActionDelta)}.`,
    `This import processed ${input.summary.parsedRows} unique order${input.summary.parsedRows === 1 ? "" : "s"}: ${input.summary.createdOrders} created, ${input.summary.updatedOrders} updated`,
  ];

  if (input.summary.skippedRows > 0) {
    parts.push(
      `${input.summary.skippedRows} duplicate row${input.summary.skippedRows === 1 ? "" : "s"} merged`
    );
  }

  parts[parts.length - 1] += ".";

  const droppedWithoutAction =
    input.reevaluation?.movedNeedsActionToArchived ??
    input.reevaluation?.droppedWithoutAction ??
    0;
  if (droppedWithoutAction > 0) {
    parts.push(
      `${droppedWithoutAction} untouched Needs Action order${droppedWithoutAction === 1 ? "" : "s"} were archived because they dropped from all participating reports.`
    );
  }

  const staleMoved = input.reevaluation?.awaitingDropOffMovedToNeedsReview ?? 0;
  if (staleMoved > 0) {
    parts.push(
      `${staleMoved} Awaiting Drop-Off order${staleMoved === 1 ? "" : "s"} passed their deadline and were moved to Needs Review.`
    );
  }

  const dropOffConfirmed = input.reevaluation?.dropOffConfirmed ?? 0;
  if (dropOffConfirmed > 0) {
    const detail: string[] = [];
    const completed = input.reevaluation?.movedToCompleted ?? 0;
    const archived = input.reevaluation?.movedToArchived ?? 0;
    const needsReview = input.reevaluation?.movedToNeedsReview ?? 0;
    if (completed > 0) detail.push(`${completed} completed`);
    if (archived > 0) detail.push(`${archived} archived`);
    if (needsReview > 0) detail.push(`${needsReview} needs review`);
    const detailText = detail.length > 0 ? ` (${detail.join(", ")})` : "";
    parts.push(
      `${dropOffConfirmed} Awaiting Drop-Off order${dropOffConfirmed === 1 ? "" : "s"} were confirmed after dropping from reports${detailText}.`
    );
  }

  if (input.impact.cityBeautyRowsInFile > 0) {
    parts.push(
      `${input.impact.cityBeautyRowsInFile} City Beauty order${input.impact.cityBeautyRowsInFile === 1 ? "" : "s"} in this file are excluded from active Task Management queues.`
    );
  }

  if (input.impact.fivePlusRowsInFile != null && input.impact.fivePlusRowsInFile > 0) {
    parts.push(
      `${input.impact.fivePlusRowsInFile} order${input.impact.fivePlusRowsInFile === 1 ? "" : "s"} flagged 5+ days on Aging.`
    );
  }

  if (input.summary.droppedOrders > 0) {
    parts.push(
      `${input.summary.droppedOrders} order${input.summary.droppedOrders === 1 ? "" : "s"} marked dropped on this report type.`
    );
  }

  if (input.summary.errorRows > 0) {
    parts.push(`${input.summary.errorRows} row error${input.summary.errorRows === 1 ? "" : "s"}.`);
  }

  return parts.join(" ");
}

export function buildImportRunImpact(input: {
  queueBefore: ImportRunQueueSnapshot;
  queueAfter: ImportRunQueueSnapshot;
  cityBeautyRowsInFile: number;
  fivePlusRowsInFile?: number;
  summary: ImportRunSummary;
}): ImportRunImpactSummary {
  const needsActionDelta =
    input.queueAfter.needsAction - input.queueBefore.needsAction;

  const impactBase = {
    queueSnapshots: {
      before: input.queueBefore,
      after: input.queueAfter,
    },
    needsActionDelta,
    cityBeautyRowsInFile: input.cityBeautyRowsInFile,
    ...(input.fivePlusRowsInFile != null ? { fivePlusRowsInFile: input.fivePlusRowsInFile } : {}),
  };

  const narrative = buildImportImpactNarrative({
    summary: input.summary,
    impact: impactBase,
    reevaluation: input.summary.reevaluation,
  });

  return { ...impactBase, narrative };
}

export type ImportRunImpactCompact = {
  needsActionBefore: number;
  needsActionAfter: number;
  needsActionDelta: number;
  droppedWithoutAction: number;
};

/** Compact impact line for import history list (from stored summaryJson). */
export function parseImportRunImpactCompact(
  summaryJson: unknown
): ImportRunImpactCompact | null {
  if (!summaryJson || typeof summaryJson !== "object") return null;
  const summary = summaryJson as ImportRunSummary;
  const impact = summary.impact;
  if (!impact?.queueSnapshots?.before || !impact.queueSnapshots.after) return null;
  return {
    needsActionBefore: impact.queueSnapshots.before.needsAction,
    needsActionAfter: impact.queueSnapshots.after.needsAction,
    needsActionDelta: impact.needsActionDelta,
    droppedWithoutAction:
      summary.reevaluation?.movedNeedsActionToArchived ??
      summary.reevaluation?.droppedWithoutAction ??
      0,
  };
}

export function formatImportRunImpactCompactLine(
  compact: ImportRunImpactCompact
): string {
  const delta = compact.needsActionDelta;
  const deltaStr = delta > 0 ? `(+${delta})` : delta < 0 ? `(${delta})` : "";
  let line = `NA ${compact.needsActionBefore} → ${compact.needsActionAfter}${deltaStr ? ` ${deltaStr}` : ""}`;
  if (compact.droppedWithoutAction > 0) {
    line += ` · Dropped without action: ${compact.droppedWithoutAction}`;
  }
  return line;
}
