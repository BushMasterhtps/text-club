-- WOD/IVCS v2 Phase 3D: routing matrix foundation (additive only)

-- CreateEnum
CREATE TYPE "public"."WodIvcsWorkflowDropOffBehavior" AS ENUM (
  'NO_AUTOMATIC_CHANGE',
  'MARK_COMPLETED',
  'NEEDS_REVIEW',
  'ARCHIVE_ORDER',
  'REMAIN_AWAITING_DROP_OFF'
);

-- AlterTable WodIvcsWorkflowCatalog
ALTER TABLE "public"."WodIvcsWorkflowCatalog"
  ADD COLUMN "workflowDefinitionId" TEXT,
  ADD COLUMN "groupKey" TEXT,
  ADD COLUMN "displayOrder" INTEGER NOT NULL DEFAULT 0;

-- AlterTable WodIvcsWorkflowCatalogOption
ALTER TABLE "public"."WodIvcsWorkflowCatalogOption"
  ADD COLUMN "parentOptionId" TEXT;

-- AlterTable WodIvcsWorkflowVersion
ALTER TABLE "public"."WodIvcsWorkflowVersion"
  ADD COLUMN "compiledAt" TIMESTAMP(3),
  ADD COLUMN "routingMatrixHash" TEXT;

-- CreateTable WodIvcsWorkflowRoutingRule
CREATE TABLE "public"."WodIvcsWorkflowRoutingRule" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "label" TEXT,
    "rootCauseOptionId" TEXT,
    "cashSaleExistsOptionId" TEXT,
    "merchantOptionId" TEXT,
    "fixTypeOptionId" TEXT,
    "subDispositionRequired" BOOLEAN NOT NULL DEFAULT false,
    "subDispositionQuestion" TEXT,
    "requiresRetriggerConfirmation" BOOLEAN NOT NULL DEFAULT false,
    "requiresItEscalation" BOOLEAN NOT NULL DEFAULT false,
    "requiresReplacementOrderNumber" BOOLEAN NOT NULL DEFAULT false,
    "requiresProcessedReship" BOOLEAN NOT NULL DEFAULT false,
    "itEscalationPrompt" TEXT,
    "targetQueue" "public"."WodIvcsOperationalQueue" NOT NULL,
    "operationalCompletionMode" "public"."WodIvcsOperationalCompletionMode" NOT NULL DEFAULT 'REMAIN_OPEN',
    "productivityCreditMode" "public"."WodIvcsProductivityCreditMode" NOT NULL DEFAULT 'NONE',
    "dropOffBehavior" "public"."WodIvcsWorkflowDropOffBehavior" NOT NULL DEFAULT 'NO_AUTOMATIC_CHANGE',
    "compiledOutcomeRulePriority" INTEGER,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WodIvcsWorkflowRoutingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable WodIvcsWorkflowRoutingSubDispositionOption
CREATE TABLE "public"."WodIvcsWorkflowRoutingSubDispositionOption" (
    "id" TEXT NOT NULL,
    "routingRuleId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WodIvcsWorkflowRoutingSubDispositionOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WodIvcsWorkflowCatalog_workflowDefinitionId_groupKey_idx" ON "public"."WodIvcsWorkflowCatalog"("workflowDefinitionId", "groupKey");

CREATE INDEX "WodIvcsWorkflowCatalogOption_parentOptionId_idx" ON "public"."WodIvcsWorkflowCatalogOption"("parentOptionId");

CREATE INDEX "WodIvcsWorkflowRoutingRule_versionId_isActive_displayOrder_idx" ON "public"."WodIvcsWorkflowRoutingRule"("versionId", "isActive", "displayOrder");

CREATE INDEX "WodIvcsWorkflowRoutingSubDispositionOption_routingRuleId_isActive_displayOrder_idx" ON "public"."WodIvcsWorkflowRoutingSubDispositionOption"("routingRuleId", "isActive", "displayOrder");

-- AddForeignKey
ALTER TABLE "public"."WodIvcsWorkflowCatalog" ADD CONSTRAINT "WodIvcsWorkflowCatalog_workflowDefinitionId_fkey" FOREIGN KEY ("workflowDefinitionId") REFERENCES "public"."WodIvcsWorkflowDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."WodIvcsWorkflowCatalogOption" ADD CONSTRAINT "WodIvcsWorkflowCatalogOption_parentOptionId_fkey" FOREIGN KEY ("parentOptionId") REFERENCES "public"."WodIvcsWorkflowCatalogOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."WodIvcsWorkflowRoutingRule" ADD CONSTRAINT "WodIvcsWorkflowRoutingRule_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "public"."WodIvcsWorkflowVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."WodIvcsWorkflowRoutingRule" ADD CONSTRAINT "WodIvcsWorkflowRoutingRule_rootCauseOptionId_fkey" FOREIGN KEY ("rootCauseOptionId") REFERENCES "public"."WodIvcsWorkflowCatalogOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."WodIvcsWorkflowRoutingRule" ADD CONSTRAINT "WodIvcsWorkflowRoutingRule_cashSaleExistsOptionId_fkey" FOREIGN KEY ("cashSaleExistsOptionId") REFERENCES "public"."WodIvcsWorkflowCatalogOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."WodIvcsWorkflowRoutingRule" ADD CONSTRAINT "WodIvcsWorkflowRoutingRule_merchantOptionId_fkey" FOREIGN KEY ("merchantOptionId") REFERENCES "public"."WodIvcsWorkflowCatalogOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."WodIvcsWorkflowRoutingRule" ADD CONSTRAINT "WodIvcsWorkflowRoutingRule_fixTypeOptionId_fkey" FOREIGN KEY ("fixTypeOptionId") REFERENCES "public"."WodIvcsWorkflowCatalogOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."WodIvcsWorkflowRoutingSubDispositionOption" ADD CONSTRAINT "WodIvcsWorkflowRoutingSubDispositionOption_routingRuleId_fkey" FOREIGN KEY ("routingRuleId") REFERENCES "public"."WodIvcsWorkflowRoutingRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
