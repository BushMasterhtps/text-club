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

    // Convert to UTC for database queries
    const utcDateStart = new Date(dateStart.getTime() - dateStart.getTimezoneOffset() * 60000);
    const utcDateEnd = new Date(dateEnd.getTime() - dateEnd.getTimezoneOffset() * 60000);

    // Get completed tasks for the date range (including sent-back tasks)
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

    // Get total completed tasks (all time)
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

    // Get pending tasks
    const pendingTasks = await prisma.task.count({
      where: {
        status: "PENDING"
      }
    });

    const data = {
      totalCompletedToday: completedTasks,
      totalCompleted,
      avgHandleTime: Math.round(avgHandleTimeResult._avg.durationSec || 0),
      activeAgents,
      tasksInProgress,
      pendingTasks
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
