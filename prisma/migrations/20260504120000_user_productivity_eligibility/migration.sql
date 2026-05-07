-- AlterTable
ALTER TABLE "User" ADD COLUMN     "productivityEligible" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "productivityExemptReason" TEXT;

-- CreateIndex
CREATE INDEX "User_productivityEligible_idx" ON "User"("productivityEligible");
