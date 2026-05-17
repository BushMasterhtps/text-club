import {
  Prisma,
  type PrismaClient,
  type WodIvcsImportRun,
  type WodIvcsImportRunStatus,
  type WodIvcsOperationalQueue,
  type WodIvcsPresenceState,
  type WodIvcsSourceReportType,
} from "@prisma/client";
import { loadBrandRules } from "./city-beauty";
import { normalizeDocumentNumber } from "./normalize";
import { parseNetSuiteRow } from "./parse-netsuite";
import type { AggregatedAgingOrder, NormalizedNetSuiteRow } from "./types";

export const MIN_REVERSAL_REASON_LENGTH = 10;

const SAFE_OPERATIONAL_QUEUES: WodIvcsOperationalQueue[] = ["NEEDS_ACTION"];

export type ReversalBlockerCode =
  | "RUN_NOT_COMPLETED"
  | "RUN_ALREADY_REVERSED"
  | "RUN_IS_DRY_RUN"
  | "LATER_SAME_SOURCE_IMPORT"
  | "ASSIGNED_TO_AGENT"
  | "WORKFLOW_QUEUE"
  | "WORKFLOW_ACTION"
  | "POST_IMPORT_WORKFLOW_FIELDS";

export type OrderReversalAction =
  | "ARCHIVE"
  | "RESTORE_SOURCE"
  | "RESTORE_PRESENCE_ONLY"
  | "BLOCKED";

export type OrderReversalPlan = {
  orderId: string;
  documentNumber: string;
  action: OrderReversalAction;
  blockedReason?: ReversalBlockerCode;
  details: string;
};

export type ReversalPlan = {
  importRunId: string;
  sourceReportType: WodIvcsSourceReportType;
  canFullyReverse: boolean;
  blockers: Array<{ code: ReversalBlockerCode; message: string }>;
  warnings: string[];
  summary: {
    ordersToArchive: number;
    ordersToRestore: number;
    dropsToUndo: number;
    blockedOrders: number;
    totalAffectedOrders: number;
  };
  orders: OrderReversalPlan[];
};

export type ReversalExecuteResult = {
  status: WodIvcsImportRunStatus;
  plan: ReversalPlan;
  applied: {
    archived: number;
    restored: number;
    presenceRestored: number;
    blocked: number;
  };
};

function isReversibleRunStatus(status: WodIvcsImportRunStatus): boolean {
  return status === "COMPLETED";
}

function isAlreadyReversedStatus(status: WodIvcsImportRunStatus): boolean {
  return status === "REVERSED" || status === "PARTIALLY_REVERSED";
}

async function getLaterSameSourceRunIds(
  prisma: PrismaClient,
  run: WodIvcsImportRun
): Promise<string[]> {
  const later = await prisma.wodIvcsImportRun.findMany({
    where: {
      id: { not: run.id },
      sourceReportType: run.sourceReportType,
      isDryRun: false,
      status: "COMPLETED",
      finishedAt: run.finishedAt ? { gt: run.finishedAt } : { not: null },
    },
    select: { id: true },
  });
  return later.map((r) => r.id);
}

async function orderTouchedByLaterRun(
  prisma: PrismaClient,
  orderId: string,
  laterRunIds: string[],
  sourceReportType: WodIvcsSourceReportType
): Promise<boolean> {
  if (laterRunIds.length === 0) return false;

  const [rowHit, caseHit, eventHit] = await Promise.all([
    prisma.wodIvcsImportRow.findFirst({
      where: { importRunId: { in: laterRunIds }, orderId },
      select: { id: true },
    }),
    prisma.wodIvcsCase.findFirst({
      where: {
        orderId,
        sourceReportType,
        lastImportRunId: { in: laterRunIds },
      },
      select: { id: true },
    }),
    prisma.wodIvcsReportPresenceEvent.findFirst({
      where: {
        importRunId: { in: laterRunIds },
        orderId,
        sourceReportType,
      },
      select: { id: true },
    }),
  ]);

  return Boolean(rowHit || caseHit || eventHit);
}

