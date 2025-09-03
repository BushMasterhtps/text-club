/*
  Warnings:

  - A unique constraint covering the columns `[patternNorm,mode,brand]` on the table `SpamRule` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "public"."SpamMode" AS ENUM ('CONTAINS', 'LONE', 'REGEX');

-- AlterTable
ALTER TABLE "public"."SpamRule" ADD COLUMN     "brand" TEXT,
ADD COLUMN     "mode" "public"."SpamMode" NOT NULL DEFAULT 'CONTAINS',
ADD COLUMN     "note" TEXT;

-- CreateIndex
CREATE INDEX "SpamRule_brand_enabled_mode_idx" ON "public"."SpamRule"("brand", "enabled", "mode");

-- CreateIndex
CREATE UNIQUE INDEX "SpamRule_patternNorm_mode_brand_key" ON "public"."SpamRule"("patternNorm", "mode", "brand");
