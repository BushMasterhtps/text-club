import { NextRequest, NextResponse } from "next/server";
import { TaskType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { apiAuthDeniedResponse, requireManagerApiAuth } from "@/lib/auth";
import { resolveTeamAnalyticsSubjectIds } from "@/lib/team-analytics-roster";

/** Non-Holds Task OR branches (unchanged semantics). */
function nonHoldsCompletedWhere(agentId: string, start: Date, end: Date) {
  return {
    taskType: { not: TaskType.HOLDS } as const,
    OR: [
      {
        assignedToId: agentId,
        status: "COMPLETED" as const,
        endTime: { gte: start, lte: end },
      },
      {
        sentBackBy: agentId,
        status: "PENDING" as const,
        endTime: { gte: start, lte: end },
      },
      {
        completedBy: agentId,
        status: "COMPLETED" as const,
        endTime: { gte: start, lte: end },
      },
    ],
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireManagerApiAuth(request);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);

  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const rosterTeam =
      searchParams.get("rosterTeam") ?? searchParams.get("team");

    if (!startDate || !endDate) {
      return NextResponse.json({
        success: false,
        error: "Start date and end date are required",
      }, { status: 400 });
    }

    // Parse dates and create date range in PST timezone (matching Agent Status API)
    // PST = UTC - 8 hours, so PST day boundaries are:
    // Start: 8:00 AM UTC on the given date (12:00 AM PST)
    // End: 7:59 AM UTC on the next day (11:59 PM PST)
    const parsePSTDate = (dateStr: string) => {
      const [year, month, day] = dateStr.split("-").map(Number);
      return { year, month: month - 1, day }; // month is 0-indexed
    };

    const startDateParts = parsePSTDate(startDate);
    const endDateParts = parsePSTDate(endDate);

    // Start: 8 AM UTC on start date (12 AM PST)
    const start = new Date(
      Date.UTC(
        startDateParts.year,
        startDateParts.month,
        startDateParts.day,
        8,
        0,
        0,
        0
      )
    );
    // End: 7:59 AM UTC on day after end date (11:59 PM PST on end date)
    const end = new Date(
      Date.UTC(
        endDateParts.year,
        endDateParts.month,
        endDateParts.day + 1,
        7,
        59,
        59,
        999
      )
    );

    const { filterActive, subjectIds } = await resolveTeamAnalyticsSubjectIds(
      prisma,
      rosterTeam
    );

    if (filterActive && subjectIds!.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    const agents = await prisma.user.findMany({
      where: {
        role: { in: ["AGENT", "MANAGER_AGENT"] },
        ...(subjectIds ? { id: { in: subjectIds } } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
    });

    const teamPerformanceData: Array<{
      agentId: string;
      agentName: string;
      agentEmail: string;
      taskType: string;
      completedCount: number;
      avgHandleTime: number;
      totalDuration: number;
      totalCompleted: number;
    }> = [];

    for (const agent of agents) {
      // Total completed today / range: non-Holds Task rows + Holds TaskWorkSession actions
      // (aligns with /api/analytics/agent-status; avoids double-counting Holds Task rows.)
      const [nonHoldsCompletedCount, holdsSessionCountForTotal] = await Promise.all([
        prisma.task.count({
          where: nonHoldsCompletedWhere(agent.id, start, end),
        }),
        prisma.taskWorkSession.count({
          where: {
            agentId: agent.id,
            taskType: TaskType.HOLDS,
            countsTowardProductivity: true,
            endedAt: { gte: start, lte: end },
          },
        }),
      ]);
      const totalCompletedTasks =
        nonHoldsCompletedCount + holdsSessionCountForTotal;

      const taskTypes = [
        "TEXT_CLUB",
        "WOD_IVCS",
        "EMAIL_REQUESTS",
        "YOTPO",
        "HOLDS",
        "STANDALONE_REFUNDS",
      ];

      for (const taskType of taskTypes) {
        if (taskType === "HOLDS") {
          const holdsSessions = await prisma.taskWorkSession.findMany({
            where: {
              agentId: agent.id,
              taskType: TaskType.HOLDS,
              countsTowardProductivity: true,
              endedAt: { gte: start, lte: end },
            },
            select: { durationSec: true },
          });
          if (holdsSessions.length === 0) continue;

          const timed = holdsSessions.filter(
            (s) => s.durationSec !== null && s.durationSec !== undefined
          );
          const totalDuration = timed.reduce(
            (sum, s) => sum + (s.durationSec ?? 0),
            0
          );
          const avgHandleTime =
            timed.length > 0
              ? Math.round(totalDuration / timed.length)
              : 0;

          teamPerformanceData.push({
            agentId: agent.id,
            agentName: agent.name || "Unknown",
            agentEmail: agent.email,
            taskType: "HOLDS",
            completedCount: holdsSessions.length,
            avgHandleTime,
            totalDuration,
            totalCompleted: totalCompletedTasks,
          });
          continue;
        }

        const completedTasks = await prisma.task.findMany({
          where: {
            OR: [
              {
                assignedToId: agent.id,
                status: "COMPLETED",
                taskType: taskType as TaskType,
                endTime: { gte: start, lte: end },
              },
              {
                sentBackBy: agent.id,
                status: "PENDING",
                taskType: taskType as TaskType,
                endTime: { gte: start, lte: end },
              },
              {
                completedBy: agent.id,
                status: "COMPLETED",
                taskType: taskType as TaskType,
                endTime: { gte: start, lte: end },
              },
            ],
          },
          select: {
            durationSec: true,
            endTime: true,
          },
        });

        if (completedTasks.length > 0) {
          const totalDuration = completedTasks.reduce(
            (sum, task) => sum + (task.durationSec || 0),
            0
          );
          const avgHandleTime = totalDuration / completedTasks.length;

          teamPerformanceData.push({
            agentId: agent.id,
            agentName: agent.name || "Unknown",
            agentEmail: agent.email,
            taskType: taskType,
            completedCount: completedTasks.length,
            avgHandleTime: Math.round(avgHandleTime),
            totalDuration: totalDuration,
            totalCompleted: totalCompletedTasks,
          });
        }
      }

      if (totalCompletedTasks > 0) {
        const agentHasTaskType = teamPerformanceData.some(
          (item) => item.agentId === agent.id
        );
        if (!agentHasTaskType) {
          teamPerformanceData.push({
            agentId: agent.id,
            agentName: agent.name || "Unknown",
            agentEmail: agent.email,
            taskType: "OTHER",
            completedCount: totalCompletedTasks,
            avgHandleTime: 0,
            totalDuration: 0,
            totalCompleted: totalCompletedTasks,
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: teamPerformanceData,
      meta: {
        dateRange: {
          startDateParam: startDate,
          endDateParam: endDate,
          startUtc: start.toISOString(),
          endUtcInclusive: end.toISOString(),
          interpretation:
            "Bounds use fixed UTC-8 style day edges (08:00 UTC on start date through 07:59:59.999 UTC on the day after end date), unchanged from prior team-performance behavior. HOLDS productivity uses TaskWorkSession.endedAt in this inclusive window.",
        },
      },
    });
  } catch (error) {
    console.error("Team Performance API Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to load team performance data",
      },
      { status: 500 }
    );
  }
}
