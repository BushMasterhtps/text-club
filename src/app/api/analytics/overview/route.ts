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

/** Org-wide counts for tasks with no assignee (team-filtered overview only; not part of team totals). */
async function fetchSharedUnassignedBacklog() {
  const [pendingUnassignedByType, rawMessageReady, holdsUnassignedWorkflow] =
    await Promise.all([
      prisma.task.groupBy({
        by: ["taskType"],
        where: { status: "PENDING", assignedToId: null },
        _count: { id: true },
      }),
      prisma.rawMessage.count({ where: { status: "READY" } }),
      prisma.task.count({
        where: {
          taskType: "HOLDS",
          holdsStatus: { in: [...HOLDS_ACTIVE_WORKFLOW_QUEUES] },
          assignedToId: null,
        },
      }),
    ]);

  const m = new Map(
    pendingUnassignedByType.map((row) => [row.taskType, row._count.id])
  );

  return {
    textClub: (m.get("TEXT_CLUB") || 0) + rawMessageReady,
    wodIvcs: m.get("WOD_IVCS") || 0,
    emailRequests: m.get("EMAIL_REQUESTS") || 0,
    holds: holdsUnassignedWorkflow,
    yotpo: m.get("YOTPO") || 0,
  };
}

/** Task completion in range, excluding HOLDS (Holds productivity uses TaskWorkSession). */
function completedInRangeNonHoldsWhere(
  utcDateStart: Date,
  utcDateEnd: Date
): Prisma.TaskWhereInput {
  return {
    taskType: { not: TaskType.HOLDS },
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
}

function holdsSessionsInRangeWhere(
  utcDateStart: Date,
  utcDateEnd: Date,
  subjectIds: string[] | null
): Prisma.TaskWorkSessionWhereInput {
  return {
    taskType: TaskType.HOLDS,
    countsTowardProductivity: true,
    endedAt: { gte: utcDateStart, lte: utcDateEnd },
    ...(subjectIds ? { agentId: { in: subjectIds } } : {}),
  };
}

function nonHoldsAvgHandleWhere(
  utcDateStart: Date,
  utcDateEnd: Date
): Prisma.TaskWhereInput {
  return {
    taskType: { not: TaskType.HOLDS },
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

    const rosterTeamFilterSelected = subjectIds !== null;
    const sharedUnassignedBacklog = rosterTeamFilterSelected
      ? await fetchSharedUnassignedBacklog()
      : undefined;

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
          sharedUnassignedBacklog,
        },
      });
    }

    const teamScope = subjectIds
      ? teamAttributedTaskWhere(subjectIds)
      : null;

    const completedNonHoldsBase = completedInRangeNonHoldsWhere(
      utcDateStart,
      utcDateEnd
    );
    const completedNonHoldsFiltered: Prisma.TaskWhereInput = teamScope
      ? { AND: [completedNonHoldsBase, teamScope] }
      : completedNonHoldsBase;

    const holdsSessionWhere = holdsSessionsInRangeWhere(
      utcDateStart,
      utcDateEnd,
      subjectIds
    );

    const nonHoldsAvgBase = nonHoldsAvgHandleWhere(utcDateStart, utcDateEnd);
    const nonHoldsAvgFiltered: Prisma.TaskWhereInput = teamScope
      ? { AND: [nonHoldsAvgBase, teamScope] }
      : nonHoldsAvgBase;

    const holdsSessionAvgWhere: Prisma.TaskWorkSessionWhereInput = {
      ...holdsSessionWhere,
      durationSec: { not: null },
    };

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

    const [
      nonHoldsCompletedInRange,
      holdsSessionsInRange,
      totalCompleted,
      nhDurationAgg,
      hsDurationAgg,
    ] = await Promise.all([
      prisma.task.count({ where: completedNonHoldsFiltered }),
      prisma.taskWorkSession.count({ where: holdsSessionWhere }),
      prisma.task.count({
        where: teamScope
          ? { AND: [totalCompletedAllTimeWhere, teamScope] }
          : totalCompletedAllTimeWhere,
      }),
      prisma.task.aggregate({
        where: nonHoldsAvgFiltered,
        _sum: { durationSec: true },
        _count: { id: true },
      }),
      prisma.taskWorkSession.aggregate({
        where: holdsSessionAvgWhere,
        _sum: { durationSec: true },
        _count: { id: true },
      }),
    ]);

    const completedTasks = nonHoldsCompletedInRange + holdsSessionsInRange;

    const nhSum = nhDurationAgg._sum.durationSec ?? 0;
    const hsSum = hsDurationAgg._sum.durationSec ?? 0;
    const nhCnt = nhDurationAgg._count.id;
    const hsCnt = hsDurationAgg._count.id;
    const durationDenom = nhCnt + hsCnt;
    const avgHandleTime =
      durationDenom > 0
        ? Math.round((nhSum + hsSum) / durationDenom)
        : 0;

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
      avgHandleTime,
      activeAgents,
      tasksInProgress,
      pendingTasks,
      totalInProgress,
      pendingByTaskType: {
        textClub: textClubPending,
        wodIvcs: wodIvcsPending,
        emailRequests: emailRequestsPending,
        holds: holdsPending,
        yotpo: yotpoPending,
      },
      ...(sharedUnassignedBacklog != null
        ? { sharedUnassignedBacklog }
        : {}),
    };

    return NextResponse.json({
      success: true,
      data,
      meta: {
        dateRange: {
          startLocal: utcDateStart.toISOString(),
          endLocalInclusive: utcDateEnd.toISOString(),
          interpretation:
            "Server-local calendar bounds for startDate/endDate (unchanged). HOLDS productivity in totalCompletedToday and avgHandleTime uses TaskWorkSession; pending holds uses Task workflow queues.",
        },
      },
    });
  } catch (error) {
    console.error("Analytics Overview API Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to load overview data",
      },
      { status: 500 }
    );
  }
}
