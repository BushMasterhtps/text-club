import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * Get Holds-specific agents
 * Returns agents with "HOLDS" in their agentTypes array
 */

export async function GET(request: NextRequest) {
  try {
    // Fetch agents with HOLDS in agentTypes
    const agents = await prisma.user.findMany({
      where: {
        role: { in: ['AGENT', 'MANAGER_AGENT'] },
        isActive: true,
        agentTypes: {
          has: 'HOLDS'
        }
      },
      select: {
        id: true,
        email: true,
        name: true,
        isLive: true,
        lastSeen: true,
        agentTypes: true
      },
      orderBy: {
        name: 'asc'
      }
    });

    // Get task counts for all agents in a single query (fixes N+1 issue)
    const agentIds = agents.map(agent => agent.id);
    const taskCounts = await prisma.task.groupBy({
      by: ['assignedToId'],
      where: {
        assignedToId: { in: agentIds },
        taskType: 'HOLDS',
        status: { in: ['PENDING', 'IN_PROGRESS', 'ASSISTANCE_REQUIRED'] }
      },
      _count: {
        id: true
      }
    });

    // Create a map of agentId -> count for quick lookup
    const countMap = new Map<string, number>();
    taskCounts.forEach(({ assignedToId, _count }) => {
      if (assignedToId) {
        countMap.set(assignedToId, _count.id);
      }
    });

    // Combine agents with their counts
    const agentsWithCounts = agents.map(agent => ({
      ...agent,
      holdsCount: countMap.get(agent.id) || 0
    }));

    return NextResponse.json({
      success: true,
      agents: agentsWithCounts
    });

  } catch (error) {
    console.error('Error fetching Holds agents:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch Holds agents'
    }, { status: 500 });
  }
}

