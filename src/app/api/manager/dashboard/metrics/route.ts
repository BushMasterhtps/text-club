import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withSelfHealing } from "@/lib/self-healing/wrapper";

const DEFAULT_METRICS = {
  pending: 0,
  pendingRawMessages: 0,
  spamReview: 0,
  completedToday: 0,
  totalCompleted: 0,
  inProgress: 0,
  assignedNotStarted: 0,
  activeWork: 0,
  assistanceRequired: 0,
  totalAll: 0,
  pctDone: 0,
};

export async function GET(request: NextRequest) {
  try {
    return await withSelfHealing(async () => {
    try {
    // Get current date boundaries for "today"
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    // Optimize: Use a single groupBy query for all task counts instead of multiple count queries
    const [pendingRawMessages, taskStatusGroups] = await Promise.all([
      prisma.rawMessage.count({
        where: { status: "READY" }
      }),
      prisma.task.groupBy({
        by: ['status'],
        where: {
          taskType: "TEXT_CLUB" // Only Text Club tasks
        },
        _count: {
          id: true
        }
      })
    ]);

    // Build a map for fast status lookup
    const statusCountMap = new Map<string, number>();
    for (const group of taskStatusGroups) {
      statusCountMap.set(group.status, group._count.id);
    }

    // Get completed today count separately (needs date filtering)
    const completedToday = await prisma.task.count({
      where: {
        status: "COMPLETED",
        taskType: "TEXT_CLUB",
        endTime: {
          gte: startOfToday,
          lt: endOfToday
        }
      }
    });

    // Extract counts from the map
    // Get only unassigned pending tasks (assigned tasks are shown in agent progress, not here)
    const pendingTasks = await prisma.task.count({
      where: {
        taskType: "TEXT_CLUB",
        status: "PENDING",
        assignedToId: null  // Only unassigned tasks
      }
    });
    const spamReview = statusCountMap.get('SPAM_REVIEW') ?? 0;
    const totalCompleted = statusCountMap.get('COMPLETED') ?? 0;
    const inProgress = statusCountMap.get('IN_PROGRESS') ?? 0;
    const assistanceRequired = statusCountMap.get('ASSISTANCE_REQUIRED') ?? 0;
    
    // Get assigned but not started tasks (PENDING with assignedToId)
    // These count as "Active Work" even though they're not IN_PROGRESS yet
    const assignedNotStarted = await prisma.task.count({
      where: {
        taskType: "TEXT_CLUB",
        status: "PENDING",
        assignedToId: { not: null }  // Assigned but not started
      }
    });
    
    // Active Work = IN_PROGRESS + Assigned (Not Started)
    const activeWork = inProgress + assignedNotStarted;

    const totalPending = pendingRawMessages + pendingTasks;
    const totalAll = totalPending + spamReview + totalCompleted + activeWork + assistanceRequired;
    const pctDone = totalAll > 0 ? Math.round((totalCompleted / totalAll) * 100) : 0;

    return NextResponse.json({
      success: true,
      metrics: {
        pending: totalPending,
        pendingRawMessages,
        spamReview,
        completedToday,
        totalCompleted,
        inProgress,
        assignedNotStarted,  // NEW: Assigned but not started count
        activeWork,  // NEW: Total active work (IN_PROGRESS + Assigned Not Started)
        assistanceRequired,
        totalAll,
        pctDone
      }
    });

    } catch (error) {
      console.error("Error fetching dashboard metrics:", error);
      console.error("Error details:", {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        name: error instanceof Error ? error.name : undefined
      });
      return NextResponse.json(
        { 
          success: false, 
          error: "Failed to fetch dashboard metrics",
          details: error instanceof Error ? error.message : 'Unknown error'
        },
        { status: 500 }
      );
    }
  }, { service: 'database' });
  } catch (error: any) {
    // Graceful degradation: DB/circuit breaker failure should not block the portal
    console.error("Dashboard metrics unavailable (returning defaults):", error?.message || error);
    return NextResponse.json({
      success: true,
      metrics: DEFAULT_METRICS,
      _degraded: true,
      _message: "Metrics temporarily unavailable; showing defaults.",
    }, { status: 200 });
  }
}
