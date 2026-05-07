-- Idempotent Task column parity: repeats ADD COLUMN IF NOT EXISTS for Holds + Yotpo fields from schema.
-- Safe if prior migrations already ran against this DB; repairs partial/wrong-URL databases.

ALTER TABLE "Task"
  ADD COLUMN IF NOT EXISTS "holdsOrderDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "holdsOrderNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "holdsCustomerEmail" TEXT,
  ADD COLUMN IF NOT EXISTS "holdsPriority" INTEGER,
  ADD COLUMN IF NOT EXISTS "holdsDaysInSystem" INTEGER,
  ADD COLUMN IF NOT EXISTS "holdsStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "holdsPhoneNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "holdsOrderAmount" DECIMAL(65, 30),
  ADD COLUMN IF NOT EXISTS "holdsNotes" TEXT,
  ADD COLUMN IF NOT EXISTS "holdsQueueHistory" JSONB;

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
