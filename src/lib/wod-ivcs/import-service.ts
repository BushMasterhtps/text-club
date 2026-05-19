import { createHash } from "crypto";
import type { Prisma, PrismaClient, WodIvcsSourceReportType } from "@prisma/client";
import { loadBrandRules } from "./city-beauty";
import { parseCsvText } from "./csv";
import { reconcileDroppedPresence, markReportPresence } from "./presence";
import { parseAndAggregateAgingCsv } from "./parse-aging";
import { parseNetSuiteRow } from "./parse-netsuite";
import { normalizeDocumentNumber } from "./normalize";
import { getColumnValue } from "./csv";
import {
  buildImportRunImpact,
  snapshotOperationalQueueCounts,
} from "./import-impact-service";
import { reevaluateAfterImport } from "./import-reevaluation-service";
import type { AggregatedAgingOrder, ImportRunSummary, NormalizedNetSuiteRow } from "./types";

// TODO(import-queue-reevaluation): assigned warnings after import.

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

async function upsertNetSuiteOrder(
  prisma: PrismaClient,
  row: NormalizedNetSuiteRow,
  importRunId: string,
  importedById: string,
  observedAt: Date
): Promise<{ orderId: string; caseId: string; created: boolean }> {
  const existing = await prisma.wodIvcsOrder.findUnique({
    where: { documentNumberNormalized: row.documentNumberNormalized },
  });

  const orderData: Prisma.WodIvcsOrderUncheckedCreateInput = {
    documentNumber: row.documentNumber,
    documentNumberNormalized: row.documentNumberNormalized,
    customerName: row.customerName,
    customerEmail: row.customerEmail,
    isCityBeauty: row.isCityBeauty,
    orderDateFromNetSuiteReport: row.orderDateFromNetSuiteReport,
    netSuiteDaysOld: row.netSuiteDaysOld,
    latestNetSuiteSnapshotJson: row.snapshot as Prisma.InputJsonValue,
    updatedByImportRunId: importRunId,
    ...(existing ? {} : { createdByImportRunId: importRunId }),
  };

  const order = existing
    ? await prisma.wodIvcsOrder.update({
        where: { id: existing.id },
        data: orderData,
      })
    : await prisma.wodIvcsOrder.create({ data: orderData });

  const caseRecord = await prisma.wodIvcsCase.upsert({
    where: {
      documentNumberNormalized_sourceReportType: {
        documentNumberNormalized: row.documentNumberNormalized,
        sourceReportType: "NETSUITE_REPORT",
      },
    },
    create: {
      orderId: order.id,
      sourceReportType: "NETSUITE_REPORT",
      documentNumberNormalized: row.documentNumberNormalized,
      presenceState: "PRESENT",
      lastImportRunId: importRunId,
      lastSeenAt: observedAt,
      rawSnapshotJson: row.snapshot as Prisma.InputJsonValue,
    },
    update: {
      lastImportRunId: importRunId,
      lastSeenAt: observedAt,
      presenceState: "PRESENT",
      rawSnapshotJson: row.snapshot as Prisma.InputJsonValue,
    },
  });

  await markReportPresence(prisma, {
    orderId: order.id,
    sourceReportType: "NETSUITE_REPORT",
    importRunId,
    presenceState: "PRESENT",
    observedAt,
    actorId: importedById,
  });

  return { orderId: order.id, caseId: caseRecord.id, created: !existing };
}

