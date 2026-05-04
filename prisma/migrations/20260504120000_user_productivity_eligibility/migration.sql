-- AlterTable
ALTER TABLE "User" ADD COLUMN     "productivityEligible" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "productivityExemptReason" TEXT;

-- Backfill: Holds-only specialization (single element HOLDS) excluded from productivity subjects
UPDATE "User"
SET "productivityEligible" = false
WHERE "agentTypes" = ARRAY['HOLDS']::text[];

-- CreateIndex
CREATE INDEX "User_productivityEligible_idx" ON "User"("productivityEligible");
