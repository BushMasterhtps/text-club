-- OneOnOneNote: table required by Team Analytics one-on-one notes (/api/manager/one-on-one).
-- Aligned with prisma/schema.prisma model OneOnOneNote. Additive / idempotent.

CREATE TABLE IF NOT EXISTS "public"."OneOnOneNote" (
  "id" TEXT NOT NULL,

  "meetingDate" TIMESTAMP(3) NOT NULL,
  "agentId" TEXT NOT NULL,
  "agentName" TEXT NOT NULL,
  "agentEmail" TEXT NOT NULL,
  "managerId" TEXT NOT NULL,
  "managerName" TEXT,

  "discussionPoints" TEXT,
  "strengths" TEXT,
  "areasForImprovement" TEXT,
  "notes" TEXT,

  "actionItems" JSONB,

  "nextMeetingDate" TIMESTAMP(3),
  "followUpRequired" BOOLEAN NOT NULL DEFAULT false,

  "emailTemplate" TEXT,
  "emailSent" BOOLEAN NOT NULL DEFAULT false,
  "emailSentAt" TIMESTAMP(3),

  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OneOnOneNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "OneOnOneNote_agentId_idx" ON "public"."OneOnOneNote" ("agentId");
CREATE INDEX IF NOT EXISTS "OneOnOneNote_meetingDate_idx" ON "public"."OneOnOneNote" ("meetingDate");
CREATE INDEX IF NOT EXISTS "OneOnOneNote_managerId_idx" ON "public"."OneOnOneNote" ("managerId");
CREATE INDEX IF NOT EXISTS "OneOnOneNote_agentId_meetingDate_idx" ON "public"."OneOnOneNote" ("agentId", "meetingDate");
