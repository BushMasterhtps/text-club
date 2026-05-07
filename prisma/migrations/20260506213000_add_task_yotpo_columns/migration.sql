-- Yotpo-specific columns on Task (nullable). Matches prisma/schema.prisma Task yotpo* fields.

ALTER TABLE "Task"
  ADD COLUMN IF NOT EXISTS "yotpoDateSubmitted" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "yotpoPrOrYotpo" TEXT,
  ADD COLUMN IF NOT EXISTS "yotpoCustomerName" TEXT,
  ADD COLUMN IF NOT EXISTS "yotpoEmail" TEXT,
  ADD COLUMN IF NOT EXISTS "yotpoOrderDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "yotpoProduct" TEXT,
  ADD COLUMN IF NOT EXISTS "yotpoIssueTopic" TEXT,
  ADD COLUMN IF NOT EXISTS "yotpoReviewDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "yotpoReview" TEXT,
  ADD COLUMN IF NOT EXISTS "yotpoSfOrderLink" TEXT,
  ADD COLUMN IF NOT EXISTS "yotpoImportSource" TEXT,
  ADD COLUMN IF NOT EXISTS "yotpoSubmittedBy" TEXT;
