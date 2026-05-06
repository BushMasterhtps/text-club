-- Email Request manager disposition review (Unable / Unfeasible internal queue)

CREATE TYPE "EmailRequestDispositionReviewVerdict" AS ENUM ('CORRECT', 'INCORRECT', 'NEEDS_FOLLOW_UP');

CREATE TABLE "EmailRequestDispositionReview" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "verdict" "EmailRequestDispositionReviewVerdict" NOT NULL,
    "note" TEXT,
    "reviewedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailRequestDispositionReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailRequestDispositionReview_taskId_key" ON "EmailRequestDispositionReview"("taskId");

CREATE INDEX "EmailRequestDispositionReview_reviewerId_idx" ON "EmailRequestDispositionReview"("reviewerId");

CREATE INDEX "EmailRequestDispositionReview_reviewedAt_idx" ON "EmailRequestDispositionReview"("reviewedAt");

ALTER TABLE "EmailRequestDispositionReview" ADD CONSTRAINT "EmailRequestDispositionReview_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmailRequestDispositionReview" ADD CONSTRAINT "EmailRequestDispositionReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
