-- WOD/IVCS v2 Phase 3A: workflow configuration (additive only)

-- CreateEnum
CREATE TYPE "public"."WodIvcsWorkflowVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "public"."WodIvcsWorkflowCatalogType" AS ENUM ('ROOT_CAUSE', 'CASH_SALE_EXISTS', 'MERCHANT', 'FIX_TYPE');

-- CreateEnum
CREATE TYPE "public"."WodIvcsWorkflowStepFieldType" AS ENUM ('SECTION_HEADER', 'SINGLE_SELECT', 'MULTI_SELECT', 'BOOLEAN', 'TEXT', 'TEXTAREA', 'NUMBER', 'READ_ONLY');

-- CreateEnum
CREATE TYPE "public"."WodIvcsWorkflowConditionOperator" AS ENUM ('EQ', 'NEQ', 'IN', 'NOT_IN', 'IS_EMPTY', 'IS_NOT_EMPTY');

-- CreateEnum
CREATE TYPE "public"."WodIvcsProductivityCreditMode" AS ENUM ('NONE', 'AWARD_ON_OPERATIONAL_COMPLETE', 'CUSTOM_WEIGHT');

-- CreateEnum
CREATE TYPE "public"."WodIvcsOperationalCompletionMode" AS ENUM ('REMAIN_OPEN', 'MARK_OPERATIONALLY_COMPLETE', 'ARCHIVE_ORDER');

-- CreateEnum
CREATE TYPE "public"."WodIvcsWorkflowConfigAuditAction" AS ENUM ('CREATED', 'UPDATED', 'PUBLISHED', 'ARCHIVED', 'RESTORED_DRAFT');

