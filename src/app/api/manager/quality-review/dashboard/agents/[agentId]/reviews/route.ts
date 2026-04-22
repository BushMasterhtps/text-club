import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiAuthDeniedResponse, requireManagerApiAuth } from "@/lib/auth";
import { getAgentReportingRangeBoundsUtc } from "@/lib/agent-reporting-day-bounds";

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
  context: { params: Promise<{ agentId: string }> }
) {
  const auth = await requireManagerApiAuth(request);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);

  const { agentId } = await context.params;
  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get("startDate")?.trim();
  const endDate = searchParams.get("endDate")?.trim();

  if (!startDate || !endDate) {
    return NextResponse.json(
      { success: false, error: "startDate and endDate are required (YYYY-MM-DD)." },
      { status: 400 }
    );
  }

  try {
    const { startUtc, endExclusiveUtc } = getAgentReportingRangeBoundsUtc(startDate, endDate);

    const inWindow = await prisma.qATaskReview.findMany({
      where: {
        subjectAgentId: agentId,
        status: "SUBMITTED",
        submittedAt: { gte: startUtc, lt: endExclusiveUtc },
      },
      select: { taskId: true },
    });
    const taskIds = [...new Set(inWindow.map((r) => r.taskId))];

    if (taskIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: { startYmd: startDate, endYmd: endDate, agentId, reviews: [] as unknown[] },
      });
    }

    const reviewsRaw = await prisma.qATaskReview.findMany({
      where: { taskId: { in: taskIds } },
      include: {
        reviewer: { select: { id: true, name: true, email: true } },
        templateVersion: {
          select: {
            id: true,
            version: true,
            template: { select: { displayName: true, taskType: true, slug: true } },
          },
        },
        task: { select: { id: true, taskType: true } },
        lineResults: {
          select: {
            id: true,
            response: true,
            comment: true,
            labelSnapshot: true,
          },
        },
      },
    });

    reviewsRaw.sort((a, b) => {
      if (a.taskId !== b.taskId) return a.taskId.localeCompare(b.taskId);
      const ta = a.submittedAt?.getTime() ?? 0;
      const tb = b.submittedAt?.getTime() ?? 0;
      return ta - tb;
    });

    return NextResponse.json({
      success: true,
      data: {
        startYmd: startDate,
        endYmd: endDate,
        agentId,
        reviews: serializeForClientJson(
          reviewsRaw.map((r) => ({
            id: r.id,
            taskId: r.taskId,
            taskType: r.task.taskType,
            batchId: r.batchId,
            parentReviewId: r.parentReviewId,
            isCurrentVersion: r.isCurrentVersion,
            regradeReason: r.regradeReason,
            status: r.status,
            submittedAt: r.submittedAt?.toISOString() ?? null,
            finalScore: r.finalScore != null ? Number(r.finalScore) : null,
            reviewerNotes: r.reviewerNotes,
            reviewer: r.reviewer,
            templateVersion: r.templateVersion,
            lineResultCount: r.lineResults.length,
            lineResults: r.status === "SUBMITTED" ? r.lineResults : [],
          }))
        ),
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    if (msg.includes("INVALID_AGENT_DATE")) {
      return NextResponse.json(
        { success: false, error: "Invalid startDate or endDate. Use YYYY-MM-DD." },
        { status: 400 }
      );
    }
    console.error("[quality-review/dashboard/agents/reviews]", e);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
