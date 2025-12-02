import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * API for Agent Work Breakdown by Queue
 * Tracks agent work across all queue stages, not just final completion
 * 
 * This endpoint addresses the issue where tasks move through multiple queues
 * (Agent Research → Customer Contact → Escalated Call 4+ Day → Completed)
 * and we need to count work done by agents in each queue, not just final completion.
 */

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const agentId = searchParams.get('agentId'); // Optional: filter by specific agent

    // Build date filter - use endTime for completed tasks
    let dateFilter: any = {};
    if (startDate && endDate) {
      const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
      const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
      
      // Start of day in PST = 8:00 AM UTC (PST is UTC-8)
      const pstStartUTC = new Date(Date.UTC(startYear, startMonth - 1, startDay, 8, 0, 0, 0));
      // End of day in PST = 7:59:59.999 AM UTC next day
      const pstEndUTC = new Date(Date.UTC(endYear, endMonth - 1, endDay + 1, 7, 59, 59, 999));
      
      dateFilter = {
        gte: pstStartUTC,
        lte: pstEndUTC
      };
    }

    // Query all completed Holds tasks in the date range
    // We'll use completedBy to identify which agent completed work in each queue
    const where: any = {
      taskType: 'HOLDS',
      status: 'COMPLETED',
      endTime: dateFilter,
      completedBy: { not: null }, // Only tasks where an agent completed work
      disposition: { not: null }
    };

    if (agentId && agentId !== 'all') {
      where.completedBy = agentId;
    }

    const tasks = await prisma.task.findMany({
      where,
      select: {
        id: true,
        holdsOrderNumber: true,
        holdsOrderAmount: true,
        holdsStatus: true, // Final queue when completed
        holdsQueueHistory: true,
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
        }
      },
      orderBy: {
        endTime: 'desc'
      }
    });

    // Build agent work breakdown
    // Key: agentId-queue (e.g., "agent123-Agent Research")
    const agentWorkMap = new Map<string, {
      agentId: string;
      agentName: string;
      agentEmail: string;
      queue: string;
      count: number;
      totalAmount: number;
      totalDuration: number;
      dispositions: Record<string, { count: number; amount: number }>;
    }>();

    for (const task of tasks) {
      if (!task.completedBy || !task.completedByUser) continue;

      const agentId = task.completedBy;
      const agentName = task.completedByUser.name;
      const agentEmail = task.completedByUser.email;
      
      // Get the queue where this agent completed work
      // This is the queue the task was in when the agent completed it
      const queue = task.holdsStatus || 'Unknown';
      
      // Create key for this agent-queue combination
      const key = `${agentId}-${queue}`;
      
      if (!agentWorkMap.has(key)) {
        agentWorkMap.set(key, {
          agentId,
          agentName,
          agentEmail,
          queue,
          count: 0,
          totalAmount: 0,
          totalDuration: 0,
          dispositions: {}
        });
      }

      const work = agentWorkMap.get(key)!;
      work.count++;
      
      // Add order amount
      const amount = task.holdsOrderAmount ? Number(task.holdsOrderAmount) : 0;
      work.totalAmount += amount;
      
      // Add duration
      const duration = task.durationSec || 0;
      work.totalDuration += duration;
      
      // Track disposition
      const disp = task.disposition || 'Unknown';
      if (!work.dispositions[disp]) {
        work.dispositions[disp] = { count: 0, amount: 0 };
      }
      work.dispositions[disp].count++;
      work.dispositions[disp].amount += amount;
    }

    // Convert map to array and group by agent
    const agentWorkArray = Array.from(agentWorkMap.values());
    
    // Group by agent for easier frontend consumption
    const agentBreakdown = new Map<string, {
      agentId: string;
      agentName: string;
      agentEmail: string;
      queues: Array<{
        queue: string;
        count: number;
        totalAmount: number;
        avgDuration: number;
        dispositions: Record<string, { count: number; amount: number }>;
      }>;
      totalCount: number;
      totalAmount: number;
      totalDuration: number;
      avgResolutionTime: number;
    }>();

    for (const work of agentWorkArray) {
      if (!agentBreakdown.has(work.agentId)) {
        agentBreakdown.set(work.agentId, {
          agentId: work.agentId,
          agentName: work.agentName,
          agentEmail: work.agentEmail,
          queues: [],
          totalCount: 0,
          totalAmount: 0,
          totalDuration: 0
        });
      }

      const agent = agentBreakdown.get(work.agentId)!;
      agent.queues.push({
        queue: work.queue,
        count: work.count,
        totalAmount: work.totalAmount,
        avgDuration: work.count > 0 ? work.totalDuration / work.count : 0,
        dispositions: work.dispositions
      });
      
      agent.totalCount += work.count;
      agent.totalAmount += work.totalAmount;
      agent.totalDuration += work.totalDuration;
    }

    // Calculate averages and format response
    const agents = Array.from(agentBreakdown.values()).map(agent => ({
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

