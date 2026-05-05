import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiAuthDeniedResponse, requireManagerApiAuth } from "@/lib/auth";
import { deleteExpiredQaPendingReviewsForTask } from "@/lib/quality-review-pending-lock";

/**
 * Abandon a draft QA review (PENDING only). Deletes the row and any line results (normally none).
 * Batch-backed reviews must use batch cancel or be completed in the batch flow.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireManagerApiAuth(request);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);

  const { id: reviewId } = await context.params;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const review = await tx.qATaskReview.findFirst({
        where: { id: reviewId, reviewerId: auth.userId, status: "PENDING" },
        select: { id: true, taskId: true, batchId: true },
      });

      if (!review) {
        return { outcome: "not_found" as const };
      }

      if (review.batchId != null) {
        return { outcome: "batch" as const };
      }

      await deleteExpiredQaPendingReviewsForTask(tx, review.taskId);

      const remaining = await tx.qATaskReview.findFirst({
        where: { id: reviewId },
        select: { id: true },
      });
      if (!remaining) {
        return { outcome: "ok" as const };
      }

      await tx.qATaskReview.delete({ where: { id: reviewId } });
      return { outcome: "ok" as const };
    });

    if (result.outcome === "batch") {
      return NextResponse.json(
        {
          success: false,
          error:
            "This review is part of a batch. Use “Cancel batch” on the Quality Review page, or submit this task.",
        },
        { status: 400 }
      );
    }

    if (result.outcome === "not_found") {
      return NextResponse.json(
        { success: false, error: "Review not found or already finished." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      redirectTo: "/manager/quality-review/dashboard",
      data: { reviewId },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[quality-review/task-reviews/cancel]", e);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
