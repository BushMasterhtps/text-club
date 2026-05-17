-- CreateEnum
CREATE TYPE "public"."WodIvcsSourceReportType" AS ENUM ('NETSUITE_REPORT', 'AGING_REPORT');

-- CreateEnum
CREATE TYPE "public"."WodIvcsImportRunStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REVERSED', 'PARTIALLY_REVERSED');

-- CreateEnum
CREATE TYPE "public"."WodIvcsImportRowStatus" AS ENUM ('PARSED', 'SKIPPED', 'ERROR', 'CREATED_ORDER', 'UPDATED_ORDER', 'CREATED_CASE', 'UPDATED_CASE', 'AGGREGATED_INTO_ORDER');

-- CreateEnum
CREATE TYPE "public"."WodIvcsPresenceState" AS ENUM ('UNKNOWN', 'PRESENT', 'DROPPED');

-- CreateEnum
CREATE TYPE "public"."WodIvcsOperationalQueue" AS ENUM ('NEEDS_ACTION', 'ASSIGNED', 'IN_PROGRESS', 'AWAITING_DROP_OFF', 'NEEDS_REVIEW', 'IT_REVIEW', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "public"."WodIvcsOperationalStatus" AS ENUM ('OPEN', 'OPERATIONALLY_COMPLETE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "public"."WodIvcsActionType" AS ENUM ('IMPORT_RUN_COMPLETED', 'PRESENCE_UPDATED', 'IMPORT_RUN_REVERSED', 'QUEUE_CHANGED', 'MANAGER_OVERRIDE');

-- CreateTable
CREATE TABLE "public"."WodIvcsOrder" (
    "id" TEXT NOT NULL,
    "documentNumber" TEXT NOT NULL,
    "documentNumberNormalized" TEXT NOT NULL,
    "operationalQueue" "public"."WodIvcsOperationalQueue" NOT NULL DEFAULT 'NEEDS_ACTION',
    "operationalStatus" "public"."WodIvcsOperationalStatus" NOT NULL DEFAULT 'OPEN',
    "assignedToId" TEXT,
    "customerName" TEXT,
    "customerEmail" TEXT,
    "presenceNetSuite" "public"."WodIvcsPresenceState" NOT NULL DEFAULT 'UNKNOWN',
    "presenceAging" "public"."WodIvcsPresenceState" NOT NULL DEFAULT 'UNKNOWN',
    "lastSeenInNetSuiteAt" TIMESTAMP(3),
    "lastSeenInAgingAt" TIMESTAMP(3),
    "droppedFromNetSuiteAt" TIMESTAMP(3),
    "droppedFromAgingAt" TIMESTAMP(3),
    "orderDateFromNetSuiteReport" TIMESTAMP(3),
    "netSuiteDaysOld" INTEGER,
    "agingIsFivePlus" BOOLEAN NOT NULL DEFAULT false,
    "agingDaysOldInvalidCashSale" INTEGER,
    "agingDateRangeRaw" TEXT,
    "isCityBeauty" BOOLEAN NOT NULL DEFAULT false,
    "itemSummaryJson" JSONB,
    "latestNetSuiteSnapshotJson" JSONB,
    "latestAgingSnapshotJson" JSONB,
    "awaitingDropOffStartedAt" TIMESTAMP(3),
    "awaitingDropOffDeadlineAt" TIMESTAMP(3),
    "processedReship" BOOLEAN,
    "replacementOrderNumber" TEXT,
    "createdByImportRunId" TEXT,
    "updatedByImportRunId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WodIvcsOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WodIvcsCase" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "sourceReportType" "public"."WodIvcsSourceReportType" NOT NULL,
    "documentNumberNormalized" TEXT NOT NULL,
    "presenceState" "public"."WodIvcsPresenceState" NOT NULL DEFAULT 'UNKNOWN',
    "lastImportRunId" TEXT,
    "lastSeenAt" TIMESTAMP(3),
    "rawSnapshotJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WodIvcsCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WodIvcsImportRun" (
    "id" TEXT NOT NULL,
    "sourceReportType" "public"."WodIvcsSourceReportType" NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSha256" TEXT,
    "status" "public"."WodIvcsImportRunStatus" NOT NULL DEFAULT 'PENDING',
    "isDryRun" BOOLEAN NOT NULL DEFAULT false,
    "importedById" TEXT NOT NULL,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "parsedRows" INTEGER NOT NULL DEFAULT 0,
    "createdOrders" INTEGER NOT NULL DEFAULT 0,
    "updatedOrders" INTEGER NOT NULL DEFAULT 0,
    "skippedRows" INTEGER NOT NULL DEFAULT 0,
    "errorRows" INTEGER NOT NULL DEFAULT 0,
    "summaryJson" JSONB,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "reversedAt" TIMESTAMP(3),
    "reversedById" TEXT,
    "reversalReason" TEXT,
    "reversalPreviewJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WodIvcsImportRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WodIvcsImportRow" (
    "id" TEXT NOT NULL,
    "importRunId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "rawRowJson" JSONB NOT NULL,
    "normalizedRowJson" JSONB,
    "status" "public"."WodIvcsImportRowStatus" NOT NULL,
    "errorMessage" TEXT,
    "documentNumberNormalized" TEXT,
    "orderId" TEXT,
    "caseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WodIvcsImportRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WodIvcsReportPresenceEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "sourceReportType" "public"."WodIvcsSourceReportType" NOT NULL,
    "importRunId" TEXT NOT NULL,
    "presenceState" "public"."WodIvcsPresenceState" NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadataJson" JSONB,

    CONSTRAINT "WodIvcsReportPresenceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WodIvcsBrandRule" (
    "id" TEXT NOT NULL,
    "sourceReportType" "public"."WodIvcsSourceReportType" NOT NULL,
    "matchField" TEXT NOT NULL,
    "matchValue" TEXT NOT NULL,
    "isInclusive" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WodIvcsBrandRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WodIvcsActionEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT,
    "importRunId" TEXT,
    "actorId" TEXT NOT NULL,
    "actionType" "public"."WodIvcsActionType" NOT NULL,
    "fromQueue" "public"."WodIvcsOperationalQueue",
    "toQueue" "public"."WodIvcsOperationalQueue",
    "payloadJson" JSONB,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WodIvcsActionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WodIvcsOrder_documentNumberNormalized_key" ON "public"."WodIvcsOrder"("documentNumberNormalized");

-- CreateIndex
CREATE INDEX "WodIvcsOrder_operationalQueue_operationalStatus_idx" ON "public"."WodIvcsOrder"("operationalQueue", "operationalStatus");

-- CreateIndex
CREATE INDEX "WodIvcsOrder_isCityBeauty_agingIsFivePlus_idx" ON "public"."WodIvcsOrder"("isCityBeauty", "agingIsFivePlus");

-- CreateIndex
CREATE INDEX "WodIvcsOrder_presenceNetSuite_presenceAging_idx" ON "public"."WodIvcsOrder"("presenceNetSuite", "presenceAging");

-- CreateIndex
CREATE INDEX "WodIvcsOrder_assignedToId_idx" ON "public"."WodIvcsOrder"("assignedToId");

-- CreateIndex
CREATE INDEX "WodIvcsCase_orderId_idx" ON "public"."WodIvcsCase"("orderId");

-- CreateIndex
CREATE INDEX "WodIvcsCase_lastImportRunId_idx" ON "public"."WodIvcsCase"("lastImportRunId");

-- CreateIndex
CREATE UNIQUE INDEX "WodIvcsCase_documentNumberNormalized_sourceReportType_key" ON "public"."WodIvcsCase"("documentNumberNormalized", "sourceReportType");

-- CreateIndex
CREATE INDEX "WodIvcsImportRun_sourceReportType_createdAt_idx" ON "public"."WodIvcsImportRun"("sourceReportType", "createdAt");

-- CreateIndex
CREATE INDEX "WodIvcsImportRun_status_idx" ON "public"."WodIvcsImportRun"("status");

-- CreateIndex
CREATE INDEX "WodIvcsImportRun_importedById_idx" ON "public"."WodIvcsImportRun"("importedById");

-- CreateIndex
CREATE INDEX "WodIvcsImportRow_importRunId_rowNumber_idx" ON "public"."WodIvcsImportRow"("importRunId", "rowNumber");

-- CreateIndex
CREATE INDEX "WodIvcsImportRow_importRunId_documentNumberNormalized_idx" ON "public"."WodIvcsImportRow"("importRunId", "documentNumberNormalized");

-- CreateIndex
CREATE INDEX "WodIvcsReportPresenceEvent_orderId_sourceReportType_observe_idx" ON "public"."WodIvcsReportPresenceEvent"("orderId", "sourceReportType", "observedAt");

-- CreateIndex
CREATE INDEX "WodIvcsReportPresenceEvent_importRunId_idx" ON "public"."WodIvcsReportPresenceEvent"("importRunId");

-- CreateIndex
CREATE INDEX "WodIvcsBrandRule_sourceReportType_isActive_priority_idx" ON "public"."WodIvcsBrandRule"("sourceReportType", "isActive", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "WodIvcsActionEvent_idempotencyKey_key" ON "public"."WodIvcsActionEvent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "WodIvcsActionEvent_orderId_createdAt_idx" ON "public"."WodIvcsActionEvent"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "WodIvcsActionEvent_importRunId_idx" ON "public"."WodIvcsActionEvent"("importRunId");

-- CreateIndex
CREATE INDEX "WodIvcsActionEvent_actorId_createdAt_idx" ON "public"."WodIvcsActionEvent"("actorId", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."WodIvcsOrder" ADD CONSTRAINT "WodIvcsOrder_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WodIvcsOrder" ADD CONSTRAINT "WodIvcsOrder_createdByImportRunId_fkey" FOREIGN KEY ("createdByImportRunId") REFERENCES "public"."WodIvcsImportRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WodIvcsOrder" ADD CONSTRAINT "WodIvcsOrder_updatedByImportRunId_fkey" FOREIGN KEY ("updatedByImportRunId") REFERENCES "public"."WodIvcsImportRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WodIvcsCase" ADD CONSTRAINT "WodIvcsCase_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."WodIvcsOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WodIvcsCase" ADD CONSTRAINT "WodIvcsCase_lastImportRunId_fkey" FOREIGN KEY ("lastImportRunId") REFERENCES "public"."WodIvcsImportRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WodIvcsImportRun" ADD CONSTRAINT "WodIvcsImportRun_importedById_fkey" FOREIGN KEY ("importedById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WodIvcsImportRun" ADD CONSTRAINT "WodIvcsImportRun_reversedById_fkey" FOREIGN KEY ("reversedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WodIvcsImportRow" ADD CONSTRAINT "WodIvcsImportRow_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "public"."WodIvcsImportRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WodIvcsImportRow" ADD CONSTRAINT "WodIvcsImportRow_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."WodIvcsOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WodIvcsImportRow" ADD CONSTRAINT "WodIvcsImportRow_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "public"."WodIvcsCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WodIvcsReportPresenceEvent" ADD CONSTRAINT "WodIvcsReportPresenceEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."WodIvcsOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WodIvcsReportPresenceEvent" ADD CONSTRAINT "WodIvcsReportPresenceEvent_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "public"."WodIvcsImportRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WodIvcsActionEvent" ADD CONSTRAINT "WodIvcsActionEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."WodIvcsOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WodIvcsActionEvent" ADD CONSTRAINT "WodIvcsActionEvent_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "public"."WodIvcsImportRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WodIvcsActionEvent" ADD CONSTRAINT "WodIvcsActionEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Default WOD/IVCS brand rules (idempotent — safe if seed script already ran on a dev DB)
INSERT INTO "public"."WodIvcsBrandRule" (
    "id",
    "sourceReportType",
    "matchField",
    "matchValue",
    "isInclusive",
    "isActive",
    "priority",
    "createdAt",
    "updatedAt"
)
VALUES (
    'wodivcs_brand_rule_netsuite_city_beauty',
    'NETSUITE_REPORT'::"public"."WodIvcsSourceReportType",
    'Brand',
    'City Beauty',
    true,
    true,
    10,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "public"."WodIvcsBrandRule" (
    "id",
    "sourceReportType",
    "matchField",
    "matchValue",
    "isInclusive",
    "isActive",
    "priority",
    "createdAt",
    "updatedAt"
)
VALUES (
    'wodivcs_brand_rule_aging_city_beauty_llc',
    'AGING_REPORT'::"public"."WodIvcsSourceReportType",
    'Subsidiary',
    'City Beauty LLC',
    true,
    true,
    10,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO NOTHING;