async function hasWorkflowBlockers(
  prisma: PrismaClient,
  orderId: string,
  runFinishedAt: Date | null
): Promise<ReversalBlockerCode | null> {
  const order = await prisma.wodIvcsOrder.findUnique({
    where: { id: orderId },
    select: {
      assignedToId: true,
      operationalQueue: true,
      processedReship: true,
      replacementOrderNumber: true,
    },
  });
  if (!order) return null;

  if (order.assignedToId) return "ASSIGNED_TO_AGENT";
  if (!SAFE_OPERATIONAL_QUEUES.includes(order.operationalQueue)) {
    return "WORKFLOW_QUEUE";
  }
  if (order.processedReship != null || order.replacementOrderNumber) {
    return "POST_IMPORT_WORKFLOW_FIELDS";
  }

  if (runFinishedAt) {
    const workflowAction = await prisma.wodIvcsActionEvent.findFirst({
      where: {
        orderId,
        actionType: { in: ["QUEUE_CHANGED", "MANAGER_OVERRIDE"] },
        createdAt: { gt: runFinishedAt },
      },
      select: { id: true },
    });
    if (workflowAction) return "WORKFLOW_ACTION";
  }

  return null;
}

async function collectAffectedOrderIds(
  prisma: PrismaClient,
  runId: string
): Promise<Set<string>> {
  const ids = new Set<string>();

  const [rows, events, created] = await Promise.all([
    prisma.wodIvcsImportRow.findMany({
      where: { importRunId: runId, orderId: { not: null } },
      select: { orderId: true },
    }),
    prisma.wodIvcsReportPresenceEvent.findMany({
      where: { importRunId: runId },
      select: { orderId: true },
    }),
    prisma.wodIvcsOrder.findMany({
      where: { createdByImportRunId: runId },
      select: { id: true },
    }),
  ]);

  for (const r of rows) if (r.orderId) ids.add(r.orderId);
  for (const e of events) ids.add(e.orderId);
  for (const o of created) ids.add(o.id);

  return ids;
}

async function getPriorImportRow(
  prisma: PrismaClient,
  input: {
    documentNumberNormalized: string;
    sourceReportType: WodIvcsSourceReportType;
    beforeRunId: string;
    beforeFinishedAt: Date;
  }
) {
  return prisma.wodIvcsImportRow.findFirst({
    where: {
      documentNumberNormalized: input.documentNumberNormalized,
      status: { in: ["CREATED_ORDER", "UPDATED_ORDER", "AGGREGATED_INTO_ORDER"] },
      importRun: {
        id: { not: input.beforeRunId },
        sourceReportType: input.sourceReportType,
        status: "COMPLETED",
        isDryRun: false,
        finishedAt: { lt: input.beforeFinishedAt },
      },
    },
    orderBy: { importRun: { finishedAt: "desc" } },
    include: { importRun: { select: { id: true, finishedAt: true } } },
  });
}

async function getPresenceBeforeRun(
  prisma: PrismaClient,
  orderId: string,
  sourceReportType: WodIvcsSourceReportType,
  runStartedAt: Date
): Promise<WodIvcsPresenceState> {
  const prior = await prisma.wodIvcsReportPresenceEvent.findFirst({
    where: {
      orderId,
      sourceReportType,
      observedAt: { lt: runStartedAt },
    },
    orderBy: { observedAt: "desc" },
    select: { presenceState: true },
  });
  return prior?.presenceState ?? "UNKNOWN";
}

function parseNetSuiteFromImportRow(
  rawRowJson: Prisma.JsonValue,
  normalizedRowJson: Prisma.JsonValue | null,
  brandRules: Parameters<typeof parseNetSuiteRow>[2]
): NormalizedNetSuiteRow | null {
  const row =
    (normalizedRowJson && typeof normalizedRowJson === "object"
      ? normalizedRowJson
      : rawRowJson) as Record<string, string>;
  if (!row || typeof row !== "object") return null;
  const result = parseNetSuiteRow(row, 0, brandRules);
  return result.ok ? result.data : null;
}

function parseAgingAggregateFromImportRow(
  normalizedRowJson: Prisma.JsonValue | null
): AggregatedAgingOrder | null {
  if (!normalizedRowJson || typeof normalizedRowJson !== "object") return null;
  const obj = normalizedRowJson as Record<string, unknown>;
  const doc = typeof obj.aggregated === "string" ? obj.aggregated : null;
  const normalized = doc ? normalizeDocumentNumber(doc) : null;
  const itemSummary = Array.isArray(obj.itemSummary) ? obj.itemSummary : [];
  if (!normalized) return null;

  return {
    documentNumber: doc!,
    documentNumberNormalized: normalized,
    dateRange: null,
    daysOldInvalidCashSale: null,
    subsidiary: null,
    customerName: null,
    customerEmail: null,
    agingIsFivePlus: false,
    isCityBeauty: false,
    itemSummary: itemSummary as AggregatedAgingOrder["itemSummary"],
    snapshot: obj as Record<string, unknown>,
    sourceRowNumbers: [],
  };
}

