import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiAuthDeniedResponse, requireManagerApiAuth } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireManagerApiAuth(request);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);

  const { id: batchId } = await context.params;

  try {
    const batch = await prisma.qASampleBatch.findFirst({
      where: { id: batchId, reviewerId: auth.userId },
      include: {
        templateVersion: {
          include: {
            template: { select: { displayName: true, slug: true, taskType: true } },
          },
        },
        subjectAgent: { select: { id: true, name: true, email: true } },
        batchTasks: {
          orderBy: { sortIndex: "asc" },
          select: { taskId: true, sortIndex: true },
        },
        reviews: {
          select: {
            id: true,
            taskId: true,
            status: true,
            finalScore: true,
            submittedAt: true,
          },
        },
      },
    });

    if (!batch) {
      return NextResponse.json({ success: false, error: "Batch not found" }, { status: 404 });
    }

    const reviewByTask = new Map(batch.reviews.map((r) => [r.taskId, r]));
    const tasks = batch.batchTasks.map((bt) => {
      const r = reviewByTask.get(bt.taskId);
      return {
        taskId: bt.taskId,
        sortIndex: bt.sortIndex,
        reviewId: r?.id ?? null,
        status: r?.status ?? null,
        finalScore: r?.finalScore != null ? Number(r.finalScore) : null,
        submittedAt: r?.submittedAt?.toISOString() ?? null,
      };
    });

    const submitted = tasks.filter((t) => t.status === "SUBMITTED").length;
    const nextPending = tasks.find((t) => t.status === "PENDING");

    return NextResponse.json({
      success: true,
      data: {
        id: batch.id,
        status: batch.status,
        periodStartDate: batch.periodStartDate,
        periodEndDate: batch.periodEndDate,
        sampleCount: batch.sampleCount,
        completedAt: batch.completedAt?.toISOString() ?? null,
        template: {
          displayName: batch.templateVersion.template.displayName,
          slug: batch.templateVersion.template.slug,
          taskType: batch.templateVersion.template.taskType,
          version: batch.templateVersion.version,
          templateVersionId: batch.templateVersionId,
        },
        subjectAgent: batch.subjectAgent,
        tasks,
        progress: {
          submitted,
          total: tasks.length,
          nextTaskId: nextPending?.taskId ?? null,
        },
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[quality-review/batches GET]", e);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
