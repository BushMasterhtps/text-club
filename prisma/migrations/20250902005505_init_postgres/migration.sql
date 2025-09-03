-- CreateEnum
CREATE TYPE "public"."Role" AS ENUM ('MANAGER', 'AGENT');

-- CreateEnum
CREATE TYPE "public"."TaskStatus" AS ENUM ('PENDING', 'SPAM_REVIEW', 'IN_PROGRESS', 'ASSISTANCE_REQUIRED', 'RESOLVED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "public"."RawStatus" AS ENUM ('READY', 'SPAM_REVIEW', 'PROMOTED', 'SPAM_ARCHIVED');

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" "public"."Role" NOT NULL DEFAULT 'AGENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isLive" BOOLEAN NOT NULL DEFAULT false,
    "lastSeen" TIMESTAMP(3),
    "maxOpen" INTEGER NOT NULL DEFAULT 200,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Task" (
    "id" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "text" TEXT,
    "brand" TEXT,
    "assignedToId" TEXT,
    "rawMessageId" TEXT,
    "status" "public"."TaskStatus" NOT NULL DEFAULT 'PENDING',
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "durationSec" INTEGER,
    "disposition" TEXT,
    "sfOrderNumber" TEXT,
    "assistanceNotes" TEXT,
    "managerResponse" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AssistanceRequest" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUIRED',
    "responseText" TEXT,
    "respondedBy" TEXT,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistanceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TaskHistory" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "prevStatus" "public"."TaskStatus",
    "newStatus" "public"."TaskStatus",
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ImportBatch" (
    "id" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RawMessage" (
    "id" TEXT NOT NULL,
    "importBatchId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3),
    "phone" TEXT,
    "email" TEXT,
    "brand" TEXT,
    "text" TEXT,
    "source" TEXT,
    "hashKey" TEXT NOT NULL,
    "status" "public"."RawStatus" NOT NULL DEFAULT 'READY',
    "previewMatches" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RawMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SpamRule" (
    "id" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "patternNorm" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpamRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SpamLabel" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "ruleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpamLabel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SpamArchive" (
    "id" TEXT NOT NULL,
    "textHash" TEXT NOT NULL,
    "text" TEXT,
    "brand" TEXT,
    "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" TIMESTAMP(3) NOT NULL,
    "hitCount" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "SpamArchive_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE INDEX "User_isLive_lastSeen_idx" ON "public"."User"("isLive", "lastSeen");

-- CreateIndex
CREATE INDEX "Task_assignedToId_idx" ON "public"."Task"("assignedToId");

-- CreateIndex
CREATE INDEX "Task_status_createdAt_idx" ON "public"."Task"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Task_rawMessageId_idx" ON "public"."Task"("rawMessageId");

-- CreateIndex
CREATE INDEX "AssistanceRequest_taskId_idx" ON "public"."AssistanceRequest"("taskId");

-- CreateIndex
CREATE INDEX "AssistanceRequest_agentId_idx" ON "public"."AssistanceRequest"("agentId");

-- CreateIndex
CREATE INDEX "TaskHistory_taskId_idx" ON "public"."TaskHistory"("taskId");

-- CreateIndex
CREATE INDEX "TaskHistory_actorId_idx" ON "public"."TaskHistory"("actorId");

-- CreateIndex
CREATE UNIQUE INDEX "RawMessage_hashKey_key" ON "public"."RawMessage"("hashKey");

-- CreateIndex
CREATE INDEX "RawMessage_importBatchId_idx" ON "public"."RawMessage"("importBatchId");

-- CreateIndex
CREATE INDEX "RawMessage_createdAt_idx" ON "public"."RawMessage"("createdAt");

-- CreateIndex
CREATE INDEX "RawMessage_status_idx" ON "public"."RawMessage"("status");

-- CreateIndex
CREATE INDEX "RawMessage_status_createdAt_idx" ON "public"."RawMessage"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SpamLabel_taskId_idx" ON "public"."SpamLabel"("taskId");

-- CreateIndex
CREATE INDEX "SpamLabel_ruleId_idx" ON "public"."SpamLabel"("ruleId");

-- CreateIndex
CREATE INDEX "SpamLabel_createdAt_idx" ON "public"."SpamLabel"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SpamArchive_textHash_key" ON "public"."SpamArchive"("textHash");

-- CreateIndex
CREATE INDEX "SpamArchive_brand_idx" ON "public"."SpamArchive"("brand");

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_rawMessageId_fkey" FOREIGN KEY ("rawMessageId") REFERENCES "public"."RawMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AssistanceRequest" ADD CONSTRAINT "AssistanceRequest_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "public"."Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AssistanceRequest" ADD CONSTRAINT "AssistanceRequest_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TaskHistory" ADD CONSTRAINT "TaskHistory_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "public"."Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TaskHistory" ADD CONSTRAINT "TaskHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RawMessage" ADD CONSTRAINT "RawMessage_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "public"."ImportBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SpamLabel" ADD CONSTRAINT "SpamLabel_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "public"."Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SpamLabel" ADD CONSTRAINT "SpamLabel_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "public"."SpamRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