async function clearNetSuiteSourceFields(prisma: PrismaClient, orderId: string) {
  await prisma.wodIvcsOrder.update({
    where: { id: orderId },
    data: {
      presenceNetSuite: "UNKNOWN",
      lastSeenInNetSuiteAt: null,
      droppedFromNetSuiteAt: null,
      orderDateFromNetSuiteReport: null,
      netSuiteDaysOld: null,
      latestNetSuiteSnapshotJson: Prisma.JsonNull,
    },
  });
  await prisma.wodIvcsCase.deleteMany({
    where: { orderId, sourceReportType: "NETSUITE_REPORT" },
  });
}

async function clearAgingSourceFields(prisma: PrismaClient, orderId: string) {
  const order = await prisma.wodIvcsOrder.findUnique({
    where: { id: orderId },
    select: { isCityBeauty: true },
  });
  await prisma.wodIvcsOrder.update({
    where: { id: orderId },
    data: {
      presenceAging: "UNKNOWN",
      lastSeenInAgingAt: null,
      droppedFromAgingAt: null,
      agingIsFivePlus: false,
      agingDaysOldInvalidCashSale: null,
      agingDateRangeRaw: null,
      itemSummaryJson: Prisma.JsonNull,
      latestAgingSnapshotJson: Prisma.JsonNull,
      isCityBeauty: order?.isCityBeauty ?? false,
    },
  });
  await prisma.wodIvcsCase.deleteMany({
    where: { orderId, sourceReportType: "AGING_REPORT" },
  });
}

async function applyNetSuiteRestore(
  prisma: PrismaClient,
  orderId: string,
  row: NormalizedNetSuiteRow
) {
  await prisma.wodIvcsOrder.update({
    where: { id: orderId },
    data: {
      customerName: row.customerName,
      customerEmail: row.customerEmail,
      isCityBeauty: row.isCityBeauty,
      orderDateFromNetSuiteReport: row.orderDateFromNetSuiteReport,
      netSuiteDaysOld: row.netSuiteDaysOld,
      latestNetSuiteSnapshotJson: row.snapshot as Prisma.InputJsonValue,
      presenceNetSuite: "PRESENT",
      lastSeenInNetSuiteAt: new Date(),
      droppedFromNetSuiteAt: null,
    },
  });

  await prisma.wodIvcsCase.upsert({
    where: {
      documentNumberNormalized_sourceReportType: {
        documentNumberNormalized: row.documentNumberNormalized,
        sourceReportType: "NETSUITE_REPORT",
      },
    },
    create: {
      orderId,
      sourceReportType: "NETSUITE_REPORT",
      documentNumberNormalized: row.documentNumberNormalized,
      presenceState: "PRESENT",
      lastSeenAt: new Date(),
      rawSnapshotJson: row.snapshot as Prisma.InputJsonValue,
    },
    update: {
      presenceState: "PRESENT",
      lastSeenAt: new Date(),
      rawSnapshotJson: row.snapshot as Prisma.InputJsonValue,
    },
  });
}

async function applyAgingRestore(
  prisma: PrismaClient,
  orderId: string,
  agg: AggregatedAgingOrder,
  preserveCityBeauty: boolean
) {
  await prisma.wodIvcsOrder.update({
    where: { id: orderId },
    data: {
      customerName: agg.customerName,
      customerEmail: agg.customerEmail,
      isCityBeauty: preserveCityBeauty || agg.isCityBeauty,
      agingIsFivePlus: agg.agingIsFivePlus,
      agingDaysOldInvalidCashSale: agg.daysOldInvalidCashSale,
      agingDateRangeRaw: agg.dateRange,
      itemSummaryJson: agg.itemSummary as unknown as Prisma.InputJsonValue,
      latestAgingSnapshotJson: agg.snapshot as Prisma.InputJsonValue,
      presenceAging: "PRESENT",
      lastSeenInAgingAt: new Date(),
      droppedFromAgingAt: null,
    },
  });

  await prisma.wodIvcsCase.upsert({
    where: {
      documentNumberNormalized_sourceReportType: {
        documentNumberNormalized: agg.documentNumberNormalized,
        sourceReportType: "AGING_REPORT",
      },
    },
    create: {
      orderId,
      sourceReportType: "AGING_REPORT",
      documentNumberNormalized: agg.documentNumberNormalized,
      presenceState: "PRESENT",
      lastSeenAt: new Date(),
      rawSnapshotJson: agg.snapshot as Prisma.InputJsonValue,
    },
    update: {
      presenceState: "PRESENT",
      lastSeenAt: new Date(),
      rawSnapshotJson: agg.snapshot as Prisma.InputJsonValue,
    },
  });
}