async function upsertAgingOrder(
  prisma: PrismaClient,
  agg: AggregatedAgingOrder,
  importRunId: string,
  importedById: string,
  observedAt: Date
): Promise<{ orderId: string; caseId: string; created: boolean }> {
  const existing = await prisma.wodIvcsOrder.findUnique({
    where: { documentNumberNormalized: agg.documentNumberNormalized },
  });

  const orderData: Prisma.WodIvcsOrderUncheckedCreateInput = {
    documentNumber: agg.documentNumber,
    documentNumberNormalized: agg.documentNumberNormalized,
    customerName: agg.customerName,
    customerEmail: agg.customerEmail,
    isCityBeauty: existing?.isCityBeauty || agg.isCityBeauty,
    agingIsFivePlus: agg.agingIsFivePlus,
    agingDaysOldInvalidCashSale: agg.daysOldInvalidCashSale,
    agingDateRangeRaw: agg.dateRange,
    itemSummaryJson: agg.itemSummary as unknown as Prisma.InputJsonValue,
    latestAgingSnapshotJson: agg.snapshot as Prisma.InputJsonValue,
    updatedByImportRunId: importRunId,
    ...(existing ? {} : { createdByImportRunId: importRunId }),
  };

  const order = existing
    ? await prisma.wodIvcsOrder.update({
        where: { id: existing.id },
        data: {
          ...orderData,
          isCityBeauty: existing.isCityBeauty || agg.isCityBeauty,
        },
      })
    : await prisma.wodIvcsOrder.create({ data: orderData });

  const caseRecord = await prisma.wodIvcsCase.upsert({
    where: {
      documentNumberNormalized_sourceReportType: {
        documentNumberNormalized: agg.documentNumberNormalized,
        sourceReportType: "AGING_REPORT",
      },
    },
    create: {
      orderId: order.id,
      sourceReportType: "AGING_REPORT",
      documentNumberNormalized: agg.documentNumberNormalized,
      presenceState: "PRESENT",
      lastImportRunId: importRunId,
      lastSeenAt: observedAt,
      rawSnapshotJson: agg.snapshot as Prisma.InputJsonValue,
    },
    update: {
      lastImportRunId: importRunId,
      lastSeenAt: observedAt,
      presenceState: "PRESENT",
      rawSnapshotJson: agg.snapshot as Prisma.InputJsonValue,
    },
  });

  await markReportPresence(prisma, {
    orderId: order.id,
    sourceReportType: "AGING_REPORT",
    importRunId,
    presenceState: "PRESENT",
    observedAt,
    actorId: importedById,
  });

  return { orderId: order.id, caseId: caseRecord.id, created: !existing };
}

