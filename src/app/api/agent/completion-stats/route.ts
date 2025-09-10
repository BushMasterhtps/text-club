import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email");
    const date = searchParams.get("date");

    if (!email) {
      return NextResponse.json({ success: false, error: "Email is required" }, { status: 400 });
    }

    // Get user
    const user = await prisma.user.findFirst({
      where: { email },
    });

    if (!user) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    if (!user.isLive) {
      return NextResponse.json({ success: false, error: "User account is paused" }, { status: 403 });
    }

    // Parse date - handle timezone properly
    let startOfDay: Date;
    let endOfDay: Date;
    
    if (date) {
      // Parse the date string as local time (not UTC)
      const [year, month, day] = date.split('-').map(Number);
      if (isNaN(year) || isNaN(month) || isNaN(day)) {
        return NextResponse.json({ success: false, error: "Invalid date format. Use YYYY-MM-DD" }, { status: 400 });
      }
      startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0); // month is 0-indexed
      endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);
    } else {
      // Use today in local timezone
      const today = new Date();
      startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
      endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
    }

    // Convert to UTC for database queries to avoid timezone issues
    const utcStartOfDay = new Date(startOfDay.getTime() - startOfDay.getTimezoneOffset() * 60000);
    const utcEndOfDay = new Date(endOfDay.getTime() - endOfDay.getTimezoneOffset() * 60000);


    // Get completion stats by task type for today (including sent-back tasks)
    const completionStats = await prisma.task.groupBy({
      by: ['taskType'],
      where: {
        OR: [
          {
            assignedToId: user.id,
            status: 'COMPLETED',
            endTime: {
              gte: utcStartOfDay,
              lte: utcEndOfDay
            }
          },
          {
            sentBackBy: user.id,
            status: 'PENDING',
            endTime: {
              gte: utcStartOfDay,
              lte: utcEndOfDay
            }
          }
        ]
      },
      _count: {
        id: true
      }
    });

    // Get total completion stats (lifetime) including sent-back tasks
    const totalStats = await prisma.task.groupBy({
      by: ['taskType'],
      where: {
        OR: [
          {
            assignedToId: user.id,
            status: 'COMPLETED'
          },
          {
            sentBackBy: user.id,
            status: 'PENDING'
          }
        ]
      },
      _count: {
        id: true
      }
    });


    // Format the response
    const taskTypes = ['TEXT_CLUB', 'WOD_IVCS', 'EMAIL_REQUESTS', 'STANDALONE_REFUNDS'];
    const stats = {
      today: {} as Record<string, number>,
      total: {} as Record<string, number>
    };

    // Initialize all task types with 0
    taskTypes.forEach(taskType => {
      stats.today[taskType] = 0;
      stats.total[taskType] = 0;
    });

    // Fill in actual completion counts for today
    completionStats.forEach(stat => {
      stats.today[stat.taskType] = stat._count.id;
    });

    // Fill in actual completion counts for total
    totalStats.forEach(stat => {
      stats.total[stat.taskType] = stat._count.id;
    });

    return NextResponse.json({ 
      success: true, 
      stats,
      date: date || new Date().toISOString().split('T')[0]
    });

  } catch (error: any) {
    console.error("Error fetching completion stats:", error);
    return NextResponse.json({ 
      success: false, 
      error: error?.message || "Failed to fetch completion stats" 
    }, { status: 500 });
  }
}
