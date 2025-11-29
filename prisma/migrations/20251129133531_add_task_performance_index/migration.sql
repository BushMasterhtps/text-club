-- CreateIndex
CREATE INDEX "Task_status_endTime_assignedToId_completedBy_idx" ON "public"."Task"("status", "endTime", "assignedToId", "completedBy");

