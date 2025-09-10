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

    // Use local dates directly - no UTC conversion needed
    const utcDateStart = dateStart;
    const utcDateEnd = dateEnd;

    // Get daily trends for each task type
    const taskTypes = ['TEXT_CLUB', 'WOD_IVCS', 'EMAIL_REQUESTS', 'STANDALONE_REFUNDS'];
    const dailyTrends: any = {};

    // Initialize all dates in range using local dates
    const currentDate = new Date(dateStart);
    while (currentDate <= dateEnd) {
      // Use local date components to avoid timezone conversion
      const year = currentDate.getFullYear();
      const month = String(currentDate.getMonth() + 1).padStart(2, '0');
      const day = String(currentDate.getDate()).padStart(2, '0');
      const dateKey = `${year}-${month}-${day}`;
      
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

      // Group by date - use local date to avoid timezone issues
      tasks.forEach(task => {
        if (task.endTime) {
          const taskDate = new Date(task.endTime);
          // Use local date components to avoid timezone conversion
          const year = taskDate.getFullYear();
          const month = String(taskDate.getMonth() + 1).padStart(2, '0');
          const day = String(taskDate.getDate()).padStart(2, '0');
          const dateKey = `${year}-${month}-${day}`;
          
          if (dailyTrends[dateKey]) {
            const key = taskType === 'WOD_IVCS' ? 'wodIvcs' : 
                       taskType === 'TEXT_CLUB' ? 'textClub' :
                       taskType === 'EMAIL_REQUESTS' ? 'emailRequests' :
                       taskType === 'STANDALONE_REFUNDS' ? 'standaloneRefunds' :
                       taskType.toLowerCase().replace(/_/g, '');
            if (dailyTrends[dateKey].hasOwnProperty(key)) {
              dailyTrends[dateKey][key]++;
              dailyTrends[dateKey].total++;
            }
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
