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

    // Get completed tasks for the date range (including sent-back tasks and Holds with completedBy)
    // For Holds: include tasks with completedBy (even if unassigned)
    // For other types: standard COMPLETED status
    const completedTasks = await prisma.task.count({
      where: {
        OR: [
          {
            status: "COMPLETED",
            endTime: { gte: utcDateStart, lte: utcDateEnd },
            taskType: { not: "HOLDS" } // Non-Holds completed tasks
          },
          {
            status: "COMPLETED",
            endTime: { gte: utcDateStart, lte: utcDateEnd },
            taskType: "HOLDS",
            completedBy: { not: null } // Holds completed tasks (including unassigned)
          },
          {
            status: "PENDING",
            sentBackBy: { not: null },
            endTime: { gte: utcDateStart, lte: utcDateEnd }
          }
        ]
      }
    });

    // Get total completed tasks (all time) - including Holds with completedBy
    const totalCompleted = await prisma.task.count({
      where: {
        OR: [
          {
            status: "COMPLETED",
            taskType: { not: "HOLDS" } // Non-Holds completed tasks
          },
          {
            status: "COMPLETED",
            taskType: "HOLDS",
            completedBy: { not: null } // Holds completed tasks (including unassigned)
          },
          { 
            status: "PENDING",
            sentBackBy: { not: null },
            endTime: { not: null }
          }
        ]
      }
    });

    // Get average handle time for completed tasks in date range (including Holds with completedBy)
    const avgHandleTimeResult = await prisma.task.aggregate({
      where: {
        OR: [
          {
            status: "COMPLETED",
            endTime: { gte: utcDateStart, lte: utcDateEnd },
            durationSec: { not: null },
            taskType: { not: "HOLDS" } // Non-Holds completed tasks
          },
          {
            status: "COMPLETED",
            endTime: { gte: utcDateStart, lte: utcDateEnd },
            durationSec: { not: null },
            taskType: "HOLDS",
            completedBy: { not: null } // Holds completed tasks (including unassigned)
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

    // Get pending tasks by task type (both Task table and RawMessage table)
    const [textClubPending, wodIvcsPending, emailRequestsPending, holdsPending, yotpoPending] = await Promise.all([
      // Text Club: Count both Task PENDING and RawMessage READY
      Promise.all([
        prisma.task.count({
          where: {
            status: "PENDING",
            taskType: "TEXT_CLUB"
          }
        }),
        prisma.rawMessage.count({
          where: {
            status: "READY"
          }
        })
      ]).then(([taskPending, rawMessageReady]) => taskPending + rawMessageReady),
      
      // WOD/IVCS: Only count Task PENDING (no RawMessage equivalent)
      prisma.task.count({
        where: {
          status: "PENDING",
          taskType: "WOD_IVCS"
        }
      }),
      
      // Email Requests: Only count Task PENDING (no RawMessage equivalent)
      prisma.task.count({
        where: {
          status: "PENDING",
          taskType: "EMAIL_REQUESTS"
        }
      }),
      
      // Holds: Only count Task PENDING
      prisma.task.count({
        where: {
          status: "PENDING",
          taskType: "HOLDS"
        }
      }),
      
      // Yotpo: Only count Task PENDING
      prisma.task.count({
        where: {
          status: "PENDING",
          taskType: "YOTPO"
        }
      })
    ]);

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
