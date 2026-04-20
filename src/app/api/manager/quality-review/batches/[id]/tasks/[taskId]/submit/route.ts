import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiAuthDeniedResponse, requireManagerApiAuth } from "@/lib/auth";
import { computeQualityReviewScores } from "@/lib/quality-review-scoring";
import type { Prisma, QAReviewLineResponse } from "@prisma/client";

function buildTaskSnapshot(task: {
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

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; taskId: string }> }
) {
  const auth = await requireManagerApiAuth(request);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);

  const { id: batchId, taskId } = await context.params;

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

    const batch = await prisma.qASampleBatch.findFirst({
      where: { id: batchId, reviewerId: auth.userId },
    });
    if (!batch) {
      return NextResponse.json({ success: false, error: "Batch not found" }, { status: 404 });
    }
    if (batch.status === "CANCELLED") {
      return NextResponse.json(
        { success: false, error: "Batch was cancelled" },
        { status: 400 }
      );
    }

    const link = await prisma.qASampleBatchTask.findFirst({
      where: { batchId, taskId },
    });
    if (!link) {
      return NextResponse.json({ success: false, error: "Task not in this batch" }, { status: 404 });
    }

    const review = await prisma.qATaskReview.findFirst({
      where: { batchId, taskId, reviewerId: auth.userId },
    });
    if (!review) {
      return NextResponse.json({ success: false, error: "Review not found" }, { status: 404 });
    }
    if (review.status === "SUBMITTED") {
      return NextResponse.json(
        { success: false, error: "Review already submitted" },
        { status: 400 }
      );
    }

    const lines = await prisma.qALine.findMany({
      where: { templateVersionId: review.templateVersionId },
      orderBy: [{ sectionOrder: "asc" }, { lineOrder: "asc" }],
    });

    if (lines.length !== body.responses.length) {
      return NextResponse.json(
        {
          success: false,
          error: `Expected ${lines.length} line responses, got ${body.responses.length}`,
        },
        { status: 400 }
      );
    }

    const lineIds = new Set(lines.map((l) => l.id));
    const responseMap = new Map<string, QAReviewLineResponse>();
    const comments = new Map<string, string | null | undefined>();

    for (const r of body.responses) {
      if (!lineIds.has(r.lineId)) {
        return NextResponse.json(
          { success: false, error: `Unknown lineId: ${r.lineId}` },
          { status: 400 }
        );
      }
      if (responseMap.has(r.lineId)) {
        return NextResponse.json(
          { success: false, error: `Duplicate response for line ${r.lineId}` },
          { status: 400 }
        );
      }
      if (!["PASS", "FAIL", "NA"].includes(r.response)) {
        return NextResponse.json(
          { success: false, error: `Invalid response for line ${r.lineId}` },
          { status: 400 }
        );
      }
      responseMap.set(r.lineId, r.response);
      comments.set(r.lineId, r.comment);
    }

    if (responseMap.size !== lines.length) {
      return NextResponse.json(
        { success: false, error: "Each checklist line must appear exactly once in responses" },
        { status: 400 }
      );
    }

    const scores = computeQualityReviewScores(lines, responseMap);

    const task = await prisma.task.findFirst({
      where: { id: taskId },
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
      return NextResponse.json({ success: false, error: "Task not found" }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
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

      await tx.qATaskReview.update({
        where: { id: review.id },
        data: {
          status: "SUBMITTED",
          submittedAt: new Date(),
          weightedScore: scores.weightedScore,
          failedCriticalCount: scores.failedCriticalCount,
          scoreCap: scores.scoreCap,
          finalScore: scores.finalScore,
          taskSnapshot: buildTaskSnapshot(task),
          reviewerNotes: body.reviewerNotes?.trim() || null,
        },
      });

      const pending = await tx.qATaskReview.count({
        where: { batchId, status: "PENDING" },
      });
      if (pending === 0) {
        await tx.qASampleBatch.update({
          where: { id: batchId },
          data: { status: "COMPLETED", completedAt: new Date() },
        });
      }
    });

    const batchAfter = await prisma.qASampleBatch.findFirst({
      where: { id: batchId },
      select: { status: true },
    });

    const ordered = await prisma.qASampleBatchTask.findMany({
      where: { batchId },
      orderBy: { sortIndex: "asc" },
      include: {
        task: {
          include: {
            qaTaskReview: { select: { status: true, batchId: true } },
          },
        },
      },
    });
    const next = ordered.find(
      (row) =>
        row.task.qaTaskReview?.status === "PENDING" &&
        row.task.qaTaskReview?.batchId === batchId
    );

    return NextResponse.json({
      success: true,
      data: {
        reviewId: review.id,
        taskId,
        scores: {
          weightedScore: scores.weightedScore,
          failedCriticalCount: scores.failedCriticalCount,
          scoreCap: scores.scoreCap,
          finalScore: scores.finalScore,
        },
        batchStatus: batchAfter?.status ?? null,
        nextTaskId: next?.taskId ?? null,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    if (msg.startsWith("MISSING_RESPONSE") || msg.startsWith("NA_NOT_ALLOWED")) {
      return NextResponse.json({ success: false, error: msg }, { status: 400 });
    }
    console.error("[quality-review/submit]", e);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