async function restorePresenceOnOrder(
  prisma: PrismaClient,
  orderId: string,
  sourceReportType: WodIvcsSourceReportType,
  presence: WodIvcsPresenceState
) {
  const data =
    sourceReportType === "NETSUITE_REPORT"
      ? {
          presenceNetSuite: presence,
          ...(presence === "PRESENT"
            ? { lastSeenInNetSuiteAt: new Date(), droppedFromNetSuiteAt: null }
            : presence === "DROPPED"
              ? { droppedFromNetSuiteAt: new Date() }
              : {}),
        }
      : {
          presenceAging: presence,
          ...(presence === "PRESENT"
            ? { lastSeenInAgingAt: new Date(), droppedFromAgingAt: null }
            : presence === "DROPPED"
              ? { droppedFromAgingAt: new Date() }
              : {}),
        };

  await prisma.wodIvcsOrder.update({ where: { id: orderId }, data });
  await prisma.wodIvcsCase.updateMany({
    where: { orderId, sourceReportType },
    data: {
      presenceState: presence,
      ...(presence === "PRESENT" ? { lastSeenAt: new Date() } : {}),
    },
  });
}

async function otherSourceActiveAfterRun(
  prisma: PrismaClient,
  orderId: string,
  sourceReportType: WodIvcsSourceReportType,
  runFinishedAt: Date
): Promise<boolean> {
  const otherSource =
    sourceReportType === "NETSUITE_REPORT" ? "AGING_REPORT" : "NETSUITE_REPORT";

  const otherCase = await prisma.wodIvcsCase.findFirst({
    where: { orderId, sourceReportType: otherSource },
    select: { lastImportRunId: true, lastSeenAt: true },
  });
  if (!otherCase?.lastImportRunId) return false;

  const otherRun = await prisma.wodIvcsImportRun.findUnique({
    where: { id: otherCase.lastImportRunId },
    select: { finishedAt: true, status: true },
  });
  return Boolean(
    otherRun?.status === "COMPLETED" &&
      otherRun.finishedAt &&
      otherRun.finishedAt > runFinishedAt
  );
}

function classifyOrderForRun(
  order: {
    id: string;
    documentNumber: string;
    documentNumberNormalized: string;
    createdByImportRunId: string | null;
    archivedAt: Date | null;
  },
  run: WodIvcsImportRun,
  importRowStatuses: Set<string>,
  droppedByRun: boolean
): OrderReversalAction {
  if (order.archivedAt) return "BLOCKED";

  const createdByRun = order.createdByImportRunId === run.id;
  const hasRow =
    importRowStatuses.has("CREATED_ORDER") ||
    importRowStatuses.has("UPDATED_ORDER") ||
    importRowStatuses.has("AGGREGATED_INTO_ORDER");

  if (createdByRun && hasRow) return "ARCHIVE";
  if (droppedByRun && !hasRow) return "RESTORE_PRESENCE_ONLY";
  if (hasRow) return "RESTORE_SOURCE";
  if (droppedByRun) return "RESTORE_PRESENCE_ONLY";
  return "RESTORE_SOURCE";
}

