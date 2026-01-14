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

    // OPTIMIZED: Get all workloads with breakdown (assigned-not-started vs in-progress)
    // We need separate queries for PENDING (assigned-not-started) and IN_PROGRESS
    const pendingTaskCounts = await prisma.task.groupBy({
      by: ['assignedToId', 'taskType'],
      where: {
        assignedToId: { not: null },
        status: 'PENDING'  // Assigned but not started
      },
      _count: {
        id: true
      }
    });

    const inProgressTaskCounts = await prisma.task.groupBy({
      by: ['assignedToId', 'taskType'],
      where: {
        assignedToId: { not: null },
        status: {
          in: ['IN_PROGRESS', 'ASSISTANCE_REQUIRED', 'RESOLVED']  // Actively being worked
        }
      },
      _count: {
        id: true
      }
    });

    // Build maps of agent task counts for fast lookup (separate for assigned-not-started and in-progress)
    const assignedNotStartedMap = new Map<string, Map<string, number>>();
    const inProgressMap = new Map<string, Map<string, number>>();
    
    for (const group of pendingTaskCounts) {
      if (!group.assignedToId) continue;
      
      if (!assignedNotStartedMap.has(group.assignedToId)) {
        assignedNotStartedMap.set(group.assignedToId, new Map());
      }
      
      const agentMap = assignedNotStartedMap.get(group.assignedToId)!;
      agentMap.set(group.taskType, group._count.id);
    }

    for (const group of inProgressTaskCounts) {
      if (!group.assignedToId) continue;
      
      if (!inProgressMap.has(group.assignedToId)) {
        inProgressMap.set(group.assignedToId, new Map());
      }
      
      const agentMap = inProgressMap.get(group.assignedToId)!;
      agentMap.set(group.taskType, group._count.id);
    }

    // Map agents with their workload breakdowns (assigned-not-started vs in-progress)
    const workloadData = agents.map((agent) => {
      const assignedNotStartedCounts = assignedNotStartedMap.get(agent.id);
      const inProgressCounts = inProgressMap.get(agent.id);

      // Helper function to get breakdown for a task type
      const getBreakdown = (taskType: string) => {
        const assignedNotStarted = assignedNotStartedCounts?.get(taskType) ?? 0;
        const inProgress = inProgressCounts?.get(taskType) ?? 0;
        return {
          assignedNotStarted,
          inProgress,
          total: assignedNotStarted + inProgress
        };
      };

      const wodIvcs = getBreakdown('WOD_IVCS');
      const textClub = getBreakdown('TEXT_CLUB');
      const emailRequests = getBreakdown('EMAIL_REQUESTS');
      const standaloneRefunds = getBreakdown('STANDALONE_REFUNDS');
      const yotpo = getBreakdown('YOTPO');
      const holds = getBreakdown('HOLDS');
      
      const total = wodIvcs.total + textClub.total + emailRequests.total + standaloneRefunds.total + yotpo.total + holds.total;

      return {
        agentId: agent.id,
        agentName: agent.name,
        agentEmail: agent.email,
        workload: {
          wodIvcs: wodIvcs.total,
          textClub: textClub.total,
          emailRequests: emailRequests.total,
          standaloneRefunds: standaloneRefunds.total,
          yotpo: yotpo.total,
          holds: holds.total,
          total,
          // Detailed breakdown for UI display
          breakdown: {
            wodIvcs,
            textClub,
            emailRequests,
            standaloneRefunds,
            yotpo,
            holds,
          },
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
