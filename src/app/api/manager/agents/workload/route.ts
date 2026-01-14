import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    // Get all agents
    const agents = await prisma.user.findMany({
      where: {
        role: { in: ['AGENT', 'MANAGER_AGENT'] },
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
    });

    // OPTIMIZED: Get all workloads in a single query using groupBy
    // Count tasks that are in agent inbox (PENDING assigned) OR actively being worked (IN_PROGRESS)
    // Exclude COMPLETED tasks
    const taskCounts = await prisma.task.groupBy({
      by: ['assignedToId', 'taskType'],
      where: {
        assignedToId: { not: null },
        status: {
          in: ['PENDING', 'IN_PROGRESS', 'ASSISTANCE_REQUIRED', 'RESOLVED']  // All active work (inbox + in progress)
        }
      },
      _count: {
        id: true
      }
    });

    // Build a map of agent task counts for fast lookup
    const taskCountMap = new Map<string, Map<string, number>>();
    
    for (const group of taskCounts) {
      if (!group.assignedToId) continue;
      
      if (!taskCountMap.has(group.assignedToId)) {
        taskCountMap.set(group.assignedToId, new Map());
      }
      
      const agentMap = taskCountMap.get(group.assignedToId)!;
      agentMap.set(group.taskType, group._count.id);
    }

    // Map agents with their workload breakdowns
    const workloadData = agents.map((agent) => {
      const agentCounts = taskCountMap.get(agent.id);
      
      const wodIvcsCount = agentCounts?.get('WOD_IVCS') ?? 0;
      const textClubCount = agentCounts?.get('TEXT_CLUB') ?? 0;
      const emailRequestsCount = agentCounts?.get('EMAIL_REQUESTS') ?? 0;
      const standaloneRefundsCount = agentCounts?.get('STANDALONE_REFUNDS') ?? 0;
      const yotpoCount = agentCounts?.get('YOTPO') ?? 0;
      const holdsCount = agentCounts?.get('HOLDS') ?? 0;
      
      const total = wodIvcsCount + textClubCount + emailRequestsCount + standaloneRefundsCount + yotpoCount + holdsCount;

      return {
        agentId: agent.id,
        agentName: agent.name,
        agentEmail: agent.email,
        workload: {
          wodIvcs: wodIvcsCount,
          textClub: textClubCount,
          emailRequests: emailRequestsCount,
          standaloneRefunds: standaloneRefundsCount,
          yotpo: yotpoCount,
          holds: holdsCount,
          total,
        },
      };
    });

    return NextResponse.json({
      success: true,
      data: workloadData,
    });
  } catch (error) {
    console.error('Error fetching agent workload:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch agent workload',
    }, { status: 500 });
  }
}