export async function buildReversalPlan(
  prisma: PrismaClient,
  importRunId: string
): Promise<ReversalPlan> {
  const run = await prisma.wodIvcsImportRun.findUnique({ where: { id: importRunId } });
  if (!run) {
    throw new Error("Import run not found");
  }

  const blockers: ReversalPlan["blockers"] = [];
  const warnings: string[] = [];

  if (run.isDryRun) {
    blockers.push({ code: "RUN_IS_DRY_RUN", message: "Dry-run imports cannot be reversed." });
  }
  if (!isReversibleRunStatus(run.status) && !isAlreadyReversedStatus(run.status)) {
    blockers.push({
      code: "RUN_NOT_COMPLETED",
      message: `Import run status is ${run.status}; only COMPLETED runs can be reversed.`,
    });
  }
  if (isAlreadyReversedStatus(run.status)) {
    blockers.push({
      code: "RUN_ALREADY_REVERSED",
      message: `Import run is already ${run.status}.`,
    });
  }

  if (blockers.length > 0 && run.status !== "COMPLETED") {
    return {
      importRunId,
      sourceReportType: run.sourceReportType,
      canFullyReverse: false,
      blockers,
      warnings,
      summary: {
        ordersToArchive: 0,
        ordersToRestore: 0,
        dropsToUndo: 0,
        blockedOrders: 0,
        totalAffectedOrders: 0,
      },
      orders: [],
    };
  }

  const runFinishedAt = run.finishedAt ?? run.createdAt;
  const laterRunIds = await getLaterSameSourceRunIds(prisma, run);

  const affectedIds = await collectAffectedOrderIds(prisma, run.id);
  const orders = await prisma.wodIvcsOrder.findMany({
    where: { id: { in: [...affectedIds] } },
    select: {
      id: true,
      documentNumber: true,
      documentNumberNormalized: true,
      createdByImportRunId: true,
      archivedAt: true,
    },
  });

  const [importRows, dropEvents] = await Promise.all([
    prisma.wodIvcsImportRow.findMany({
      where: { importRunId: run.id, orderId: { not: null } },
      select: { orderId: true, status: true },
    }),
    prisma.wodIvcsReportPresenceEvent.findMany({
      where: {
        importRunId: run.id,
        presenceState: "DROPPED",
      },
      select: { orderId: true },
    }),
  ]);

  const rowsByOrder = new Map<string, Set<string>>();
  for (const row of importRows) {
    if (!row.orderId) continue;
    if (!rowsByOrder.has(row.orderId)) rowsByOrder.set(row.orderId, new Set());
    rowsByOrder.get(row.orderId)!.add(row.status);
  }

  const droppedOrderIds = new Set(dropEvents.map((e) => e.orderId));

  const orderPlans: OrderReversalPlan[] = [];

  for (const order of orders) {
    const rowStatuses = rowsByOrder.get(order.id) ?? new Set<string>();
    const droppedByRun = droppedOrderIds.has(order.id);
    let action = classifyOrderForRun(order, run, rowStatuses, droppedByRun);
    let blockedReason: ReversalBlockerCode | undefined;

    if (await orderTouchedByLaterRun(prisma, order.id, laterRunIds, run.sourceReportType)) {
      action = "BLOCKED";
      blockedReason = "LATER_SAME_SOURCE_IMPORT";
    } else {
      const workflowBlock = await hasWorkflowBlockers(prisma, order.id, run.finishedAt);
      if (workflowBlock) {
        action = "BLOCKED";
        blockedReason = workflowBlock;
      }
    }

    if (action === "ARCHIVE") {
      const otherActive = await otherSourceActiveAfterRun(
        prisma,
        order.id,
        run.sourceReportType,
        runFinishedAt
      );
      if (otherActive) {
        action = "RESTORE_SOURCE";
      }
    }

    let details = "";
    switch (action) {
      case "ARCHIVE":
        details = "Archive order created solely by this import (no later cross-source activity).";
        break;
      case "RESTORE_SOURCE":
        details = `Revert ${run.sourceReportType} fields to pre-import state.`;
        break;
      case "RESTORE_PRESENCE_ONLY":
        details = "Restore presence from history before this import's drop-off.";
        break;
      case "BLOCKED":
        details = blockedReason
          ? `Blocked: ${blockedReason}`
          : "Blocked from reversal.";
        break;
    }

    orderPlans.push({
      orderId: order.id,
      documentNumber: order.documentNumber,
      action,
      blockedReason,
      details,
    });
  }

  const ordersToArchive = orderPlans.filter((o) => o.action === "ARCHIVE").length;
  const ordersToRestore = orderPlans.filter((o) => o.action === "RESTORE_SOURCE").length;
  const dropsToUndo = orderPlans.filter((o) => o.action === "RESTORE_PRESENCE_ONLY").length;
  const blockedOrders = orderPlans.filter((o) => o.action === "BLOCKED").length;

  const canFullyReverse =
    blockers.length === 0 &&
    blockedOrders === 0 &&
    orderPlans.length > 0 &&
    orderPlans.every((o) => o.action !== "BLOCKED");

  if (laterRunIds.length > 0) {
    warnings.push(
      `${laterRunIds.length} later ${run.sourceReportType} import(s) exist; orders touched by them are blocked.`
    );
  }

  return {
    importRunId,
    sourceReportType: run.sourceReportType,
    canFullyReverse,
    blockers,
    warnings,
    summary: {
      ordersToArchive,
      ordersToRestore,
      dropsToUndo,
      blockedOrders,
      totalAffectedOrders: orderPlans.length,
    },
    orders: orderPlans,
  };
}

