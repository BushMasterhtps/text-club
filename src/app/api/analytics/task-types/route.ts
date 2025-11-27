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

    // Get stats for each task type
    const taskTypes = ['TEXT_CLUB', 'WOD_IVCS', 'EMAIL_REQUESTS', 'HOLDS', 'YOTPO'];
    const taskTypeStats: any = {};

    for (const taskType of taskTypes) {
      // Get completed tasks for this type
      // Count ALL COMPLETED tasks (status = COMPLETED, endTime in range)
      // This matches the Holds resolved report logic
      const completed = await prisma.task.count({
        where: {
          taskType: taskType as any,
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

      // Get pending tasks for this type
      const pending = await prisma.task.count({
        where: {
          taskType: taskType as any,
          status: "PENDING"
        }
      });

      // Get average duration for completed tasks
      const avgDurationResult = await prisma.task.aggregate({
        where: {
          taskType: taskType as any,
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
