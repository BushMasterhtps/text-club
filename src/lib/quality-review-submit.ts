import { computeQualityReviewScores } from "@/lib/quality-review-scoring";
import type { Prisma, QAReviewLineResponse } from "@prisma/client";

export type QASubmitLineInput = {
  lineId: string;
  response: QAReviewLineResponse;
  comment?: string | null;
};

export function buildQATaskSnapshot(task: {
  id: string;
  taskType: string;
  disposition: string | null;
  endTime: Date | null;
  brand: string | null;
  text: string | null;
  assignedToId: string | null;
  completedBy: string | null;
}): Prisma.InputJsonValue {
  return {
    id: task.id,
    taskType: task.taskType,
    disposition: task.disposition,
    endTime: task.endTime?.toISOString() ?? null,
    brand: task.brand,
    textSnippet: task.text ? task.text.slice(0, 500) : null,
    assignedToId: task.assignedToId,
    completedBy: task.completedBy,
    capturedAt: new Date().toISOString(),
  };
}

export type QASubmitScores = {
  earnedWeight: number;
  possibleWeight: number;
  weightedPercent: number;
  weightedScore: number;
  failedCriticalCount: number;
  scoreCap: number | null;
  finalScore: number;
};

/**
 * Persists line results + SUBMITTED review + flips isCurrentVersion for the task chain.
 * Caller must validate batch/cancel rules for batch-backed reviews.
 */
export async function submitQATaskReviewInTransaction(
  tx: Prisma.TransactionClient,
  params: {
    reviewId: string;
    authUserId: string;
    responses: QASubmitLineInput[];
    reviewerNotes?: string | null;
  }
): Promise<{
  taskId: string;
  batchId: string | null;
  scores: QASubmitScores;
}> {
  const { reviewId, authUserId, responses: bodyResponses, reviewerNotes } = params;

  const review = await tx.qATaskReview.findFirst({
    where: { id: reviewId, reviewerId: authUserId, status: "PENDING" },
  });
  if (!review) {
    throw new Error("REVIEW_NOT_FOUND_OR_NOT_PENDING");
  }

  const lines = await tx.qALine.findMany({
    where: { templateVersionId: review.templateVersionId },
    orderBy: [{ sectionOrder: "asc" }, { lineOrder: "asc" }],
  });

  if (lines.length !== bodyResponses.length) {
    throw new Error(`Expected ${lines.length} line responses, got ${bodyResponses.length}`);
  }

  const lineIds = new Set(lines.map((l) => l.id));
  const responseMap = new Map<string, QAReviewLineResponse>();
  const comments = new Map<string, string | null | undefined>();

  for (const r of bodyResponses) {
    if (!lineIds.has(r.lineId)) {
      throw new Error(`Unknown lineId: ${r.lineId}`);
    }
    if (responseMap.has(r.lineId)) {
      throw new Error(`Duplicate response for line ${r.lineId}`);
    }
    if (!["PASS", "FAIL", "NA"].includes(r.response)) {
      throw new Error(`Invalid response for line ${r.lineId}`);
    }
    responseMap.set(r.lineId, r.response);
    comments.set(r.lineId, r.comment);
  }

  if (responseMap.size !== lines.length) {
    throw new Error("Each checklist line must appear exactly once in responses");
  }

  const scores = computeQualityReviewScores(lines, responseMap);

  const task = await tx.task.findFirst({
    where: { id: review.taskId },
    select: {
      id: true,
      taskType: true,
      disposition: true,
      endTime: true,
      brand: true,
      text: true,
      assignedToId: true,
      completedBy: true,
    },
  });

  if (!task) {
    throw new Error("TASK_NOT_FOUND");
  }

  for (const line of lines) {
    const resp = responseMap.get(line.id)!;
    await tx.qALineResult.create({
      data: {
        taskReviewId: review.id,
        lineId: line.id,
        response: resp,
        comment: comments.get(line.id) ?? null,
        labelSnapshot: line.label,
        weightSnapshot: line.weight,
        isCriticalSnapshot: line.isCritical,
        allowNaSnapshot: line.allowNa,
      },
    });
  }

  await tx.qATaskReview.updateMany({
    where: { taskId: review.taskId, id: { not: review.id } },
    data: { isCurrentVersion: false },
  });

  await tx.qATaskReview.update({
    where: { id: review.id },
    data: {
      status: "SUBMITTED",
      submittedAt: new Date(),
      weightedScore: scores.weightedScore,
      failedCriticalCount: scores.failedCriticalCount,
      scoreCap: scores.scoreCap ?? null,
      finalScore: scores.finalScore,
      taskSnapshot: buildQATaskSnapshot(task),
      reviewerNotes: reviewerNotes?.trim() || null,
      isCurrentVersion: true,
    },
  });

  if (review.batchId) {
    const pending = await tx.qATaskReview.count({
      where: { batchId: review.batchId, status: "PENDING" },
    });
    if (pending === 0) {
      await tx.qASampleBatch.update({
        where: { id: review.batchId },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
    }
  }

  return {
    taskId: review.taskId,
    batchId: review.batchId,
    scores: {
      earnedWeight: scores.earnedWeight,
      possibleWeight: scores.possibleWeight,
      weightedPercent: scores.weightedPercent,
      weightedScore: scores.weightedScore,
      failedCriticalCount: scores.failedCriticalCount,
      scoreCap: scores.scoreCap,
      finalScore: scores.finalScore,
    },
  };
}
