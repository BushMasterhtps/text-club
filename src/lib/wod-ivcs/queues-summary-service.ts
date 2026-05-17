import type { PrismaClient, WodIvcsOperationalQueue } from "@prisma/client";
import { getAgentReportingDayBoundsUtc } from "@/lib/agent-reporting-day-bounds";

const QUEUE_KEYS: WodIvcsOperationalQueue[] = [
  "NEEDS_ACTION",
  "ASSIGNED",
  "IN_PROGRESS",
  "AWAITING_DROP_OFF",
  "NEEDS_REVIEW",
  "IT_REVIEW",
  "COMPLETED",
  "ARCHIVED",
];

const OPEN_QUEUES: WodIvcsOperationalQueue[] = [
  "NEEDS_ACTION",
  "ASSIGNED",
  "IN_PROGRESS",
  "AWAITING_DROP_OFF",
  "NEEDS_REVIEW",
  "IT_REVIEW",
];

export type WodIvcsImportSummaryItem = {
  id: string;
  fileName: string;
  status: string;
  finishedAt: string | null;
  createdAt: string;
  parsedRows: number;
  createdOrders: number;
  updatedOrders: number;
  errorRows: number;
};

export type WodIvcsQueuesSummary = {
  totalOrders: number;
  activeOrders: number;
  completedOrders: number;
  progressPercentage: number;
  queueCounts: Record<WodIvcsOperationalQueue, number>;
  completedToday: number;
  completedTodayNote: string;
  activeWork: number;
  unassignedNeedsAction: number;
  assigned: number;
  inProgress: number;
  awaitingDropOff: number;
  needsReview: number;
  itReview: number;
  ageBuckets: { medium: number; high: number; urgent: number };
  recentImportSummary: {
    lastNetSuite: WodIvcsImportSummaryItem | null;
    lastAging: WodIvcsImportSummaryItem | null;
  };
  liveAgents: Array<{
    id: string;
    name: string | null;
    email: string;
    isLive: boolean;
    openOrderCount: number;
  }>;
};

function emptyQueueCounts(): Record<WodIvcsOperationalQueue, number> {
  return QUEUE_KEYS.reduce(
    (acc, q) => {
      acc[q] = 0;
      return acc;
    },
    {} as Record<WodIvcsOperationalQueue, number>
  );
}

function mapImportRun(
  r: {
    id: string;
    fileName: string;
    status: string;
    finishedAt: Date | null;
    createdAt: Date;
    parsedRows: number;
    createdOrders: number;
    updatedOrders: number;
    errorRows: number;
  } | null
): WodIvcsImportSummaryItem | null {
  if (!r) return null;
  return {
    id: r.id,
    fileName: r.fileName,
    status: r.status,
    finishedAt: r.finishedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    parsedRows: r.parsedRows,
    createdOrders: r.createdOrders,
    updatedOrders: r.updatedOrders,
    errorRows: r.errorRows,
  };
}

const AGE_OPEN_WHERE = {
  archivedAt: null,
  operationalQueue: { in: OPEN_QUEUES },
} as const;

export async function buildWodIvcsQueuesSummary(
  prisma: PrismaClient
): Promise<WodIvcsQueuesSummary> {
  const { startUtc, endExclusiveUtc } = getAgentReportingDayBoundsUtc(null);
  const notArchived = { archivedAt: null };

  const [
    totalOrders,
    completedOrders,
    queueGroups,
    completedToday,
    activeWork,
    unassignedNeedsAction,
    ageMedium,
    ageHigh,
    ageUrgent,
    lastNetSuite,
    lastAging,
    agentUsers,
    agentOrderGroups,
  ] = await Promise.all([
    prisma.wodIvcsOrder.count({ where: notArchived }),
    prisma.wodIvcsOrder.count({
      where: { ...notArchived, operationalQueue: "COMPLETED" },
    }),
    prisma.wodIvcsOrder.groupBy({
      by: ["operationalQueue"],
      where: notArchived,
      _count: { _all: true },
    }),
    prisma.wodIvcsOrder.count({
      where: {
        ...notArchived,
        operationalQueue: "COMPLETED",
        updatedAt: { gte: startUtc, lt: endExclusiveUtc },
      },
    }),
    prisma.wodIvcsOrder.count({
      where: {
        ...notArchived,
        operationalQueue: { in: ["ASSIGNED", "IN_PROGRESS"] },
      },
    }),
    prisma.wodIvcsOrder.count({
      where: {
        ...notArchived,
        operationalQueue: "NEEDS_ACTION",
        assignedToId: null,
      },
    }),
    prisma.wodIvcsOrder.count({
      where: {
        ...AGE_OPEN_WHERE,
        netSuiteDaysOld: { gte: 1, lt: 3 },
      },
    }),
    prisma.wodIvcsOrder.count({
      where: {
        ...AGE_OPEN_WHERE,
        netSuiteDaysOld: { gte: 3, lt: 5 },
      },
    }),
    prisma.wodIvcsOrder.count({
      where: {
        ...AGE_OPEN_WHERE,
        OR: [{ netSuiteDaysOld: { gte: 5 } }, { agingIsFivePlus: true }],
      },
    }),
    prisma.wodIvcsImportRun.findFirst({
      where: { isDryRun: false, sourceReportType: "NETSUITE_REPORT" },
      orderBy: { createdAt: "desc" },
    }),
    prisma.wodIvcsImportRun.findFirst({
      where: { isDryRun: false, sourceReportType: "AGING_REPORT" },
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.findMany({
      where: { role: { in: ["AGENT", "MANAGER_AGENT"] } },
      select: { id: true, name: true, email: true, isLive: true },
      orderBy: { name: "asc" },
    }),
    prisma.wodIvcsOrder.groupBy({
      by: ["assignedToId"],
      where: {
        ...notArchived,
        assignedToId: { not: null },
        operationalQueue: { in: ["ASSIGNED", "IN_PROGRESS"] },
      },
      _count: { _all: true },
    }),
  ]);

  const queueCounts = emptyQueueCounts();
  for (const row of queueGroups) {
    queueCounts[row.operationalQueue] = row._count._all;
  }

  const activeOrders = Math.max(0, totalOrders - queueCounts.ARCHIVED);
  const progressPercentage =
    activeOrders > 0 ? Math.round((completedOrders / activeOrders) * 100) : 0;

  const openByAgent = new Map<string, number>();
  for (const g of agentOrderGroups) {
    if (g.assignedToId) openByAgent.set(g.assignedToId, g._count._all);
  }

  return {
    totalOrders,
    activeOrders,
    completedOrders,
    progressPercentage,
    queueCounts,
    completedToday,
    completedTodayNote:
      "Counts orders moved to Completed today (based on last update time). Dedicated completion timestamps arrive in a later phase.",
    activeWork,
    unassignedNeedsAction,
    assigned: queueCounts.ASSIGNED,
    inProgress: queueCounts.IN_PROGRESS,
    awaitingDropOff: queueCounts.AWAITING_DROP_OFF,
    needsReview: queueCounts.NEEDS_REVIEW,
    itReview: queueCounts.IT_REVIEW,
    ageBuckets: { medium: ageMedium, high: ageHigh, urgent: ageUrgent },
    recentImportSummary: {
      lastNetSuite: mapImportRun(lastNetSuite),
      lastAging: mapImportRun(lastAging),
    },
    liveAgents: agentUsers.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      isLive: u.isLive,
      openOrderCount: openByAgent.get(u.id) ?? 0,
    })),
  };
}
