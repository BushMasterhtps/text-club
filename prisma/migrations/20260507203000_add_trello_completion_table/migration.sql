-- TrelloCompletion parity: ensure the table exists (required by GET /api/agent/personal-scorecard)

CREATE TABLE IF NOT EXISTS "public"."TrelloCompletion" (
  "id" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "agentId" TEXT NOT NULL,
  "cardsCount" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" TEXT,

  CONSTRAINT "TrelloCompletion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TrelloCompletion_agentId_fkey" FOREIGN KEY ("agentId")
    REFERENCES "public"."User"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT "TrelloCompletion_date_agentId_key" UNIQUE ("date", "agentId")
);

-- Indexes for common lookups
CREATE INDEX IF NOT EXISTS "TrelloCompletion_date_idx" ON "public"."TrelloCompletion"("date");
CREATE INDEX IF NOT EXISTS "TrelloCompletion_agentId_idx" ON "public"."TrelloCompletion"("agentId");
