-- Task sent-back parity: add columns referenced by WOD/IVCS dashboards and task-management queries.
-- Fixes Prisma P2022: column `Task.sentBackAt` does not exist.
-- Safe to run on any DB: additive + IF NOT EXISTS.

ALTER TABLE "Task"
  ADD COLUMN IF NOT EXISTS "sentBackBy" TEXT,
  ADD COLUMN IF NOT EXISTS "sentBackAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "sentBackDisposition" TEXT;

