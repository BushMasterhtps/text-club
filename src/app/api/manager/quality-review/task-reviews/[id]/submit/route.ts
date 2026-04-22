import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiAuthDeniedResponse, requireManagerApiAuth } from "@/lib/auth";
import { submitQATaskReviewInTransaction } from "@/lib/quality-review-submit";
import type { QAReviewLineResponse } from "@prisma/client";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireManagerApiAuth(request);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);

  const { id: reviewId } = await context.params;

  try {
    const body = (await request.json()) as {
      responses?: Array<{ lineId: string; response: QAReviewLineResponse; comment?: string | null }>;
      reviewerNotes?: string | null;
    };

    if (!body.responses?.length) {
      return NextResponse.json(
        { success: false, error: "responses array is required" },
        { status: 400 }
      );
    }

    const pre = await prisma.qATaskReview.findFirst({
      where: { id: reviewId, reviewerId: auth.userId, status: "PENDING" },
      include: { batch: { select: { status: true } } },
    });
    if (!pre) {
      return NextResponse.json(
        { success: false, error: "Review not found or already submitted" },
        { status: 404 }
      );
    }
    if (pre.batchId && pre.batch?.status === "CANCELLED") {
      return NextResponse.json(
        { success: false, error: "Batch was cancelled" },
        { status: 400 }
      );
    }

    const result = await prisma.$transaction(async (tx) =>
      submitQATaskReviewInTransaction(tx, {
        reviewId,
        authUserId: auth.userId,
        responses: body.responses!,
        reviewerNotes: body.reviewerNotes,
      })
    );

    return NextResponse.json({
      success: true,
      data: {
        reviewId,
        taskId: result.taskId,
        batchId: result.batchId,
        scores: result.scores,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    if (msg === "REVIEW_NOT_FOUND_OR_NOT_PENDING") {
      return NextResponse.json(
        { success: false, error: "Review not found or already submitted" },
        { status: 400 }
      );
    }
    if (
      msg.startsWith("Expected ") ||
      msg.startsWith("Unknown lineId") ||
      msg.startsWith("Duplicate response") ||
      msg.startsWith("Invalid response") ||
      msg.startsWith("Each checklist line")
    ) {
      return NextResponse.json({ success: false, error: msg }, { status: 400 });
    }
    if (
      msg.startsWith("MISSING_RESPONSE") ||
      msg.startsWith("INVALID_RESPONSE_FOR_LINE") ||
      msg.startsWith("NA_NOT_ALLOWED") ||
      msg.startsWith("NO_APPLICABLE_LINES")
    ) {
      return NextResponse.json({ success: false, error: msg }, { status: 400 });
    }
    if (msg === "TASK_NOT_FOUND") {
      return NextResponse.json({ success: false, error: "Task not found" }, { status: 404 });
    }
    console.error("[quality-review/task-reviews/submit]", e);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
