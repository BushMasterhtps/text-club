-- CreateTable
CREATE TABLE "public"."SpamLearning" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "brand" TEXT,
    "isSpam" BOOLEAN NOT NULL,
    "score" INTEGER NOT NULL,
    "reasons" TEXT[],
    "patterns" TEXT NOT NULL,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpamLearning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BlockedPhone" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "brand" TEXT,
    "reason" TEXT,
    "blockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "blockedBy" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlockedPhone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SpamLearning_brand_idx" ON "public"."SpamLearning"("brand");

-- CreateIndex
CREATE INDEX "SpamLearning_isSpam_idx" ON "public"."SpamLearning"("isSpam");

-- CreateIndex
CREATE INDEX "SpamLearning_source_idx" ON "public"."SpamLearning"("source");

-- CreateIndex
CREATE INDEX "SpamLearning_createdAt_idx" ON "public"."SpamLearning"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BlockedPhone_phone_key" ON "public"."BlockedPhone"("phone");
