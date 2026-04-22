import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiAuthDeniedResponse, requireManagerApiAuth } from "@/lib/auth";
import { resolveActiveTemplateForTaskType } from "@/lib/quality-review-template";
import { QA_PENDING_REVIEW_TTL_MS } from "@/lib/quality-review-constants";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireManagerApiAuth(request);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);

  const { id: currentReviewId } = await context.params;

  try {
    const body = (await request.json()) as {
      templateMode?: "same" | "latest";
      reason?: string;
    };

    const reason = body.reason?.trim() ?? "";
    if (reason.length < 3) {
      return NextResponse.json(
        { success: false, error: "reason is required (at least 3 characters)." },
        { status: 400 }
      );
    }

    const mode = body.templateMode === "latest" ? "latest" : "same";

    const parent = await prisma.qATaskReview.findFirst({
      where: {
        id: currentReviewId,
        status: "SUBMITTED",
        isCurrentVersion: true,
      },
      include: {
        task: { select: { id: true, taskType: true } },
        templateVersion: { select: { id: true, templateId: true } },
      },
    });

    if (!parent) {
      return NextResponse.json(
        { success: false, error: "Current submitted review not found." },
        { status: 404 }
      );
    }

    if (!parent.subjectAgentId) {
      return NextResponse.json(
        {
          success: false,
          error: "Review is missing subjectAgentId; cannot regrade until data is repaired.",
        },
        { status: 400 }
      );
    }

    const pending = await prisma.qATaskReview.findFirst({
      where: { taskId: parent.taskId, status: "PENDING" },
    });
    if (pending) {
      return NextResponse.json(
        {
          success: false,
          error: "This task already has a pending QA review. Finish or cancel it first.",
        },
        { status: 409 }
      );
    }

    let templateVersionId = parent.templateVersionId;
    if (mode === "latest") {
      const resolved = await resolveActiveTemplateForTaskType(parent.task.taskType);
      if (!resolved) {
        return NextResponse.json(
          {
            success: false,
            error:
              "No active Quality Review template for this task type. Publish a template first.",
          },
          { status: 400 }
        );
      }
      templateVersionId = resolved.templateVersionId;
    }

    const expiresAt = new Date(Date.now() + QA_PENDING_REVIEW_TTL_MS);

    const created = await prisma.qATaskReview.create({
      data: {
        batchId: null,
        taskId: parent.taskId,
        templateVersionId,
        reviewerId: auth.userId,
        subjectAgentId: parent.subjectAgentId,
        parentReviewId: parent.id,
        status: "PENDING",
        isCurrentVersion: false,
        regradeReason: reason,
        expiresAt,
      },
      select: { id: true, templateVersionId: true },
    });

    return NextResponse.json({
      success: true,
      data: {
        newReviewId: created.id,
        templateVersionId: created.templateVersionId,
        templateMode: mode,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[quality-review/task-reviews/regrade]", e);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