async function applyOrderReversal(
  prisma: PrismaClient,
  run: WodIvcsImportRun,
  plan: OrderReversalPlan,
  brandRules: Parameters<typeof parseNetSuiteRow>[2]
): Promise<"archived" | "restored" | "presenceRestored"> {
  const runFinishedAt = run.finishedAt ?? run.createdAt;
  const runStartedAt = run.startedAt ?? run.createdAt;

  const order = await prisma.wodIvcsOrder.findUniqueOrThrow({
    where: { id: plan.orderId },
    select: {
      id: true,
      documentNumberNormalized: true,
      isCityBeauty: true,
      createdByImportRunId: true,
    },
  });

  if (plan.action === "ARCHIVE") {
    await prisma.wodIvcsOrder.update({
      where: { id: plan.orderId },
      data: {
        archivedAt: new Date(),
        operationalStatus: "ARCHIVED",
        operationalQueue: "ARCHIVED",
      },
    });
    return "archived";
  }

  if (plan.action === "RESTORE_PRESENCE_ONLY") {
    const priorPresence = await getPresenceBeforeRun(
      prisma,
      plan.orderId,
      run.sourceReportType,
      runStartedAt
    );
    await restorePresenceOnOrder(prisma, plan.orderId, run.sourceReportType, priorPresence);
    return "presenceRestored";
  }

  if (plan.action === "RESTORE_SOURCE") {
    const priorRow = await getPriorImportRow(prisma, {
      documentNumberNormalized: order.documentNumberNormalized,
      sourceReportType: run.sourceReportType,
      beforeRunId: run.id,
      beforeFinishedAt: runFinishedAt,
    });

    if (run.sourceReportType === "NETSUITE_REPORT") {
      if (priorRow) {
        const parsed = parseNetSuiteFromImportRow(
          priorRow.rawRowJson,
          priorRow.normalizedRowJson,
          brandRules
        );
        if (parsed) {
          await applyNetSuiteRestore(prisma, plan.orderId, parsed);
          await prisma.wodIvcsCase.updateMany({
            where: {
              orderId: plan.orderId,
              sourceReportType: "NETSUITE_REPORT",
            },
            data: { lastImportRunId: priorRow.importRunId },
          });
        } else {
          await clearNetSuiteSourceFields(prisma, plan.orderId);
        }
      } else {
        await clearNetSuiteSourceFields(prisma, plan.orderId);
      }
    } else {
      if (priorRow?.normalizedRowJson) {
        const agg = parseAgingAggregateFromImportRow(priorRow.normalizedRowJson);
        if (agg) {
          await applyAgingRestore(prisma, plan.orderId, agg, order.isCityBeauty);
          await prisma.wodIvcsCase.updateMany({
            where: { orderId: plan.orderId, sourceReportType: "AGING_REPORT" },
            data: { lastImportRunId: priorRow.importRunId },
          });
        } else {
          await clearAgingSourceFields(prisma, plan.orderId);
        }
      } else {
        await clearAgingSourceFields(prisma, plan.orderId);
      }
    }

    const droppedByRun = await prisma.wodIvcsReportPresenceEvent.findFirst({
      where: {
        importRunId: run.id,
        orderId: plan.orderId,
        presenceState: "DROPPED",
      },
    });
    if (droppedByRun) {
      const priorPresence = await getPresenceBeforeRun(
        prisma,
        plan.orderId,
        run.sourceReportType,
        runStartedAt
      );
      await restorePresenceOnOrder(prisma, plan.orderId, run.sourceReportType, priorPresence);
    }

    return "restored";
  }

  return "restored";
}

