-- CreateEnum
CREATE TYPE "AssistanceMessageAuthorRole" AS ENUM ('AGENT', 'MANAGER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "AssistanceMessageType" AS ENUM ('REQUEST', 'RESPONSE', 'SYSTEM_NOTE');

-- CreateTable
CREATE TABLE "AssistanceThread" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistanceThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssistanceMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "authorUserId" TEXT,
    "authorRole" "AssistanceMessageAuthorRole" NOT NULL,
    "messageType" "AssistanceMessageType" NOT NULL,
    "body" TEXT NOT NULL,
    "taskStatusAtSend" "TaskStatus" NOT NULL,
    "taskTypeAtSend" "TaskType" NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistanceMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AssistanceThread_taskId_key" ON "AssistanceThread"("taskId");

-- CreateIndex
CREATE INDEX "AssistanceThread_lastActivityAt_idx" ON "AssistanceThread"("lastActivityAt");

-- CreateIndex
CREATE INDEX "AssistanceMessage_threadId_createdAt_idx" ON "AssistanceMessage"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "AssistanceMessage_taskId_createdAt_idx" ON "AssistanceMessage"("taskId", "createdAt");

-- AddForeignKey
ALTER TABLE "AssistanceThread" ADD CONSTRAINT "AssistanceThread_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistanceMessage" ADD CONSTRAINT "AssistanceMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "AssistanceThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistanceMessage" ADD CONSTRAINT "AssistanceMessage_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistanceMessage" ADD CONSTRAINT "AssistanceMessage_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
