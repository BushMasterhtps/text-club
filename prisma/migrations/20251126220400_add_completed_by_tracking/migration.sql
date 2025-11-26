-- AlterTable
ALTER TABLE "Task" ADD COLUMN "completedBy" TEXT,
ADD COLUMN "completedAt" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_completedBy_fkey" FOREIGN KEY ("completedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex (optional, for performance)
CREATE INDEX IF NOT EXISTS "Task_completedBy_idx" ON "Task"("completedBy");
CREATE INDEX IF NOT EXISTS "Task_completedAt_idx" ON "Task"("completedAt");