export async function persistReversalPreview(
  prisma: PrismaClient,
  importRunId: string,
  plan: ReversalPlan
) {
  await prisma.wodIvcsImportRun.update({
    where: { id: importRunId },
    data: {
      reversalPreviewJson: plan as unknown as Prisma.InputJsonValue,
    },
  });
}

export async function executeReversal(
  prisma: PrismaClient,
  input: {
    importRunId: string;
    actorId: string;
    reason: string;
  }
): Promise<ReversalExecuteResult> {
  const trimmed = input.reason.trim();
  if (trimmed.length < MIN_REVERSAL_REASON_LENGTH) {
    throw new Error(`Reversal reason must be at least ${MIN_REVERSAL_REASON_LENGTH} characters.`);
  }

  const run = await prisma.wodIvcsImportRun.findUnique({ where: { id: input.importRunId } });
  if (!run) throw new Error("Import run not found");

  if (isAlreadyReversedStatus(run.status)) {
    const err = new Error(`Import run is already ${run.status}.`);
    (err as Error & { code: string }).code = "ALREADY_REVERSED";
    throw err;
  }

  if (!isReversibleRunStatus(run.status) || run.isDryRun) {
    const err = new Error("Import run cannot be reversed.");
    (err as Error & { code: string }).code = "NOT_REVERSIBLE";
    throw err;
  }

  const plan = await buildReversalPlan(prisma, input.importRunId);
  const reversible = plan.orders.filter((o) => o.action !== "BLOCKED");

  if (reversible.length === 0) {
    const err = new Error("No reversible orders; all affected orders are blocked.");
    (err as Error & { code: string }).code = "ALL_BLOCKED";
    (err as Error & { plan: ReversalPlan }).plan = plan;
    throw err;
  }

  const idempotencyKey = `import-run-reversal:${input.importRunId}`;
  const existingEvent = await prisma.wodIvcsActionEvent.findUnique({
    where: { idempotencyKey },
  });
  if (existingEvent) {
    const err = new Error("This import run has already been reversed.");
    (err as Error & { code: string }).code = "ALREADY_REVERSED";
    throw err;
  }

  const brandRules = await loadBrandRules(prisma);
  const applied = { archived: 0, restored: 0, presenceRestored: 0, blocked: 0 };

  const finalStatus: WodIvcsImportRunStatus =
    plan.summary.blockedOrders > 0 ? "PARTIALLY_REVERSED" : "REVERSED";

  await prisma.$transaction(async (tx) => {
    const fresh = await tx.wodIvcsImportRun.findUnique({ where: { id: input.importRunId } });
    if (!fresh || isAlreadyReversedStatus(fresh.status)) {
      throw new Error("Import run is no longer reversible.");
    }

    for (const orderPlan of plan.orders) {
      if (orderPlan.action === "BLOCKED") {
        applied.blocked++;
        continue;
      }

      const result = await applyOrderReversal(tx as unknown as PrismaClient, run, orderPlan, brandRules);
      if (result === "archived") applied.archived++;
      else if (result === "presenceRestored") applied.presenceRestored++;
      else applied.restored++;
    }

    await tx.wodIvcsReportPresenceEvent.deleteMany({
      where: { importRunId: input.importRunId },
    });

    await tx.wodIvcsCase.updateMany({
      where: { lastImportRunId: input.importRunId },
      data: { lastImportRunId: null },
    });

    await tx.wodIvcsImportRun.update({
      where: { id: input.importRunId },
      data: {
        status: finalStatus,
        reversedAt: new Date(),
        reversedById: input.actorId,
        reversalReason: trimmed,
        reversalPreviewJson: plan as unknown as Prisma.InputJsonValue,
      },
    });

    await tx.wodIvcsActionEvent.create({
      data: {
        importRunId: input.importRunId,
        actorId: input.actorId,
        actionType: "IMPORT_RUN_REVERSED",
        idempotencyKey,
        payloadJson: {
          status: finalStatus,
          reason: trimmed,
          summary: plan.summary,
          applied,
        } as Prisma.InputJsonValue,
      },
    });
  });

  return {
    status: finalStatus,
    plan,
    applied: {
      archived: applied.archived,
      restored: applied.restored,
      presenceRestored: applied.presenceRestored,
      blocked: applied.blocked,
    },
  };
}
