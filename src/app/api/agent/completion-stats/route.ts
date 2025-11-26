import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withSelfHealing } from "@/lib/self-healing/wrapper";

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

    // Parse date - handle PST timezone properly
    // The server runs in UTC, but our users are in PST (UTC-8)
    // We need to convert the date to PST timezone
    
    let startOfDay: Date;
    let endOfDay: Date;
    
    if (date) {
      // Parse the date string as PST time
      const [year, month, day] = date.split('-').map(Number);
      if (isNaN(year) || isNaN(month) || isNaN(day)) {
        return NextResponse.json({ success: false, error: "Invalid date format. Use YYYY-MM-DD" }, { status: 400 });
      }
      
      // Create date in PST: Nov 5 00:00 PST = Nov 5 08:00 UTC
      // PST is UTC-8, so we add 8 hours to get the UTC equivalent
      const pstOffset = 8 * 60 * 60 * 1000; // 8 hours in milliseconds
      startOfDay = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0) + pstOffset);
      endOfDay = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999) + pstOffset);
    } else {
      // Use today in PST timezone
      const now = new Date();
      const pstOffset = 8 * 60 * 60 * 1000; // 8 hours in milliseconds
      const nowPST = new Date(now.getTime() + pstOffset);
      const year = nowPST.getUTCFullYear();
      const month = nowPST.getUTCMonth();
      const day = nowPST.getUTCDate();
      
      startOfDay = new Date(Date.UTC(year, month, day, 0, 0, 0, 0) + pstOffset);
      endOfDay = new Date(Date.UTC(year, month, day, 23, 59, 59, 999) + pstOffset);
    }

    // Get completion stats by task type for today (including sent-back tasks and unassigned completed tasks)
    const completionStats = await withSelfHealing(
      () => prisma.task.groupBy({
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
            },
            // NEW: Include tasks completed by this user but now unassigned (e.g., "Unable to Resolve" for Holds)
            {
              completedBy: user.id,
              status: 'COMPLETED',
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
      }),
      { service: 'database', useRetry: true, useCircuitBreaker: true }
    );

    // Get total completion stats (lifetime) including sent-back tasks and unassigned completed tasks
    const totalStats = await withSelfHealing(
      () => prisma.task.groupBy({
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
            },
            // NEW: Include tasks completed by this user but now unassigned (e.g., "Unable to Resolve" for Holds)
            {
              completedBy: user.id,
              status: 'COMPLETED'
            }
          ]
        },
        _count: {
          id: true
        }
      }),
      { service: 'database', useRetry: true, useCircuitBreaker: true }
    );


    // Format the response
    const taskTypes = ['TEXT_CLUB', 'WOD_IVCS', 'EMAIL_REQUESTS', 'YOTPO', 'HOLDS', 'STANDALONE_REFUNDS'];
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
