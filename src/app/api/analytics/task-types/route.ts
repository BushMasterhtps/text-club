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

    const completedForType = (taskType: string): Prisma.TaskWhereInput => ({
      taskType: taskType as any,
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

    const avgForType = (taskType: string): Prisma.TaskWhereInput => ({
      taskType: taskType as any,
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

    // Get stats for each task type
    const taskTypes = ['TEXT_CLUB', 'WOD_IVCS', 'EMAIL_REQUESTS', 'HOLDS', 'YOTPO'];
    const taskTypeStats: any = {};

    for (const taskType of taskTypes) {
      const completed = await prisma.task.count({
        where: teamScope
          ? { AND: [completedForType(taskType), teamScope] }
          : completedForType(taskType),
      });

      const pendingWhere: Prisma.TaskWhereInput =
        taskType === "HOLDS"
          ? {
              taskType: "HOLDS",
              holdsStatus: { in: [...HOLDS_ACTIVE_WORKFLOW_QUEUES] },
              ...(assignedToTeam ?? {}),
            }
          : {
              taskType: taskType as any,
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

      const key = taskType.toLowerCase().replace(/_/g, '');
      taskTypeStats[key] = {
        completed,
        pending,
        avgDuration: Math.round(avgDurationResult._avg.durationSec || 0)
      };
    }

    return NextResponse.json({
      success: true,
      data: taskTypeStats
    });

  } catch (error) {
    console.error('Analytics Task Types API Error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to load task type data'
    }, { status: 500 });
  }
}
