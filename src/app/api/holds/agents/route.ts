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

    // Get task counts for each Holds agent
    const agentsWithCounts = await Promise.all(
      agents.map(async (agent) => {
        const holdsCount = await prisma.task.count({
          where: {
            assignedToId: agent.id,
            taskType: 'HOLDS',
            status: { in: ['PENDING', 'IN_PROGRESS', 'ASSISTANCE_REQUIRED'] }
          }
        });

        return {
          ...agent,
          holdsCount
        };
      })
    );

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

