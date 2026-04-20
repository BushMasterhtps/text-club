import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiAuthDeniedResponse, requireManagerApiAuth } from "@/lib/auth";
import { buildQualityReviewEligibleTaskWhere } from "@/lib/quality-review-eligibility";
import type { TaskType, WodIvcsSource } from "@prisma/client";

const PREVIEW_LIMIT = 25;

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
    const dispositionParam = searchParams.get("disposition");
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

    const dispositionFilter =
      dispositionParam && dispositionParam !== "" && dispositionParam !== "__ALL__"
        ? dispositionParam
        : undefined;

    const commonOpts = { taskType, wodIvcsSource };

    const whereFiltered = buildQualityReviewEligibleTaskWhere(
      subjectId,
      startDate,
      endDate,
      {
        ...commonOpts,
        disposition: dispositionFilter,
      }
    );

    const whereNoDisposition = buildQualityReviewEligibleTaskWhere(
      subjectId,
      startDate,
      endDate,
      {
        ...commonOpts,
        omitDispositionFilter: true,
      }
    );

    const [
      totalEligible,
      byTaskType,
      byDisposition,
      previewTasks,
    ] = await Promise.all([
      prisma.task.count({ where: whereFiltered }),
      prisma.task.groupBy({
        by: ["taskType"],
        where: whereFiltered,
        _count: { id: true },
      }),
      prisma.task.groupBy({
        by: ["disposition"],
        where: whereNoDisposition,
        _count: { id: true },
      }),
      prisma.task.findMany({
        where: whereFiltered,
        select: {
          id: true,
          taskType: true,
          disposition: true,
          endTime: true,
          brand: true,
          text: true,
        },
        orderBy: { endTime: "desc" },
        take: PREVIEW_LIMIT,
      }),
    ]);

    const countsByTaskType: Record<string, number> = {};
    for (const row of byTaskType) {
      countsByTaskType[row.taskType] = row._count.id;
    }

    const dispositionOptions = [...byDisposition]
      .map((row) => {
        const isNone = row.disposition == null || row.disposition === "";
        const value = isNone ? "__NONE__" : row.disposition;
        return {
          value,
          count: row._count.id,
          label: isNone
            ? `(no disposition) — ${row._count.id}`
            : `${row.disposition} — ${row._count.id}`,
        };
      })
      .sort((a, b) => b.count - a.count);

    const preview = previewTasks.map((t) => ({
      id: t.id,
      taskType: t.taskType,
      disposition: t.disposition,
      endTime: t.endTime?.toISOString() ?? null,
      brand: t.brand,
      textPreview: t.text ? t.text.slice(0, 160) : null,
    }));

    return NextResponse.json({
      success: true,
      data: {
        agentId: subjectId,
        startDate,
        endDate,
        totalEligible,
        countsByTaskType,
        countsByDisposition: dispositionOptions,
        previewTasks: preview,
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
