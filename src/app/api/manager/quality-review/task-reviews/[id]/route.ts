import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiAuthDeniedResponse, requireManagerApiAuth } from "@/lib/auth";

function serializeForClientJson<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, v) => {
      if (typeof v === "bigint") return v.toString();
      if (v instanceof Date) return v.toISOString();
      if (v && typeof v === "object") {
        const ctor = (v as { constructor?: { name?: string } }).constructor?.name;
        if (ctor === "Decimal") return (v as { toString: () => string }).toString();
      }
      return v;
    })
  );
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireManagerApiAuth(request);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);

  const { id: reviewId } = await context.params;

  try {
    const review = await prisma.qATaskReview.findFirst({
      where: { id: reviewId },
      include: {
        batch: { select: { id: true, status: true, reviewerId: true } },
        templateVersion: {
          select: {
            id: true,
            version: true,
            template: { select: { displayName: true, taskType: true, slug: true } },
          },
        },
      },
    });

    if (!review) {
      return NextResponse.json({ success: false, error: "Review not found" }, { status: 404 });
    }

    if (review.status === "PENDING") {
      if (review.reviewerId !== auth.userId) {
        return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
      }
      if (review.batchId && review.batch?.status === "CANCELLED") {
        return NextResponse.json(
          { success: false, error: "Batch was cancelled" },
          { status: 400 }
        );
      }
    }

    const [task, lines] = await Promise.all([
      prisma.task.findFirst({
        where: { id: review.taskId },
        include: {
          rawMessage: {
            select: { brand: true, phone: true, text: true, email: true },
          },
          assignedTo: { select: { id: true, name: true, email: true } },
          completedByUser: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.qALine.findMany({
        where: { templateVersionId: review.templateVersionId },
        orderBy: [{ sectionOrder: "asc" }, { lineOrder: "asc" }],
        select: {
          id: true,
          slug: true,
          sectionOrder: true,
          sectionTitle: true,
          lineOrder: true,
          label: true,
          helpText: true,
          weight: true,
          isCritical: true,
          allowNa: true,
        },
      }),
    ]);

    if (!task) {
      return NextResponse.json({ success: false, error: "Task not found" }, { status: 404 });
    }

    const lineResults =
      review.status === "SUBMITTED"
        ? await prisma.qALineResult.findMany({
            where: { taskReviewId: review.id },
            select: {
              lineId: true,
              response: true,
              comment: true,
              labelSnapshot: true,
            },
          })
        : [];

    return NextResponse.json({
      success: true,
      data: {
        review: {
          id: review.id,
          taskId: review.taskId,
          batchId: review.batchId,
          status: review.status,
          templateVersionId: review.templateVersionId,
          parentReviewId: review.parentReviewId,
          isCurrentVersion: review.isCurrentVersion,
          regradeReason: review.regradeReason,
          reviewerNotes: review.reviewerNotes,
          submittedAt: review.submittedAt?.toISOString() ?? null,
          finalScore: review.finalScore != null ? Number(review.finalScore) : null,
          templateVersion: review.templateVersion,
        },
        lines,
        lineResults: serializeForClientJson(lineResults),
        task: serializeForClientJson(task),
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[quality-review/task-reviews GET]", e);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
