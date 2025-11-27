import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

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

    // Get completed tasks for the date range (including sent-back tasks)
    // For Holds: count ALL COMPLETED tasks (status = COMPLETED, endTime in range)
    // This matches the Holds resolved report logic - completedBy is for attribution, not counting
    const completedTasks = await prisma.task.count({
      where: {
        OR: [
          {
            status: "COMPLETED",
            endTime: { gte: utcDateStart, lte: utcDateEnd }
          },
          {
            status: "PENDING",
            sentBackBy: { not: null },
            endTime: { gte: utcDateStart, lte: utcDateEnd }
          }
        ]
      }
    });

    // Get total completed tasks (all time) - count ALL COMPLETED tasks
    const totalCompleted = await prisma.task.count({
      where: {
        OR: [
          { status: "COMPLETED" },
          { 
            status: "PENDING",
            sentBackBy: { not: null },
            endTime: { not: null }
          }
        ]
      }
    });

    // Get average handle time for completed tasks in date range
    const avgHandleTimeResult = await prisma.task.aggregate({
      where: {
        OR: [
          {
            status: "COMPLETED",
            endTime: { gte: utcDateStart, lte: utcDateEnd },
            durationSec: { not: null }
          },
          {
            status: "PENDING",
            sentBackBy: { not: null },
            endTime: { gte: utcDateStart, lte: utcDateEnd },
            durationSec: { not: null }
          }
        ]
      },
      _avg: {
        durationSec: true
      }
    });

    // Get active agents (online in last 5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const activeAgents = await prisma.user.count({
      where: {
        role: { in: ["AGENT", "MANAGER"] },
        lastSeen: { gte: fiveMinutesAgo },
        isLive: true
      }
    });

    // Get tasks in progress
    const tasksInProgress = await prisma.task.count({
      where: {
        status: "IN_PROGRESS"
      }
    });

    // Get total in progress (IN_PROGRESS + PENDING + ASSISTANCE_REQUIRED)
    const totalInProgress = await prisma.task.count({
      where: {
        status: { in: ["IN_PROGRESS", "PENDING", "ASSISTANCE_REQUIRED"] }
      }
    });

    // Get pending tasks by task type - FIXED: Single groupBy query instead of N separate queries
    // Use groupBy to get all task type counts in one query
    const [pendingByTaskType, rawMessageReady] = await Promise.all([
      prisma.task.groupBy({
        by: ['taskType'],
        where: {
          status: "PENDING"
        },
        _count: {
          id: true
        }
      }),
      // RawMessage count (only for Text Club)
      prisma.rawMessage.count({
        where: {
          status: "READY"
        }
      })
    ]);

    // Create a map from the groupBy results
    const pendingCountsMap = new Map(
      pendingByTaskType.map(item => [item.taskType, item._count.id])
    );

    // Extract counts for each task type
    const textClubPending = (pendingCountsMap.get('TEXT_CLUB') || 0) + rawMessageReady;
    const wodIvcsPending = pendingCountsMap.get('WOD_IVCS') || 0;
    const emailRequestsPending = pendingCountsMap.get('EMAIL_REQUESTS') || 0;
    const holdsPending = pendingCountsMap.get('HOLDS') || 0;
    const yotpoPending = pendingCountsMap.get('YOTPO') || 0;

    // Get pending tasks (both Task PENDING and RawMessage READY)
    const [taskPending, rawMessageReady] = await Promise.all([
      prisma.task.count({
        where: {
          status: "PENDING"
        }
      }),
      prisma.rawMessage.count({
        where: {
          status: "READY"
        }
      })
    ]);
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
