import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    // Get current date boundaries for "today"
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    // OPTIMIZED: Get all agents and their task data in parallel with minimal queries
    const [agents, openTaskGroups, inProgressGroups, completedTodayGroups, sentBackTodayGroups, lastActivities] = await Promise.all([
      // Get all agents
      prisma.user.findMany({
        where: { role: { in: ["AGENT", "MANAGER_AGENT"] } },
        select: { id: true, name: true, email: true, isLive: true, lastSeen: true }
      }),
      // Group open tasks by agent + task type (1 query instead of N×4)
      prisma.task.groupBy({
        by: ['assignedToId', 'taskType'],
        where: {
          assignedToId: { not: null },
          status: { in: ["PENDING", "IN_PROGRESS", "ASSISTANCE_REQUIRED"] }
        },
        _count: { id: true }
      }),
      // Group in-progress tasks by agent + task type (1 query instead of N×4)
      prisma.task.groupBy({
        by: ['assignedToId', 'taskType'],
        where: {
          assignedToId: { not: null },
          status: "IN_PROGRESS"
        },
        _count: { id: true }
      }),
      // Group completed today by agent + task type (1 query instead of N×4)
      prisma.task.groupBy({
        by: ['assignedToId', 'taskType'],
        where: {
          assignedToId: { not: null },
          status: "COMPLETED",
          endTime: { gte: startOfToday, lt: endOfToday }
        },
        _count: { id: true }
      }),
      // Group sent-back tasks completed today by agent + task type
      prisma.task.groupBy({
        by: ['sentBackBy', 'taskType'],
        where: {
          sentBackBy: { not: null },
          status: "PENDING",
          endTime: { gte: startOfToday, lt: endOfToday }
        },
        _count: { id: true }
      }),
      // Get last activity for each agent (still needs individual queries due to findFirst)
      prisma.task.findMany({
        where: { assignedToId: { not: null } },
        orderBy: { updatedAt: "desc" },
        distinct: ['assignedToId'],
        select: { assignedToId: true, updatedAt: true }
      })
    ]);

    // Build lookup maps for O(1) access
    const openTaskMap = new Map<string, Map<string, number>>();
    for (const g of openTaskGroups) {
      if (!g.assignedToId) continue;
      if (!openTaskMap.has(g.assignedToId)) {
        openTaskMap.set(g.assignedToId, new Map());
      }
      openTaskMap.get(g.assignedToId)!.set(g.taskType, g._count.id);
    }

    const inProgressMap = new Map<string, Map<string, number>>();
    for (const g of inProgressGroups) {
      if (!g.assignedToId) continue;
      if (!inProgressMap.has(g.assignedToId)) {
        inProgressMap.set(g.assignedToId, new Map());
      }
      inProgressMap.get(g.assignedToId)!.set(g.taskType, g._count.id);
    }

    const completedTodayMap = new Map<string, Map<string, number>>();
    for (const g of completedTodayGroups) {
      if (!g.assignedToId) continue;
      if (!completedTodayMap.has(g.assignedToId)) {
        completedTodayMap.set(g.assignedToId, new Map());
      }
      completedTodayMap.get(g.assignedToId)!.set(g.taskType, g._count.id);
    }

    const sentBackMap = new Map<string, Map<string, number>>();
    for (const g of sentBackTodayGroups) {
      if (!g.sentBackBy) continue;
      if (!sentBackMap.has(g.sentBackBy)) {
        sentBackMap.set(g.sentBackBy, new Map());
      }
      sentBackMap.get(g.sentBackBy)!.set(g.taskType, g._count.id);
    }

    const lastActivityMap = new Map<string, Date>();
    for (const activity of lastActivities) {
      if (activity.assignedToId) {
        lastActivityMap.set(activity.assignedToId, activity.updatedAt);
      }
    }

    // Build agent progress data (no additional database queries)
    const agentProgress = agents.map((agent) => {
      const openTasks = openTaskMap.get(agent.id);
      const inProgressTasks = inProgressMap.get(agent.id);
      const completedTasks = completedTodayMap.get(agent.id);
      const sentBackTasks = sentBackMap.get(agent.id);

      // Get counts by task type (open/assigned)
      const textClubAssigned = openTasks?.get('TEXT_CLUB') ?? 0;
      const wodIvcsAssigned = openTasks?.get('WOD_IVCS') ?? 0;
      const emailRequestsAssigned = openTasks?.get('EMAIL_REQUESTS') ?? 0;
      const standaloneRefundsAssigned = openTasks?.get('STANDALONE_REFUNDS') ?? 0;

      // Get in-progress counts
      const textClubInProgress = inProgressTasks?.get('TEXT_CLUB') ?? 0;
      const wodIvcsInProgress = inProgressTasks?.get('WOD_IVCS') ?? 0;
      const emailRequestsInProgress = inProgressTasks?.get('EMAIL_REQUESTS') ?? 0;
      const standaloneRefundsInProgress = inProgressTasks?.get('STANDALONE_REFUNDS') ?? 0;

      // Get completed today counts (including sent-back tasks)
      const textClubCompletedToday = (completedTasks?.get('TEXT_CLUB') ?? 0) + (sentBackTasks?.get('TEXT_CLUB') ?? 0);
      const wodIvcsCompletedToday = (completedTasks?.get('WOD_IVCS') ?? 0) + (sentBackTasks?.get('WOD_IVCS') ?? 0);
      const emailRequestsCompletedToday = (completedTasks?.get('EMAIL_REQUESTS') ?? 0) + (sentBackTasks?.get('EMAIL_REQUESTS') ?? 0);
      const standaloneRefundsCompletedToday = (completedTasks?.get('STANDALONE_REFUNDS') ?? 0) + (sentBackTasks?.get('STANDALONE_REFUNDS') ?? 0);

      // Calculate totals
      const assigned = textClubAssigned + wodIvcsAssigned + emailRequestsAssigned + standaloneRefundsAssigned;
      const inProgress = textClubInProgress + wodIvcsInProgress + emailRequestsInProgress + standaloneRefundsInProgress;
      const completedToday = textClubCompletedToday + wodIvcsCompletedToday + emailRequestsCompletedToday + standaloneRefundsCompletedToday;

      return {
        id: agent.id,
        name: agent.name || "Unknown",
        email: agent.email,
        assigned,
        inProgress,
        completedToday,
        lastActivity: lastActivityMap.get(agent.id) || null,
        isLive: agent.isLive,
        taskTypeBreakdown: {
          textClub: {
            assigned: textClubAssigned,
            inProgress: textClubInProgress,
            completedToday: textClubCompletedToday
          },
          wodIvcs: {
            assigned: wodIvcsAssigned,
            inProgress: wodIvcsInProgress,
            completedToday: wodIvcsCompletedToday
          },
          emailRequests: {
            assigned: emailRequestsAssigned,
            inProgress: emailRequestsInProgress,
            completedToday: emailRequestsCompletedToday
          },
          standaloneRefunds: {
            assigned: standaloneRefundsAssigned,
            inProgress: standaloneRefundsInProgress,
            completedToday: standaloneRefundsCompletedToday
          }
        }
      };
    });

    // Sort by completed today (descending), then by assigned (descending)
    agentProgress.sort((a, b) => {
      if (b.completedToday !== a.completedToday) {
        return b.completedToday - a.completedToday;
      }
      return b.assigned - a.assigned;
    });

    return NextResponse.json({
      success: true,
      agentProgress
    });

  } catch (error) {
    console.error("Error fetching agent progress:", error);
    console.error("Error details:", {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined
    });
    return NextResponse.json(
      { 
        success: false, 
        error: "Failed to fetch agent progress",
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
