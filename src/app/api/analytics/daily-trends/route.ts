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
      // Default to last 7 days
      const today = new Date();
      dateStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7, 0, 0, 0, 0);
      dateEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
    }

    // Convert to UTC for database queries
    const utcDateStart = new Date(dateStart.getTime() - dateStart.getTimezoneOffset() * 60000);
    const utcDateEnd = new Date(dateEnd.getTime() - dateEnd.getTimezoneOffset() * 60000);

    // Get daily trends for each task type
    const taskTypes = ['TEXT_CLUB', 'WOD_IVCS', 'EMAIL_REQUESTS', 'STANDALONE_REFUNDS'];
    const dailyTrends: any = {};

    // Initialize all dates in range
    const currentDate = new Date(dateStart);
    while (currentDate <= dateEnd) {
      const dateKey = currentDate.toISOString().split('T')[0];
      dailyTrends[dateKey] = {
        date: dateKey,
        textClub: 0,
        wodIvcs: 0,
        emailRequests: 0,
        standaloneRefunds: 0,
        total: 0
      };
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Get completed tasks by day and task type
    for (const taskType of taskTypes) {
      const tasks = await prisma.task.findMany({
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
        },
        select: {
          endTime: true
        }
      });

      // Group by date
      tasks.forEach(task => {
        if (task.endTime) {
          const taskDate = new Date(task.endTime);
          const dateKey = taskDate.toISOString().split('T')[0];
          
          if (dailyTrends[dateKey]) {
            const key = taskType.toLowerCase().replace(/_/g, '');
            dailyTrends[dateKey][key]++;
            dailyTrends[dateKey].total++;
          }
        }
      });
    }

    // Convert to array and sort by date
    const trendsArray = Object.values(dailyTrends).sort((a: any, b: any) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    return NextResponse.json({
      success: true,
      data: trendsArray
    });

  } catch (error) {
    console.error('Analytics Daily Trends API Error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to load daily trends data'
    }, { status: 500 });
  }
}
