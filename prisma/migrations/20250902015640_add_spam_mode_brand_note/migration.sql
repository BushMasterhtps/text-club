-- DropIndex
DROP INDEX "public"."SpamRule_brand_enabled_mode_idx";

-- AlterTable
ALTER TABLE "public"."SpamRule" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "SpamRule_enabled_idx" ON "public"."SpamRule"("enabled");

-- CreateIndex
CREATE INDEX "SpamRule_brand_idx" ON "public"."SpamRule"("brand");
