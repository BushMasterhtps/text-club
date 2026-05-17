import type {
  PrismaClient,
  WodIvcsPresenceState,
  WodIvcsSourceReportType,
} from "@prisma/client";

export async function markReportPresence(
  prisma: PrismaClient,
  input: {
    orderId: string;
    sourceReportType: WodIvcsSourceReportType;
    importRunId: string;
    presenceState: WodIvcsPresenceState;
    observedAt: Date;
    actorId: string;
    metadata?: Record<string, unknown>;
  }
) {
  const orderUpdate =
    input.sourceReportType === "NETSUITE_REPORT"
      ? {
          presenceNetSuite: input.presenceState,
          ...(input.presenceState === "PRESENT"
            ? { lastSeenInNetSuiteAt: input.observedAt, droppedFromNetSuiteAt: null }
            : { droppedFromNetSuiteAt: input.observedAt }),
        }
      : {
          presenceAging: input.presenceState,
          ...(input.presenceState === "PRESENT"
            ? { lastSeenInAgingAt: input.observedAt, droppedFromAgingAt: null }
            : { droppedFromAgingAt: input.observedAt }),
        };

  await prisma.$transaction([
    prisma.wodIvcsOrder.update({
      where: { id: input.orderId },
      data: orderUpdate,
    }),
    prisma.wodIvcsCase.updateMany({
      where: { orderId: input.orderId, sourceReportType: input.sourceReportType },
      data: {
        presenceState: input.presenceState,
        lastSeenAt: input.presenceState === "PRESENT" ? input.observedAt : undefined,
      },
    }),
    prisma.wodIvcsReportPresenceEvent.create({
      data: {
        orderId: input.orderId,
        sourceReportType: input.sourceReportType,
        importRunId: input.importRunId,
        presenceState: input.presenceState,
        observedAt: input.observedAt,
        metadataJson: input.metadata ?? undefined,
      },
    }),
    prisma.wodIvcsActionEvent.create({
      data: {
        orderId: input.orderId,
        importRunId: input.importRunId,
        actorId: input.actorId,
        actionType: "PRESENCE_UPDATED",
        payloadJson: {
          sourceReportType: input.sourceReportType,
          presenceState: input.presenceState,
          ...input.metadata,
        },
      },
    }),
  ]);
}

/** Mark orders not in current import as DROPPED for this report type. */
export async function reconcileDroppedPresence(
  prisma: PrismaClient,
  input: {
    sourceReportType: WodIvcsSourceReportType;
    importRunId: string;
    presentDocumentNumbers: Set<string>;
    observedAt: Date;
    actorId: string;
  }
): Promise<number> {
  const cases = await prisma.wodIvcsCase.findMany({
    where: {
      sourceReportType: input.sourceReportType,
      order: { archivedAt: null, operationalStatus: "OPEN" },
    },
    select: { id: true, orderId: true, documentNumberNormalized: true, presenceState: true },
  });

  let dropped = 0;
  for (const c of cases) {
    if (input.presentDocumentNumbers.has(c.documentNumberNormalized)) continue;
    if (c.presenceState === "DROPPED") continue;

    await markReportPresence(prisma, {
      orderId: c.orderId,
      sourceReportType: input.sourceReportType,
      importRunId: input.importRunId,
      presenceState: "DROPPED",
      observedAt: input.observedAt,
      actorId: input.actorId,
      metadata: { reason: "not_in_import_file" },
    });
    dropped++;
  }

  return dropped;
}
