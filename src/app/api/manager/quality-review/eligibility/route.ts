import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiAuthDeniedResponse, requireManagerApiAuth } from "@/lib/auth";
import { buildQualityReviewEligibleTaskWhere } from "@/lib/quality-review-eligibility";
import type { TaskType, WodIvcsSource } from "@prisma/client";

export async function GET(request: NextRequest) {
  const auth = await requireManagerApiAuth(request);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);

  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get("agentId");
    const agentEmail = searchParams.get("agentEmail");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const taskTypeParam = searchParams.get("taskType");
    const disposition = searchParams.get("disposition");
    const wodIvcsSourceParam = searchParams.get("wodIvcsSource");

    if (!startDate || !endDate) {
      return NextResponse.json(
        { success: false, error: "startDate and endDate (YYYY-MM-DD) are required" },
        { status: 400 }
      );
    }

    let subjectId = agentId;
    if (!subjectId && agentEmail) {
      const u = await prisma.user.findFirst({
        where: { email: agentEmail.trim() },
        select: { id: true },
      });
      subjectId = u?.id ?? null;
    }

    if (!subjectId) {
      return NextResponse.json(
        { success: false, error: "agentId or agentEmail is required" },
        { status: 400 }
      );
    }

    const taskType =
      taskTypeParam && taskTypeParam !== "all"
        ? (taskTypeParam as TaskType)
        : undefined;

    const wodIvcsSource =
      wodIvcsSourceParam && taskType === "WOD_IVCS"
        ? (wodIvcsSourceParam as WodIvcsSource)
        : undefined;

    const baseWhere = buildQualityReviewEligibleTaskWhere(
      subjectId,
      startDate,
      endDate,
      {
        taskType,
        disposition: disposition ?? undefined,
        wodIvcsSource,
      }
    );

    const [totalEligible, byTaskType] = await Promise.all([
      prisma.task.count({ where: baseWhere }),
      prisma.task.groupBy({
        by: ["taskType"],
        where: baseWhere,
        _count: { id: true },
      }),
    ]);

    const countsByTaskType: Record<string, number> = {};
    for (const row of byTaskType) {
      countsByTaskType[row.taskType] = row._count.id;
    }

    return NextResponse.json({
      success: true,
      data: {
        agentId: subjectId,
        startDate,
        endDate,
        totalEligible,
        countsByTaskType,
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
    console.error("[quality-review/eligibility]", e);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
