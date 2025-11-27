import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    // Get all agents and manager-agents
    const agents = await prisma.user.findMany({
      where: {
        role: { in: ["AGENT", "MANAGER_AGENT"] },
        isLive: true
      },
      select: {
        id: true,
        name: true,
        email: true,
        lastSeen: true
      }
    });

    // Get today's date range in PST timezone (matching other APIs)
    // PST = UTC - 8 hours
    const now = new Date();
    const pstOffset = -8 * 60 * 60 * 1000; // PST = UTC - 8 hours
    const nowPST = new Date(now.getTime() + pstOffset);
    const year = nowPST.getUTCFullYear();
    const month = nowPST.getUTCMonth();
    const day = nowPST.getUTCDate();
    
    // Create UTC dates for PST day boundaries
    // 8 AM UTC = 12 AM PST
    const utcStartOfToday = new Date(Date.UTC(year, month, day, 8, 0, 0, 0));
    const utcEndOfToday = new Date(Date.UTC(year, month, day + 1, 7, 59, 59, 999));

    // Get agent IDs for batch queries
    const agentIds = agents.map(agent => agent.id);

    // FIX 1: Get all tasks completed today counts in a single query (fixes N+1)
    // Include completedBy to support unassigned completions (e.g., "Unable to Resolve" for Holds)
    const [completedByAssigned, completedBySentBack, completedByCompletedBy] = await Promise.all([
      // Tasks completed by assignedToId
      prisma.task.groupBy({
        by: ['assignedToId'],
        where: {
          assignedToId: { in: agentIds },
          status: "COMPLETED",
          endTime: { gte: utcStartOfToday, lte: utcEndOfToday }
        },
        _count: { id: true }
      }),
      // Tasks sent back by agent
      prisma.task.groupBy({
        by: ['sentBackBy'],
        where: {
          sentBackBy: { in: agentIds },
          status: "PENDING",
          endTime: { gte: utcStartOfToday, lte: utcEndOfToday }
        },
        _count: { id: true }
      }),
      // Tasks completed by agent but now unassigned (e.g., "Unable to Resolve" for Holds)
      prisma.task.groupBy({
        by: ['completedBy'],
        where: {
          completedBy: { in: agentIds },
          status: "COMPLETED",
          endTime: { gte: utcStartOfToday, lte: utcEndOfToday }
        },
        _count: { id: true }
      })
    ]);

    // Create maps for quick lookup
    const completedCountMap = new Map<string, number>();
    completedByAssigned.forEach(({ assignedToId, _count }) => {
      if (assignedToId) {
        completedCountMap.set(assignedToId, (completedCountMap.get(assignedToId) || 0) + _count.id);
      }
    });
    completedBySentBack.forEach(({ sentBackBy, _count }) => {
      if (sentBackBy) {
        completedCountMap.set(sentBackBy, (completedCountMap.get(sentBackBy) || 0) + _count.id);
      }
    });
    completedByCompletedBy.forEach(({ completedBy, _count }) => {
      if (completedBy) {
        completedCountMap.set(completedBy, (completedCountMap.get(completedBy) || 0) + _count.id);
      }
    });

    // FIX 2: Get all current tasks in progress in a single query (fixes N+1)
    const allCurrentTasks = await prisma.task.findMany({
      where: {
        assignedToId: { in: agentIds },
        status: "IN_PROGRESS"
      },
      select: {
        assignedToId: true,
        taskType: true
      },
      // Get only the first task per agent (matching findFirst behavior)
      distinct: ['assignedToId']
    });

    // Create map for current tasks
    const currentTaskMap = new Map<string, string | null>();
    allCurrentTasks.forEach(task => {
      if (task.assignedToId) {
        currentTaskMap.set(task.assignedToId, task.taskType);
      }
    });

    // FIX 3: Get all tasks in progress counts in a single query (fixes N+1)
    const inProgressCounts = await prisma.task.groupBy({
      by: ['assignedToId'],
      where: {
        assignedToId: { in: agentIds },
        status: "IN_PROGRESS"
      },
      _count: { id: true }
    });

    // Create map for in progress counts
    const inProgressCountMap = new Map<string, number>();
    inProgressCounts.forEach(({ assignedToId, _count }) => {
      if (assignedToId) {
        inProgressCountMap.set(assignedToId, _count.id);
      }
    });

    // Combine all data for each agent
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const agentStats = agents.map(agent => {
      const isOnline = agent.lastSeen && agent.lastSeen > fiveMinutesAgo;

      return {
        id: agent.id,
        name: agent.name || 'Unknown',
        email: agent.email,
        isOnline: !!isOnline,
        currentTask: currentTaskMap.get(agent.id) || null,
        tasksCompletedToday: completedCountMap.get(agent.id) || 0,
        tasksInProgress: inProgressCountMap.get(agent.id) || 0,
        lastSeen: agent.lastSeen?.toISOString() || new Date().toISOString()
      };
    });

    // Sort by online status first, then by tasks completed
    agentStats.sort((a, b) => {
      if (a.isOnline && !b.isOnline) return -1;
      if (!a.isOnline && b.isOnline) return 1;
      return b.tasksCompletedToday - a.tasksCompletedToday;
    });

    return NextResponse.json({
      success: true,
      data: agentStats
    });

  } catch (error) {
    console.error('Analytics Agent Status API Error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to load agent status data'
    }, { status: 500 });
  }
}
