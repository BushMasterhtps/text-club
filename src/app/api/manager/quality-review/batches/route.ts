import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiAuthDeniedResponse, requireManagerApiAuth } from "@/lib/auth";
import { buildQualityReviewEligibleTaskWhere } from "@/lib/quality-review-eligibility";
import { resolveActiveTemplateForTaskType } from "@/lib/quality-review-template";
import { QA_PENDING_REVIEW_TTL_MS } from "@/lib/quality-review-constants";
import type { Prisma, TaskType, WodIvcsSource } from "@prisma/client";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function POST(request: NextRequest) {
  const auth = await requireManagerApiAuth(request);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);

  try {
    const body = (await request.json()) as {
      subjectAgentId?: string;
      subjectAgentEmail?: string;
      startDate?: string;
      endDate?: string;
      sampleCount?: number;
      taskType?: TaskType;
      disposition?: string | null;
      wodIvcsSource?: WodIvcsSource | null;
      filtersJson?: Prisma.InputJsonValue;
    };

    const startDate = body.startDate?.trim();
    const endDate = body.endDate?.trim();
    const sampleCount = body.sampleCount ?? 0;

    if (!startDate || !endDate) {
      return NextResponse.json(
        { success: false, error: "startDate and endDate are required" },
        { status: 400 }
      );
    }

    if (!body.taskType) {
      return NextResponse.json(
        { success: false, error: "taskType is required for batch creation" },
        { status: 400 }
      );
    }

    if (!Number.isFinite(sampleCount) || sampleCount < 1 || sampleCount > 100) {
      return NextResponse.json(
        { success: false, error: "sampleCount must be between 1 and 100" },
        { status: 400 }
      );
    }

    let subjectAgentId = body.subjectAgentId?.trim();
    if (!subjectAgentId && body.subjectAgentEmail) {
      const u = await prisma.user.findFirst({
        where: { email: body.subjectAgentEmail.trim() },
        select: { id: true },
      });
      subjectAgentId = u?.id;
    }

    if (!subjectAgentId) {
      return NextResponse.json(
        { success: false, error: "subjectAgentId or subjectAgentEmail is required" },
        { status: 400 }
      );
    }

    const resolved = await resolveActiveTemplateForTaskType(body.taskType);
    if (!resolved) {
      return NextResponse.json(
        {
          success: false,
          error:
            "No active Quality Review checklist for this task type. Configure one under Manager → Quality Review → Templates.",
        },
        { status: 400 }
      );
    }
    const templateVersionId = resolved.templateVersionId;
    const resolvedDisplayName = resolved.displayName;

    const where = buildQualityReviewEligibleTaskWhere(
      subjectAgentId,
      startDate,
      endDate,
      {
        taskType: body.taskType,
        disposition: body.disposition ?? undefined,
        wodIvcsSource:
          body.taskType === "WOD_IVCS" && body.wodIvcsSource != null
            ? body.wodIvcsSource
            : undefined,
      }
    );

    const eligible = await prisma.task.findMany({
      where,
      select: { id: true },
      take: 15000,
    });

    if (eligible.length < sampleCount) {
      return NextResponse.json(
        {
          success: false,
          error: `Not enough eligible tasks (have ${eligible.length}, need ${sampleCount})`,
        },
        { status: 400 }
      );
    }

    const picked = shuffle(eligible.map((e) => e.id)).slice(0, sampleCount);
    const expiresAt = new Date(Date.now() + QA_PENDING_REVIEW_TTL_MS);

    try {
      const batch = await prisma.$transaction(async (tx) => {
        const b = await tx.qASampleBatch.create({
          data: {
            reviewerId: auth.userId,
            subjectAgentId,
            templateVersionId,
            periodStartDate: startDate,
            periodEndDate: endDate,
            filtersJson: body.filtersJson ?? undefined,
            sampleCount,
            status: "OPEN",
          },
        });

        for (let i = 0; i < picked.length; i++) {
          await tx.qASampleBatchTask.create({
            data: {
              batchId: b.id,
              taskId: picked[i]!,
              sortIndex: i,
            },
          });
          await tx.qATaskReview.create({
            data: {
              batchId: b.id,
              taskId: picked[i]!,
              templateVersionId,
              reviewerId: auth.userId,
              subjectAgentId,
              status: "PENDING",
              expiresAt,
            },
          });
        }

        return b;
      });

      return NextResponse.json({
        success: true,
        data: {
          batchId: batch.id,
          templateVersionId,
          templateDisplayName: resolvedDisplayName,
          sampleCount: picked.length,
          taskIds: picked,
        },
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("Unique constraint") || msg.includes("QATaskReview_taskId_key")) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Sample conflict (task already reserved). Retry batch creation with a smaller sample or refresh.",
          },
          { status: 409 }
        );
      }
      throw e;
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    if (msg.includes("INVALID_AGENT_DATE")) {
      return NextResponse.json(
        { success: false, error: "Invalid startDate or endDate. Use YYYY-MM-DD." },
        { status: 400 }
      );
    }
    console.error("[quality-review/batches POST]", e);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
