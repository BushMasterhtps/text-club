-- Quality Review: allow multiple reviews per task (regrade history), optional batch, subject + chain metadata.

DROP INDEX IF EXISTS "QATaskReview_taskId_key";

ALTER TABLE "QATaskReview" ALTER COLUMN "batchId" DROP NOT NULL;

ALTER TABLE "QATaskReview" ADD COLUMN "subjectAgentId" TEXT;
ALTER TABLE "QATaskReview" ADD COLUMN "parentReviewId" TEXT;
ALTER TABLE "QATaskReview" ADD COLUMN "isCurrentVersion" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "QATaskReview" ADD COLUMN "regradeReason" TEXT;

UPDATE "QATaskReview" r
SET "subjectAgentId" = b."subjectAgentId"
FROM "QASampleBatch" b
WHERE r."batchId" IS NOT NULL
  AND r."batchId" = b."id";

ALTER TABLE "QATaskReview" ADD CONSTRAINT "QATaskReview_subjectAgentId_fkey"
  FOREIGN KEY ("subjectAgentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "QATaskReview" ADD CONSTRAINT "QATaskReview_parentReviewId_fkey"
  FOREIGN KEY ("parentReviewId") REFERENCES "QATaskReview"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "QATaskReview_taskId_isCurrentVersion_idx"
  ON "QATaskReview" ("taskId", "isCurrentVersion");

CREATE INDEX "QATaskReview_subjectAgentId_submittedAt_idx"
  ON "QATaskReview" ("subjectAgentId", "submittedAt");
