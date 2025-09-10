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
    // If no date provided, use today in local timezone
    const targetDate = date ? new Date(date + 'T00:00:00') : new Date();
    
    // Use local timezone for date calculations to match user's timezone
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);


    // Get completion stats by task type for today (including sent-back tasks)
    const completionStats = await prisma.task.groupBy({
      by: ['taskType'],
      where: {
        OR: [
          {
            assignedToId: user.id,
            status: 'COMPLETED',
            endTime: {
              gte: startOfDay,
              lte: endOfDay
            }
          },
          {
            sentBackBy: user.id,
            status: 'PENDING',
            endTime: {
              gte: startOfDay,
              lte: endOfDay
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
      date: targetDate.toISOString().split('T')[0]
    });

  } catch (error: any) {
    console.error("Error fetching completion stats:", error);
    return NextResponse.json({ 
      success: false, 
      error: error?.message || "Failed to fetch completion stats" 
    }, { status: 500 });
  }
}
