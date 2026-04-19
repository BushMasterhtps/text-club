import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withSelfHealing } from "@/lib/self-healing/wrapper";
import { authorizeAgentTargetEmail } from "@/lib/auth";
import { getAgentReportingDayBoundsUtc } from "@/lib/agent-reporting-day-bounds";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email");
    const date = searchParams.get("date");

    const gate = await authorizeAgentTargetEmail(request, email);
    if (!gate.ok) return gate.response;

    // Get user
    const user = await prisma.user.findFirst({
      where: { email: gate.targetEmail },
    });

    if (!user) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    if (!user.isLive) {
      return NextResponse.json({ success: false, error: "User account is paused" }, { status: 403 });
    }

    let startUtc: Date;
    let endExclusiveUtc: Date;
    try {
      ({ startUtc, endExclusiveUtc } = getAgentReportingDayBoundsUtc(date));
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid date format. Use YYYY-MM-DD" },
        { status: 400 }
      );
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
                gte: startUtc,
                lt: endExclusiveUtc,
              }
            },
            {
              sentBackBy: user.id,
              status: 'PENDING',
              endTime: {
                gte: startUtc,
                lt: endExclusiveUtc,
              }
            },
            // NEW: Include tasks completed by this user but now unassigned (e.g., "Unable to Resolve" for Holds)
            {
              completedBy: user.id,
              status: 'COMPLETED',
              endTime: {
                gte: startUtc,
                lt: endExclusiveUtc,
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
