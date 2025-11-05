# Sprint Ranking System - Database Migration

## Overview
This migration adds the `SprintRanking` table to store permanent sprint history for the 4 ranking systems (Task/Day, Lifetime Points, 2-Week Sprint, Hybrid 30/70).

## Production Migration (Railway)

### Step 1: Connect to Railway PostgreSQL

1. Go to Railway dashboard
2. Select your PostgreSQL database
3. Click "Connect" → "PostgreSQL CLI" or use the connection string

### Step 2: Run This SQL

```sql
-- Create SprintRanking table for permanent sprint history
CREATE TABLE "SprintRanking" (
    "id" TEXT NOT NULL,
    "sprintNumber" INTEGER NOT NULL,
    "sprintStart" TIMESTAMP(3) NOT NULL,
    "sprintEnd" TIMESTAMP(3) NOT NULL,
    "agentId" TEXT NOT NULL,
    "agentName" TEXT NOT NULL,
    "agentEmail" TEXT NOT NULL,
    "tasksCompleted" INTEGER NOT NULL,
    "trelloCompleted" INTEGER NOT NULL,
    "totalCompleted" INTEGER NOT NULL,
    "daysWorked" INTEGER NOT NULL,
    "weightedPoints" DOUBLE PRECISION NOT NULL,
    "ptsPerDay" DOUBLE PRECISION NOT NULL,
    "tasksPerDay" DOUBLE PRECISION NOT NULL,
    "hybridScore" DOUBLE PRECISION NOT NULL,
    "rankByPtsPerDay" INTEGER NOT NULL,
    "rankByTasksPerDay" INTEGER NOT NULL,
    "rankByHybrid" INTEGER NOT NULL,
    "tier" TEXT NOT NULL,
    "percentile" INTEGER NOT NULL,
    "isChampion" BOOLEAN NOT NULL DEFAULT false,
    "isTopThree" BOOLEAN NOT NULL DEFAULT false,
    "isSenior" BOOLEAN NOT NULL DEFAULT false,
    "avgHandleTimeSec" INTEGER NOT NULL,
    "totalTimeSec" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SprintRanking_pkey" PRIMARY KEY ("id")
);

-- Create indexes for performance
CREATE UNIQUE INDEX "SprintRanking_sprintNumber_agentId_key" ON "SprintRanking"("sprintNumber", "agentId");
CREATE INDEX "SprintRanking_sprintNumber_idx" ON "SprintRanking"("sprintNumber");
CREATE INDEX "SprintRanking_agentId_idx" ON "SprintRanking"("agentId");
CREATE INDEX "SprintRanking_sprintStart_idx" ON "SprintRanking"("sprintStart");
CREATE INDEX "SprintRanking_rankByPtsPerDay_idx" ON "SprintRanking"("rankByPtsPerDay");
CREATE INDEX "SprintRanking_rankByHybrid_idx" ON "SprintRanking"("rankByHybrid");

-- Verify table creation
SELECT COUNT(*) as record_count FROM "SprintRanking";
```

### Step 3: Verify

You should see:
```
✓ Table created successfully
✓ 6 indexes created
✓ record_count: 0
```

## Local Development (Optional)

If you want to update your local schema:

```bash
npx prisma migrate dev --name add_sprint_ranking
```

## What This Enables

✅ **Permanent sprint history** - Every 14-day sprint is archived
✅ **4 ranking systems** - Task/Day, Lifetime Points, Sprint Points, Hybrid
✅ **Historical analysis** - View any past sprint
✅ **Winner tracking** - Sprint champions permanently recorded
✅ **Trend analysis** - Agent performance over time
✅ **Manager reports** - Export rankings by period

## Sprint Cycles (Starting Nov 1, 2025)

- Sprint 1: Nov 1-14, 2025
- Sprint 2: Nov 15-28, 2025
- Sprint 3: Nov 29 - Dec 12, 2025
- Sprint 4: Dec 13-26, 2025
- Sprint 5: Dec 27, 2025 - Jan 9, 2026
- ... (continues every 14 days)

## Next Steps

After running the migration:
1. Deploy the sprint calculation API
2. Update Performance Scorecard UI with tabs
3. Add agent portal personal scorecard
4. Backfill Nov 1-14 sprint data (if needed)

