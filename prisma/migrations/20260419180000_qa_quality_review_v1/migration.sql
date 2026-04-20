-- Quality Review (QA*) v1: templates, batches, task reviews, line results
-- Additive only; no changes to existing tables beyond new FK references.

-- CreateEnum
CREATE TYPE "QASampleBatchStatus" AS ENUM ('OPEN', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "QATaskReviewStatus" AS ENUM ('PENDING', 'SUBMITTED');

-- CreateEnum
CREATE TYPE "QAReviewLineResponse" AS ENUM ('PASS', 'FAIL', 'NA');

-- CreateTable
CREATE TABLE "QATemplate" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "taskType" "TaskType" NOT NULL,
    "wodIvcsSource" "WodIvcsSource",
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "QATemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QATemplateVersion" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "QATemplateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QALine" (
    "id" TEXT NOT NULL,
    "templateVersionId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sectionOrder" INTEGER NOT NULL,
    "sectionTitle" TEXT NOT NULL,
    "lineOrder" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "helpText" TEXT,
    "weight" DECIMAL(10,2) NOT NULL,
    "isCritical" BOOLEAN NOT NULL DEFAULT false,
    "allowNa" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "QALine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QASampleBatch" (
    "id" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "subjectAgentId" TEXT NOT NULL,
    "templateVersionId" TEXT NOT NULL,
    "periodStartDate" VARCHAR(10) NOT NULL,
    "periodEndDate" VARCHAR(10) NOT NULL,
    "filtersJson" JSONB,
    "sampleCount" INTEGER NOT NULL,
    "status" "QASampleBatchStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "QASampleBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QASampleBatchTask" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "sortIndex" INTEGER NOT NULL,

    CONSTRAINT "QASampleBatchTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QATaskReview" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "templateVersionId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "status" "QATaskReviewStatus" NOT NULL DEFAULT 'PENDING',
    "weightedScore" DECIMAL(5,2),
    "failedCriticalCount" INTEGER,
    "scoreCap" DECIMAL(5,2),
    "finalScore" DECIMAL(5,2),
    "submittedAt" TIMESTAMP(3),
    "taskSnapshot" JSONB,
    "reviewerNotes" TEXT,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "QATaskReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QALineResult" (
    "id" TEXT NOT NULL,
    "taskReviewId" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "response" "QAReviewLineResponse" NOT NULL,
    "comment" TEXT,
    "labelSnapshot" TEXT NOT NULL,
    "weightSnapshot" DECIMAL(10,2) NOT NULL,
    "isCriticalSnapshot" BOOLEAN NOT NULL,
    "allowNaSnapshot" BOOLEAN NOT NULL,

    CONSTRAINT "QALineResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QATemplate_slug_key" ON "QATemplate"("slug");

-- CreateIndex
CREATE INDEX "QATemplate_taskType_isActive_idx" ON "QATemplate"("taskType", "isActive");

-- CreateIndex
CREATE INDEX "QATemplate_taskType_wodIvcsSource_isActive_idx" ON "QATemplate"("taskType", "wodIvcsSource", "isActive");

-- CreateIndex
CREATE INDEX "QATemplateVersion_templateId_idx" ON "QATemplateVersion"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "QATemplateVersion_templateId_version_key" ON "QATemplateVersion"("templateId", "version");

-- CreateIndex
CREATE INDEX "QALine_templateVersionId_idx" ON "QALine"("templateVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "QALine_templateVersionId_slug_key" ON "QALine"("templateVersionId", "slug");

-- CreateIndex
CREATE INDEX "QASampleBatch_reviewerId_createdAt_idx" ON "QASampleBatch"("reviewerId", "createdAt");

-- CreateIndex
CREATE INDEX "QASampleBatch_subjectAgentId_createdAt_idx" ON "QASampleBatch"("subjectAgentId", "createdAt");

-- CreateIndex
CREATE INDEX "QASampleBatch_status_idx" ON "QASampleBatch"("status");

-- CreateIndex
CREATE INDEX "QASampleBatchTask_taskId_idx" ON "QASampleBatchTask"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "QASampleBatchTask_batchId_taskId_key" ON "QASampleBatchTask"("batchId", "taskId");

-- CreateIndex
CREATE UNIQUE INDEX "QATaskReview_taskId_key" ON "QATaskReview"("taskId");

-- CreateIndex
CREATE INDEX "QATaskReview_batchId_idx" ON "QATaskReview"("batchId");

-- CreateIndex
CREATE INDEX "QATaskReview_status_idx" ON "QATaskReview"("status");

-- CreateIndex
CREATE INDEX "QATaskReview_templateVersionId_idx" ON "QATaskReview"("templateVersionId");

-- CreateIndex
CREATE INDEX "QATaskReview_expiresAt_idx" ON "QATaskReview"("expiresAt");

-- CreateIndex
CREATE INDEX "QALineResult_taskReviewId_idx" ON "QALineResult"("taskReviewId");

-- CreateIndex
CREATE UNIQUE INDEX "QALineResult_taskReviewId_lineId_key" ON "QALineResult"("taskReviewId", "lineId");

-- AddForeignKey
ALTER TABLE "QATemplate" ADD CONSTRAINT "QATemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QATemplateVersion" ADD CONSTRAINT "QATemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "QATemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QATemplateVersion" ADD CONSTRAINT "QATemplateVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QALine" ADD CONSTRAINT "QALine_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "QATemplateVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QASampleBatch" ADD CONSTRAINT "QASampleBatch_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QASampleBatch" ADD CONSTRAINT "QASampleBatch_subjectAgentId_fkey" FOREIGN KEY ("subjectAgentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QASampleBatch" ADD CONSTRAINT "QASampleBatch_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "QATemplateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QASampleBatchTask" ADD CONSTRAINT "QASampleBatchTask_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "QASampleBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QASampleBatchTask" ADD CONSTRAINT "QASampleBatchTask_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QATaskReview" ADD CONSTRAINT "QATaskReview_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "QASampleBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QATaskReview" ADD CONSTRAINT "QATaskReview_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QATaskReview" ADD CONSTRAINT "QATaskReview_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "QATemplateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QATaskReview" ADD CONSTRAINT "QATaskReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QALineResult" ADD CONSTRAINT "QALineResult_taskReviewId_fkey" FOREIGN KEY ("taskReviewId") REFERENCES "QATaskReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QALineResult" ADD CONSTRAINT "QALineResult_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "QALine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
