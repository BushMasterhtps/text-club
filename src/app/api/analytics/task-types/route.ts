import { NextRequest, NextResponse } from "next/server";
import { TaskType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { apiAuthDeniedResponse, requireManagerApiAuth } from "@/lib/auth";
import type { Prisma } from "@prisma/client";
import {
  HOLDS_ACTIVE_WORKFLOW_QUEUES,
  resolveTeamAnalyticsSubjectIds,
  teamAttributedTaskWhere,
} from "@/lib/team-analytics-roster";

export async function GET(request: NextRequest) {
  const auth = await requireManagerApiAuth(request);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);

  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const rosterTeam =
      searchParams.get("rosterTeam") ?? searchParams.get("team");

    // Parse dates (server-local calendar day bounds — unchanged from prior behavior).
    let dateStart: Date;
    let dateEnd: Date;

    if (startDate && endDate) {
      const [startYear, startMonth, startDay] = startDate.split("-").map(Number);
      const [endYear, endMonth, endDay] = endDate.split("-").map(Number);

      dateStart = new Date(startYear, startMonth - 1, startDay, 0, 0, 0, 0);
      dateEnd = new Date(endYear, endMonth - 1, endDay, 23, 59, 59, 999);
    } else {
      const today = new Date();
      dateStart = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
        0,
        0,
        0,
        0
      );
      dateEnd = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
        23,
        59,
        59,
        999
      );
    }

    const utcDateStart = dateStart;
    const utcDateEnd = dateEnd;

    const { filterActive, subjectIds } = await resolveTeamAnalyticsSubjectIds(
      prisma,
      rosterTeam
    );

    if (filterActive && subjectIds!.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          textclub: { completed: 0, pending: 0, avgDuration: 0 },
          wodivcs: { completed: 0, pending: 0, avgDuration: 0 },
          emailrequests: { completed: 0, pending: 0, avgDuration: 0 },
          holds: { completed: 0, pending: 0, avgDuration: 0 },
          yotpo: { completed: 0, pending: 0, avgDuration: 0 },
        },
      });
    }

    const teamScope = subjectIds
      ? teamAttributedTaskWhere(subjectIds)
      : null;
    const assignedToTeam: Prisma.TaskWhereInput | null = subjectIds
      ? { assignedToId: { in: subjectIds } }
      : null;

    const completedForType = (taskType: TaskType): Prisma.TaskWhereInput => ({
      taskType,
      OR: [
        {
          status: "COMPLETED",
          endTime: { gte: utcDateStart, lte: utcDateEnd },
        },
        {
          status: "PENDING",
          sentBackBy: { not: null },
          endTime: { gte: utcDateStart, lte: utcDateEnd },
        },
      ],
    });

    const avgForType = (taskType: TaskType): Prisma.TaskWhereInput => ({
      taskType,
      OR: [
        {
          status: "COMPLETED",
          endTime: { gte: utcDateStart, lte: utcDateEnd },
          durationSec: { not: null },
        },
        {
          status: "PENDING",
          sentBackBy: { not: null },
          endTime: { gte: utcDateStart, lte: utcDateEnd },
          durationSec: { not: null },
        },
      ],
    });

    const holdsSessionWhere: Prisma.TaskWorkSessionWhereInput = {
      taskType: TaskType.HOLDS,
      countsTowardProductivity: true,
      endedAt: { gte: utcDateStart, lte: utcDateEnd },
      ...(subjectIds ? { agentId: { in: subjectIds } } : {}),
    };

    const taskTypes: TaskType[] = [
      TaskType.TEXT_CLUB,
      TaskType.WOD_IVCS,
      TaskType.EMAIL_REQUESTS,
      TaskType.HOLDS,
      TaskType.YOTPO,
    ];
    const taskTypeStats: Record<
      string,
      { completed: number; pending: number; avgDuration: number }
    > = {};

    for (const taskType of taskTypes) {
      if (taskType === TaskType.HOLDS) {
        const [completed, pending, durAgg] = await Promise.all([
          prisma.taskWorkSession.count({ where: holdsSessionWhere }),
          prisma.task.count({
            where: {
              taskType: "HOLDS",
              holdsStatus: { in: [...HOLDS_ACTIVE_WORKFLOW_QUEUES] },
              ...(assignedToTeam ?? {}),
            },
          }),
          prisma.taskWorkSession.aggregate({
            where: {
              ...holdsSessionWhere,
              durationSec: { not: null },
            },
            _avg: { durationSec: true },
          }),
        ]);

        taskTypeStats.holds = {
          completed,
          pending,
          avgDuration: Math.round(durAgg._avg.durationSec || 0),
        };
        continue;
      }

      const completed = await prisma.task.count({
        where: teamScope
          ? { AND: [completedForType(taskType), teamScope] }
          : completedForType(taskType),
      });

      const pendingWhere: Prisma.TaskWhereInput = {
        taskType,
        status: "PENDING",
        ...(assignedToTeam ?? {}),
      };

      const pending = await prisma.task.count({
        where: pendingWhere,
      });

      const avgDurationResult = await prisma.task.aggregate({
        where: teamScope
          ? { AND: [avgForType(taskType), teamScope] }
          : avgForType(taskType),
        _avg: {
          durationSec: true,
        },
      });

      const key = taskType.toLowerCase().replace(/_/g, "");
      taskTypeStats[key] = {
        completed,
        pending,
        avgDuration: Math.round(avgDurationResult._avg.durationSec || 0),
      };
    }

    return NextResponse.json({
      success: true,
      data: taskTypeStats,
      meta: {
        dateRange: {
          startLocal: utcDateStart.toISOString(),
          endLocalInclusive: utcDateEnd.toISOString(),
          interpretation:
            "Server-local calendar bounds (unchanged). HOLDS completed/avgDuration use TaskWorkSession; HOLDS pending uses Task workflow queues.",
        },
      },
    });
  } catch (error) {
    console.error("Analytics Task Types API Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to load task type data",
      },
      { status: 500 }
    );
  }
}
