import { NextRequest, NextResponse } from "next/server";
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
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const rosterTeam =
      searchParams.get("rosterTeam") ?? searchParams.get("team");

    // Parse dates with proper timezone handling
    let dateStart: Date;
    let dateEnd: Date;
    
    if (startDate && endDate) {
      const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
      const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
      
      dateStart = new Date(startYear, startMonth - 1, startDay, 0, 0, 0, 0);
      dateEnd = new Date(endYear, endMonth - 1, endDay, 23, 59, 59, 999);
    } else {
      // Default to today
      const today = new Date();
      dateStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
      dateEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
    }

    // Use local dates directly - no UTC conversion needed
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
          totalCompletedToday: 0,
          totalCompleted: 0,
          avgHandleTime: 0,
          activeAgents: 0,
          tasksInProgress: 0,
          pendingTasks: 0,
          totalInProgress: 0,
          pendingByTaskType: {
            textClub: 0,
            wodIvcs: 0,
            emailRequests: 0,
            holds: 0,
            yotpo: 0,
          },
        },
      });
    }

    const teamScope = subjectIds
      ? teamAttributedTaskWhere(subjectIds)
      : null;

    const completedInRangeWhere: Prisma.TaskWhereInput = {
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
    };

    const completedInRangeFiltered: Prisma.TaskWhereInput = teamScope
      ? { AND: [completedInRangeWhere, teamScope] }
      : completedInRangeWhere;

    // Get completed tasks for the date range (including sent-back tasks)
    const completedTasks = await prisma.task.count({
      where: completedInRangeFiltered,
    });

    const totalCompletedAllTimeWhere: Prisma.TaskWhereInput = {
      OR: [
        { status: "COMPLETED" },
        {
          status: "PENDING",
          sentBackBy: { not: null },
          endTime: { not: null },
        },
      ],
    };

    const totalCompleted = await prisma.task.count({
      where: teamScope
        ? { AND: [totalCompletedAllTimeWhere, teamScope] }
        : totalCompletedAllTimeWhere,
    });

    const avgHandleWhere: Prisma.TaskWhereInput = {
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
    };

    const avgHandleTimeResult = await prisma.task.aggregate({
      where: teamScope ? { AND: [avgHandleWhere, teamScope] } : avgHandleWhere,
      _avg: {
        durationSec: true,
      },
    });

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const activeAgents = await prisma.user.count({
      where: subjectIds
        ? {
            id: { in: subjectIds },
            lastSeen: { gte: fiveMinutesAgo },
            isLive: true,
          }
        : {
            role: { in: ["AGENT", "MANAGER"] },
            lastSeen: { gte: fiveMinutesAgo },
            isLive: true,
          },
    });

    const assignedToTeam: Prisma.TaskWhereInput | null = subjectIds
      ? { assignedToId: { in: subjectIds } }
      : null;

    const tasksInProgress = await prisma.task.count({
      where: {
        status: "IN_PROGRESS",
        ...(assignedToTeam ?? {}),
      },
    });

    const totalInProgress = await prisma.task.count({
      where: {
        status: { in: ["IN_PROGRESS", "PENDING", "ASSISTANCE_REQUIRED"] },
        ...(assignedToTeam ?? {}),
      },
    });

    const pendingTaskWhere: Prisma.TaskWhereInput = {
      status: "PENDING",
      ...(assignedToTeam ?? {}),
    };

    const [pendingByTaskType, rawMessageReady, holdsWorkflowPending] =
      await Promise.all([
        prisma.task.groupBy({
          by: ["taskType"],
          where: pendingTaskWhere,
          _count: { id: true },
        }),
        !subjectIds
          ? prisma.rawMessage.count({ where: { status: "READY" } })
          : Promise.resolve(0),
        prisma.task.count({
          where: {
            taskType: "HOLDS",
            holdsStatus: { in: [...HOLDS_ACTIVE_WORKFLOW_QUEUES] },
            ...(assignedToTeam ?? {}),
          },
        }),
      ]);

    const pendingCountsMap = new Map(
      pendingByTaskType.map((item) => [item.taskType, item._count.id])
    );

    const textClubPending =
      (pendingCountsMap.get("TEXT_CLUB") || 0) + rawMessageReady;
    const wodIvcsPending = pendingCountsMap.get("WOD_IVCS") || 0;
    const emailRequestsPending =
      pendingCountsMap.get("EMAIL_REQUESTS") || 0;
    const holdsPending = holdsWorkflowPending;
    const yotpoPending = pendingCountsMap.get("YOTPO") || 0;

    const taskPending =
      Array.from(pendingCountsMap.entries())
        .filter(([t]) => t !== "HOLDS")
        .reduce((sum, [, c]) => sum + c, 0) + holdsPending;
    const pendingTasks = taskPending + rawMessageReady;

    const data = {
      totalCompletedToday: completedTasks,
      totalCompleted,
      avgHandleTime: Math.round(avgHandleTimeResult._avg.durationSec || 0),
      activeAgents,
      tasksInProgress,
      pendingTasks,
      totalInProgress,
      pendingByTaskType: {
        textClub: textClubPending,
        wodIvcs: wodIvcsPending,
        emailRequests: emailRequestsPending,
        holds: holdsPending,
        yotpo: yotpoPending
      }
    };

    return NextResponse.json({
      success: true,
      data
    });

  } catch (error) {
    console.error('Analytics Overview API Error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to load overview data'
    }, { status: 500 });
  }
}
