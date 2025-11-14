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

    // Get tasks completed today for each agent
    const agentStats = await Promise.all(
      agents.map(async (agent) => {
        const tasksCompletedToday = await prisma.task.count({
          where: {
            OR: [
              {
                assignedToId: agent.id,
                status: "COMPLETED",
                endTime: { gte: utcStartOfToday, lte: utcEndOfToday }
              },
              {
                sentBackBy: agent.id,
                status: "PENDING",
                endTime: { gte: utcStartOfToday, lte: utcEndOfToday }
              }
            ]
          }
        });

        // Get current task in progress
        const currentTask = await prisma.task.findFirst({
          where: {
            assignedToId: agent.id,
            status: "IN_PROGRESS"
          },
          select: {
            taskType: true
          }
        });

        // Get count of tasks currently in progress
        const tasksInProgress = await prisma.task.count({
          where: {
            assignedToId: agent.id,
            status: "IN_PROGRESS"
          }
        });

        // Check if agent is online (last seen within 5 minutes)
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        const isOnline = agent.lastSeen && agent.lastSeen > fiveMinutesAgo;

        return {
          id: agent.id,
          name: agent.name || 'Unknown',
          email: agent.email,
          isOnline: !!isOnline,
          currentTask: currentTask ? currentTask.taskType : null,
          tasksCompletedToday,
          tasksInProgress,
          lastSeen: agent.lastSeen?.toISOString() || new Date().toISOString()
        };
      })
    );

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
