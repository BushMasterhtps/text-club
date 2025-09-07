-- CreateTable
CREATE TABLE "public"."ImportSession" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importedBy" TEXT,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "imported" INTEGER NOT NULL DEFAULT 0,
    "duplicates" INTEGER NOT NULL DEFAULT 0,
    "filtered" INTEGER NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0,
    "duplicateDetails" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ImportDuplicate" (
    "id" TEXT NOT NULL,
    "importSessionId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "documentNumber" TEXT,
    "webOrder" TEXT,
    "customerName" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "originalTaskId" TEXT,
    "originalCreatedAt" TIMESTAMP(3),
    "originalCompletedAt" TIMESTAMP(3),
    "originalDisposition" TEXT,
    "originalCompletedBy" TEXT,
    "ageInDays" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportDuplicate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImportSession_source_idx" ON "public"."ImportSession"("source");

-- CreateIndex
CREATE INDEX "ImportSession_importedAt_idx" ON "public"."ImportSession"("importedAt");

-- CreateIndex
CREATE INDEX "ImportSession_importedBy_idx" ON "public"."ImportSession"("importedBy");

-- CreateIndex
CREATE INDEX "ImportDuplicate_importSessionId_idx" ON "public"."ImportDuplicate"("importSessionId");

-- CreateIndex
CREATE INDEX "ImportDuplicate_originalTaskId_idx" ON "public"."ImportDuplicate"("originalTaskId");

-- CreateIndex
CREATE INDEX "ImportDuplicate_source_idx" ON "public"."ImportDuplicate"("source");

-- AddForeignKey
ALTER TABLE "public"."ImportDuplicate" ADD CONSTRAINT "ImportDuplicate_importSessionId_fkey" FOREIGN KEY ("importSessionId") REFERENCES "public"."ImportSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
