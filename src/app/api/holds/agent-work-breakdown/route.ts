import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * API for Agent Work Breakdown
 * Simple approach: Count completed tasks per agent, broken down by disposition
 * Each completed task counts as work for the agent who completed it
 */

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const agentId = searchParams.get('agentId'); // Optional: filter by specific agent

    // Build date filter
    let dateStart: Date | null = null;
    let dateEnd: Date | null = null;
    if (startDate && endDate) {
      const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
      const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
      
      // Start of day in PST = 8:00 AM UTC (PST is UTC-8)
      dateStart = new Date(Date.UTC(startYear, startMonth - 1, startDay, 8, 0, 0, 0));
      // End of day in PST = 7:59:59.999 AM UTC next day
      dateEnd = new Date(Date.UTC(endYear, endMonth - 1, endDay + 1, 7, 59, 59, 999));
    }

    // Build where clause - Include tasks with either completedBy or assignedTo
    const where: any = {
      taskType: 'HOLDS',
      status: 'COMPLETED',
      OR: [
        { completedBy: { not: null } },
        { assignedToId: { not: null } }
      ]
    };

    // Add date filter if provided
    if (dateStart && dateEnd) {
      where.endTime = {
        gte: dateStart,
        lte: dateEnd
      };
    }

    // Add agent filter if specified
    if (agentId && agentId !== 'all') {
      where.AND = [
        { OR: where.OR },
        {
          OR: [
            { completedBy: agentId },
            { assignedToId: agentId }
          ]
        }
      ];
      delete where.OR;
    }

    // Query completed Holds tasks
    const tasks = await prisma.task.findMany({
      where,
      select: {
        id: true,
        holdsOrderAmount: true,
        disposition: true,
        endTime: true,
        durationSec: true,
        completedBy: true,
        completedByUser: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        assignedToId: true,
        assignedTo: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: {
        endTime: 'desc'
      }
    });

    // Group by agent
    const agentMap = new Map<string, {
      agentId: string;
      agentName: string;
      agentEmail: string;
      totalCount: number;
      totalAmount: number;
      totalDuration: number;
      dispositions: Record<string, { count: number; amount: number }>;
    }>();

    for (const task of tasks) {
      // Use completedBy if available, otherwise fall back to assignedTo
      const agentId = task.completedBy || task.assignedToId;
      const agentInfo = task.completedByUser || task.assignedTo;
      
      if (!agentId || !agentInfo) continue;

      const amount = task.holdsOrderAmount ? Number(task.holdsOrderAmount) : 0;
      const duration = task.durationSec || 0;
      const disposition = task.disposition || 'Unknown';

      // Initialize agent if not exists
      if (!agentMap.has(agentId)) {
        agentMap.set(agentId, {
          agentId,
          agentName: agentInfo.name,
          agentEmail: agentInfo.email,
          totalCount: 0,
          totalAmount: 0,
          totalDuration: 0,
          dispositions: {}
        });
      }

      const agent = agentMap.get(agentId)!;
      
      // Update totals
      agent.totalCount++;
      agent.totalAmount += amount;
      agent.totalDuration += duration;

      // Update disposition breakdown
      if (!agent.dispositions[disposition]) {
        agent.dispositions[disposition] = { count: 0, amount: 0 };
      }
      agent.dispositions[disposition].count++;
      agent.dispositions[disposition].amount += amount;
    }

    // Convert to array and calculate averages
    const agents = Array.from(agentMap.values()).map(agent => ({
      ...agent,
      avgResolutionTime: agent.totalCount > 0 ? agent.totalDuration / agent.totalCount : 0
    })).sort((a, b) => b.totalCount - a.totalCount);

    // Calculate summary stats
    const summary = {
      totalTasks: tasks.length,
      totalAgents: agents.length,
      totalAmount: agents.reduce((sum, a) => sum + a.totalAmount, 0),
      totalCount: agents.reduce((sum, a) => sum + a.totalCount, 0)
    };

    return NextResponse.json({
      success: true,
      data: {
        agents,
        summary
      }
    });

  } catch (error) {
    console.error('Error fetching agent work breakdown:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch agent work breakdown' },
      { status: 500 }
    );
  }
}
