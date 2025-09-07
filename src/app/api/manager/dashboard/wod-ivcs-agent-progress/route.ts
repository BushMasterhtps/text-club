import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    // Get current date boundaries for "today"
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    // Get all agents (including Manager + Agent users)
    const agents = await prisma.user.findMany({
      where: {
        role: { in: ['AGENT', 'MANAGER_AGENT'] }
      },
      select: {
        id: true,
        name: true,
        email: true,
        isLive: true,
        lastSeen: true
      }
    });

    // Get progress data for each agent (WOD/IVCS tasks only)
    const agentProgress = await Promise.all(
      agents.map(async (agent) => {
        const [assigned, inProgress, completedToday, lastActivity] = await Promise.all([
          // Total assigned WOD/IVCS tasks (PENDING + IN_PROGRESS + ASSISTANCE_REQUIRED + COMPLETED)
          prisma.task.count({
            where: { 
              assignedToId: agent.id,
              taskType: 'WOD_IVCS'
            }
          }),
          // Currently in progress WOD/IVCS tasks
          prisma.task.count({
            where: { 
              assignedToId: agent.id,
              status: 'IN_PROGRESS',
              taskType: 'WOD_IVCS'
            }
          }),
          // Completed today WOD/IVCS tasks
          prisma.task.count({
            where: {
              assignedToId: agent.id,
              status: 'COMPLETED',
              taskType: 'WOD_IVCS',
              endTime: {
                gte: startOfToday,
                lt: endOfToday
              }
            }
          }),
          // Last activity (most recent WOD/IVCS task update)
          prisma.task.findFirst({
            where: { 
              assignedToId: agent.id,
              taskType: 'WOD_IVCS'
            },
            orderBy: { updatedAt: 'desc' },
            select: { updatedAt: true }
          })
        ]);

        return {
          id: agent.id,
          name: agent.name || 'Unknown',
          email: agent.email,
          assigned,
          inProgress,
          completedToday,
          lastActivity: lastActivity?.updatedAt || null,
          isLive: agent.isLive
        };
      })
    );

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
    console.error('Error fetching WOD/IVCS agent progress:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch agent progress' },
      { status: 500 }
    );
  }
}
