-- SprintRanking parity: ensure the table exists (required by sprint history/rankings APIs).

CREATE TABLE IF NOT EXISTS "public"."SprintRanking" (
  "id" TEXT NOT NULL,

  -- Sprint identification
  "sprintNumber" INTEGER NOT NULL,
  "sprintStart" TIMESTAMP(3) NOT NULL,
  "sprintEnd" TIMESTAMP(3) NOT NULL,

  -- Agent info
  "agentId" TEXT NOT NULL,
  "agentName" TEXT NOT NULL,
  "agentEmail" TEXT NOT NULL,

  -- Sprint performance
  "tasksCompleted" INTEGER NOT NULL,
  "trelloCompleted" INTEGER NOT NULL,
  "totalCompleted" INTEGER NOT NULL,
  "daysWorked" INTEGER NOT NULL,

  -- Points and rankings
  "weightedPoints" DOUBLE PRECISION NOT NULL,
  "ptsPerDay" DOUBLE PRECISION NOT NULL,
  "tasksPerDay" DOUBLE PRECISION NOT NULL,
  "hybridScore" DOUBLE PRECISION NOT NULL,

  -- Rankings (1 = best)
  "rankByPtsPerDay" INTEGER NOT NULL,
  "rankByTasksPerDay" INTEGER NOT NULL,
  "rankByHybrid" INTEGER NOT NULL,

  -- Metadata
  "tier" TEXT NOT NULL,
  "percentile" INTEGER NOT NULL,
  "isChampion" BOOLEAN NOT NULL DEFAULT false,
  "isTopThree" BOOLEAN NOT NULL DEFAULT false,
  "isSenior" BOOLEAN NOT NULL DEFAULT false,

  -- Stats
  "avgHandleTimeSec" INTEGER NOT NULL,
  "totalTimeSec" INTEGER NOT NULL,

  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SprintRanking_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SprintRanking_sprintNumber_agentId_key" UNIQUE ("sprintNumber", "agentId")
);

-- Indexes from schema.prisma
CREATE INDEX IF NOT EXISTS "SprintRanking_sprintNumber_idx" ON "public"."SprintRanking"("sprintNumber");
CREATE INDEX IF NOT EXISTS "SprintRanking_agentId_idx" ON "public"."SprintRanking"("agentId");
CREATE INDEX IF NOT EXISTS "SprintRanking_sprintStart_idx" ON "public"."SprintRanking"("sprintStart");
CREATE INDEX IF NOT EXISTS "SprintRanking_rankByPtsPerDay_idx" ON "public"."SprintRanking"("rankByPtsPerDay");
CREATE INDEX IF NOT EXISTS "SprintRanking_rankByHybrid_idx" ON "public"."SprintRanking"("rankByHybrid");
