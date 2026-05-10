-- Additive: durable per-agent work sessions for future multi-stage productivity (e.g. Holds).
-- Does not alter Task workflow or existing reports.

CREATE TABLE "TaskWorkSession" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "taskType" "TaskType" NOT NULL,
    "agentId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3) NOT NULL,
    "durationSec" INTEGER,
    "fromQueue" TEXT,
    "toQueue" TEXT,
    "disposition" TEXT,
    "outcomeType" TEXT NOT NULL,
    "countsTowardProductivity" BOOLEAN NOT NULL DEFAULT true,
    "isFinalResolution" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'AGENT_UI',
    "workflowType" TEXT,
    "metadata" JSONB,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskWorkSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TaskWorkSession_idempotencyKey_key" ON "TaskWorkSession"("idempotencyKey");

CREATE INDEX "TaskWorkSession_taskId_idx" ON "TaskWorkSession"("taskId");

CREATE INDEX "TaskWorkSession_agentId_endedAt_idx" ON "TaskWorkSession"("agentId", "endedAt");

CREATE INDEX "TaskWorkSession_taskType_endedAt_idx" ON "TaskWorkSession"("taskType", "endedAt");

CREATE INDEX "TaskWorkSession_countsTowardProductivity_endedAt_idx" ON "TaskWorkSession"("countsTowardProductivity", "endedAt");

CREATE INDEX "TaskWorkSession_taskType_agentId_endedAt_idx" ON "TaskWorkSession"("taskType", "agentId", "endedAt");

CREATE INDEX "TaskWorkSession_fromQueue_endedAt_idx" ON "TaskWorkSession"("fromQueue", "endedAt");

CREATE INDEX "TaskWorkSession_toQueue_endedAt_idx" ON "TaskWorkSession"("toQueue", "endedAt");

CREATE INDEX "TaskWorkSession_isFinalResolution_endedAt_idx" ON "TaskWorkSession"("isFinalResolution", "endedAt");

ALTER TABLE "TaskWorkSession" ADD CONSTRAINT "TaskWorkSession_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaskWorkSession" ADD CONSTRAINT "TaskWorkSession_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