export async function executeImport(
  prisma: PrismaClient,
  input: {
    sourceReportType: WodIvcsSourceReportType;
    fileName: string;
    csvText: string;
    importedById: string;
  }
): Promise<{ importRunId: string; summary: ImportRunSummary }> {
  const observedAt = new Date();
  const brandRules = await loadBrandRules(prisma);
  const rawRows = parseCsvText(input.csvText);
  const fileSha256 = sha256(input.csvText);

  const importRun = await prisma.wodIvcsImportRun.create({
    data: {
      sourceReportType: input.sourceReportType,
      fileName: input.fileName,
      fileSha256,
      status: "PROCESSING",
      isDryRun: false,
      importedById: input.importedById,
      totalRows: rawRows.length,
      startedAt: observedAt,
    },
  });

  let createdOrders = 0;
  let updatedOrders = 0;
  let parsedRows = 0;
  let skippedRows = 0;
  let errorRows = 0;
  let cityBeautyRowsInFile = 0;
  let fivePlusRowsInFile: number | undefined;
  const presentDocs = new Set<string>();

  const queueBefore = await snapshotOperationalQueueCounts(prisma);

  try {
    if (input.sourceReportType === "NETSUITE_REPORT") {
      for (let i = 0; i < rawRows.length; i++) {
        const rowNumber = i + 1;
        const raw = rawRows[i];
        const result = parseNetSuiteRow(raw, rowNumber, brandRules);

        if (!result.ok) {
          errorRows++;
          await prisma.wodIvcsImportRow.create({
            data: {
              importRunId: importRun.id,
              rowNumber,
              rawRowJson: raw as Prisma.InputJsonValue,
              status: "ERROR",
              errorMessage: result.error,
            },
          });
          continue;
        }

        const match = result.data;
        parsedRows++;
        if (match.isCityBeauty) cityBeautyRowsInFile++;
        presentDocs.add(match.documentNumberNormalized);
        const { orderId, caseId, created } = await upsertNetSuiteOrder(
          prisma,
          match,
          importRun.id,
          input.importedById,
          observedAt
        );
        if (created) createdOrders++;
        else updatedOrders++;

        await prisma.wodIvcsImportRow.create({
          data: {
            importRunId: importRun.id,
            rowNumber,
            rawRowJson: raw as Prisma.InputJsonValue,
            normalizedRowJson: match.snapshot as Prisma.InputJsonValue,
            status: created ? "CREATED_ORDER" : "UPDATED_ORDER",
            documentNumberNormalized: match.documentNumberNormalized,
            orderId,
            caseId,
          },
        });
      }
    } else {
      const { aggregated, errors } = parseAndAggregateAgingCsv(rawRows, brandRules);

      for (const err of errors) {
        errorRows++;
        await prisma.wodIvcsImportRow.create({
          data: {
            importRunId: importRun.id,
            rowNumber: err.rowNumber,
            rawRowJson: {},
            status: "ERROR",
            errorMessage: err.message,
          },
        });
      }

      const rowsByDoc = new Map<string, number[]>();
      rawRows.forEach((raw, i) => {
        const docRaw = getColumnValue(raw, ["DocumentNumber", "Document Number"]);
        const doc = normalizeDocumentNumber(docRaw);
        if (!doc) return;
        if (!rowsByDoc.has(doc)) rowsByDoc.set(doc, []);
        rowsByDoc.get(doc)!.push(i + 1);
      });

      fivePlusRowsInFile = aggregated.filter((a) => a.agingIsFivePlus).length;

      for (const agg of aggregated) {
        parsedRows++;
        if (agg.isCityBeauty) cityBeautyRowsInFile++;
        presentDocs.add(agg.documentNumberNormalized);
        const { orderId, caseId, created } = await upsertAgingOrder(
          prisma,
          agg,
          importRun.id,
          input.importedById,
          observedAt
        );
        if (created) createdOrders++;
        else updatedOrders++;

        const rowNums = rowsByDoc.get(agg.documentNumberNormalized) ?? agg.sourceRowNumbers;
        for (const rowNumber of rowNums) {
          const raw = rawRows[rowNumber - 1] ?? {};
          await prisma.wodIvcsImportRow.create({
            data: {
              importRunId: importRun.id,
              rowNumber,
              rawRowJson: raw as Prisma.InputJsonValue,
              normalizedRowJson: {
                aggregated: agg.documentNumber,
                itemSummary: agg.itemSummary,
              } as Prisma.InputJsonValue,
              status: "AGGREGATED_INTO_ORDER",
              documentNumberNormalized: agg.documentNumberNormalized,
              orderId,
              caseId,
            },
          });
        }
      }

      skippedRows = Math.max(0, rawRows.length - errorRows - rowsByDoc.size);
    }

    const droppedOrders = await reconcileDroppedPresence(prisma, {
      sourceReportType: input.sourceReportType,
      importRunId: importRun.id,
      presentDocumentNumbers: presentDocs,
      observedAt,
      actorId: input.importedById,
    });

    const reevaluation = await reevaluateAfterImport(prisma, {
      importRunId: importRun.id,
      sourceReportType: input.sourceReportType,
      actorId: input.importedById,
    });

    const queueAfter = await snapshotOperationalQueueCounts(prisma);

    const summaryWithoutImpact: ImportRunSummary = {
      totalRows: rawRows.length,
      createdOrders,
      updatedOrders,
      parsedRows,
      skippedRows,
      errorRows,
      droppedOrders,
      presencePresent: presentDocs.size,
      reevaluation,
    };

    const impact = buildImportRunImpact({
      queueBefore,
      queueAfter,
      cityBeautyRowsInFile,
      fivePlusRowsInFile,
      summary: summaryWithoutImpact,
    });

    const summary: ImportRunSummary = {
      ...summaryWithoutImpact,
      impact,
    };

    await prisma.wodIvcsImportRun.update({
      where: { id: importRun.id },
      data: {
        status: "COMPLETED",
        parsedRows,
        createdOrders,
        updatedOrders,
        skippedRows,
        errorRows,
        finishedAt: new Date(),
        summaryJson: summary as unknown as Prisma.InputJsonValue,
      },
    });

    await prisma.wodIvcsActionEvent.create({
      data: {
        importRunId: importRun.id,
        actorId: input.importedById,
        actionType: "IMPORT_RUN_COMPLETED",
        payloadJson: summary as unknown as Prisma.InputJsonValue,
      },
    });

    return { importRunId: importRun.id, summary };
  } catch (e) {
    await prisma.wodIvcsImportRun.update({
      where: { id: importRun.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        summaryJson: {
          error: e instanceof Error ? e.message : "Import failed",
        },
      },
    });
    throw e;
  }
}
