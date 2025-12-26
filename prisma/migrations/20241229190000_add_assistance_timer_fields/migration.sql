-- AlterTable
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "assistancePausedDurationSec" INTEGER,
ADD COLUMN IF NOT EXISTS "assistanceRequestedAt" TIMESTAMP(3);

