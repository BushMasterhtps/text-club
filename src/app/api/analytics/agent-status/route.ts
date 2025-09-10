import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    // Get all agents and managers
    const agents = await prisma.user.findMany({
      where: {
        role: { in: ["AGENT", "MANAGER"] },
        isLive: true
      },
      select: {
        id: true,
        name: true,
        email: true,
        lastSeen: true
      }
    });

    // Get today's date range
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
    const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

    // Use local dates directly - no UTC conversion needed
    const utcStartOfToday = startOfToday;
    const utcEndOfToday = endOfToday;

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
