-- WOD/IVCS v2 Phase 4A: agent workflow session + submission (additive only)

-- AlterEnum
ALTER TYPE "WodIvcsActionType" ADD VALUE 'AGENT_WORK_STARTED';
ALTER TYPE "WodIvcsActionType" ADD VALUE 'WORKFLOW_SUBMITTED';

-- AlterTable
ALTER TABLE "WodIvcsOrder" ADD COLUMN "activeWorkflowVersionId" TEXT,
ADD COLUMN "workStartedAt" TIMESTAMP(3),
ADD COLUMN "workStartedById" TEXT;

-- CreateTable
CREATE TABLE "WodIvcsWorkflowSubmission" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "workflowVersionId" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answersJson" JSONB NOT NULL,
    "matchedRoutingRuleId" TEXT,
    "matchedOutcomeRuleName" TEXT,
    "matchedOutcomeRulePriority" INTEGER,
    "targetQueue" "WodIvcsOperationalQueue" NOT NULL,
    "routingMatrixHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WodIvcsWorkflowSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WodIvcsWorkflowSubmission_orderId_submittedAt_idx" ON "WodIvcsWorkflowSubmission"("orderId", "submittedAt");

-- CreateIndex
CREATE INDEX "WodIvcsWorkflowSubmission_workflowVersionId_idx" ON "WodIvcsWorkflowSubmission"("workflowVersionId");

-- CreateIndex
CREATE INDEX "WodIvcsWorkflowSubmission_submittedById_idx" ON "WodIvcsWorkflowSubmission"("submittedById");

-- AddForeignKey
ALTER TABLE "WodIvcsOrder" ADD CONSTRAINT "WodIvcsOrder_activeWorkflowVersionId_fkey" FOREIGN KEY ("activeWorkflowVersionId") REFERENCES "WodIvcsWorkflowVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WodIvcsOrder" ADD CONSTRAINT "WodIvcsOrder_workStartedById_fkey" FOREIGN KEY ("workStartedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WodIvcsWorkflowSubmission" ADD CONSTRAINT "WodIvcsWorkflowSubmission_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "WodIvcsOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WodIvcsWorkflowSubmission" ADD CONSTRAINT "WodIvcsWorkflowSubmission_workflowVersionId_fkey" FOREIGN KEY ("workflowVersionId") REFERENCES "WodIvcsWorkflowVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WodIvcsWorkflowSubmission" ADD CONSTRAINT "WodIvcsWorkflowSubmission_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WodIvcsWorkflowSubmission" ADD CONSTRAINT "WodIvcsWorkflowSubmission_matchedRoutingRuleId_fkey" FOREIGN KEY ("matchedRoutingRuleId") REFERENCES "WodIvcsWorkflowRoutingRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