-- CreateTable
CREATE TABLE "public"."WodIvcsWorkflowDefinition" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "WodIvcsWorkflowDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WodIvcsWorkflowVersion" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "public"."WodIvcsWorkflowVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "publishedAt" TIMESTAMP(3),
    "publishedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "WodIvcsWorkflowVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WodIvcsWorkflowCatalog" (
    "id" TEXT NOT NULL,
    "catalogType" "public"."WodIvcsWorkflowCatalogType" NOT NULL,
    "slug" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WodIvcsWorkflowCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WodIvcsWorkflowCatalogOption" (
    "id" TEXT NOT NULL,
    "catalogId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WodIvcsWorkflowCatalogOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WodIvcsWorkflowStep" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "helpText" TEXT,
    "fieldType" "public"."WodIvcsWorkflowStepFieldType" NOT NULL,
    "catalogId" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "inlineOptionsJson" JSONB,
    "validationRulesJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WodIvcsWorkflowStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WodIvcsWorkflowStepCondition" (
    "id" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "dependsOnStepSlug" TEXT NOT NULL,
    "operator" "public"."WodIvcsWorkflowConditionOperator" NOT NULL,
    "valueJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WodIvcsWorkflowStepCondition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WodIvcsWorkflowOutcomeRule" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "matchJson" JSONB NOT NULL,
    "targetQueue" "public"."WodIvcsOperationalQueue" NOT NULL,
    "productivityCreditMode" "public"."WodIvcsProductivityCreditMode" NOT NULL DEFAULT 'NONE',
    "operationalCompletionMode" "public"."WodIvcsOperationalCompletionMode" NOT NULL DEFAULT 'REMAIN_OPEN',
    "requiresReplacementOrderNumber" BOOLEAN NOT NULL DEFAULT false,
    "requiresProcessedReship" BOOLEAN NOT NULL DEFAULT false,
    "requiresItEscalation" BOOLEAN NOT NULL DEFAULT false,
    "requiresRetriggerConfirmation" BOOLEAN NOT NULL DEFAULT false,
    "effectsJson" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WodIvcsWorkflowOutcomeRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WodIvcsWorkflowConfigAuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" "public"."WodIvcsWorkflowConfigAuditAction" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "beforeJson" JSONB,
    "afterJson" JSONB,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WodIvcsWorkflowConfigAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WodIvcsWorkflowDefinition_slug_key" ON "public"."WodIvcsWorkflowDefinition"("slug");

-- CreateIndex
CREATE INDEX "WodIvcsWorkflowDefinition_isActive_idx" ON "public"."WodIvcsWorkflowDefinition"("isActive");

-- CreateIndex
CREATE INDEX "WodIvcsWorkflowVersion_workflowId_status_idx" ON "public"."WodIvcsWorkflowVersion"("workflowId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WodIvcsWorkflowVersion_workflowId_version_key" ON "public"."WodIvcsWorkflowVersion"("workflowId", "version");

-- CreateIndex
CREATE INDEX "WodIvcsWorkflowCatalog_catalogType_isActive_idx" ON "public"."WodIvcsWorkflowCatalog"("catalogType", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "WodIvcsWorkflowCatalog_catalogType_slug_key" ON "public"."WodIvcsWorkflowCatalog"("catalogType", "slug");

-- CreateIndex
CREATE INDEX "WodIvcsWorkflowCatalogOption_catalogId_isActive_sortOrder_idx" ON "public"."WodIvcsWorkflowCatalogOption"("catalogId", "isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "WodIvcsWorkflowCatalogOption_catalogId_value_key" ON "public"."WodIvcsWorkflowCatalogOption"("catalogId", "value");

-- CreateIndex
CREATE INDEX "WodIvcsWorkflowStep_versionId_sortOrder_idx" ON "public"."WodIvcsWorkflowStep"("versionId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "WodIvcsWorkflowStep_versionId_slug_key" ON "public"."WodIvcsWorkflowStep"("versionId", "slug");

-- CreateIndex
CREATE INDEX "WodIvcsWorkflowStepCondition_stepId_idx" ON "public"."WodIvcsWorkflowStepCondition"("stepId");

-- CreateIndex
CREATE INDEX "WodIvcsWorkflowStepCondition_dependsOnStepSlug_idx" ON "public"."WodIvcsWorkflowStepCondition"("dependsOnStepSlug");

-- CreateIndex
CREATE INDEX "WodIvcsWorkflowOutcomeRule_versionId_isActive_priority_idx" ON "public"."WodIvcsWorkflowOutcomeRule"("versionId", "isActive", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "WodIvcsWorkflowOutcomeRule_versionId_priority_key" ON "public"."WodIvcsWorkflowOutcomeRule"("versionId", "priority");

-- CreateIndex
CREATE INDEX "WodIvcsWorkflowConfigAuditLog_entityType_createdAt_idx" ON "public"."WodIvcsWorkflowConfigAuditLog"("entityType", "createdAt");

-- CreateIndex
CREATE INDEX "WodIvcsWorkflowConfigAuditLog_actorId_createdAt_idx" ON "public"."WodIvcsWorkflowConfigAuditLog"("actorId", "createdAt");

-- At most one PUBLISHED version per workflow definition
CREATE UNIQUE INDEX "WodIvcsWorkflowVersion_one_published_per_workflow" ON "public"."WodIvcsWorkflowVersion"("workflowId") WHERE "status" = 'PUBLISHED';

-- AddForeignKey
ALTER TABLE "public"."WodIvcsWorkflowDefinition" ADD CONSTRAINT "WodIvcsWorkflowDefinition_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WodIvcsWorkflowVersion" ADD CONSTRAINT "WodIvcsWorkflowVersion_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "public"."WodIvcsWorkflowDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WodIvcsWorkflowVersion" ADD CONSTRAINT "WodIvcsWorkflowVersion_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WodIvcsWorkflowVersion" ADD CONSTRAINT "WodIvcsWorkflowVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WodIvcsWorkflowCatalogOption" ADD CONSTRAINT "WodIvcsWorkflowCatalogOption_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "public"."WodIvcsWorkflowCatalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WodIvcsWorkflowStep" ADD CONSTRAINT "WodIvcsWorkflowStep_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "public"."WodIvcsWorkflowVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WodIvcsWorkflowStep" ADD CONSTRAINT "WodIvcsWorkflowStep_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "public"."WodIvcsWorkflowCatalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WodIvcsWorkflowStepCondition" ADD CONSTRAINT "WodIvcsWorkflowStepCondition_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "public"."WodIvcsWorkflowStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WodIvcsWorkflowOutcomeRule" ADD CONSTRAINT "WodIvcsWorkflowOutcomeRule_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "public"."WodIvcsWorkflowVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WodIvcsWorkflowConfigAuditLog" ADD CONSTRAINT "WodIvcsWorkflowConfigAuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
