import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { TaskType } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { apiAuthDeniedResponse, requireManagerApiAuth } from '@/lib/auth';
import { logRouteTiming } from '@/lib/route-timing-log';
import {
  HOLDS_ACTIONABLE_QUEUES,
  HOLDS_DUPLICATE_EXCEPTION_QUEUE,
  holdsOpenWorkflowQueuesWhere,
  holdsOrderAgeDays,
  isHoldsActionableQueue,
  isOrderAgeAging5Plus,
  isOrderAgeApproaching3To4,
  isOrderAgeFresh0To2,
} from '@/lib/holds-analytics-definitions';

type AgentPerformanceAccumulator = {
  agentId: string;
  agentName: string;
  total: number;
  completed: number;
  pending: number;
  aging: number;
  averageCompletionTime: number;
  completionRate: number;
};

type QueueStatBucket = {
  total: number;
  assigned: number;
  unassigned: number;
  aging: number;
  approaching: number;
};

type AgingTaskRow = {
  id: string;
  orderNumber: string | null;
  customerName: string;
  customerEmail: string | null;
  orderDate: Date | null;
  daysSinceOrder: number | null;
  isAging5Plus: boolean;
  isApproaching3To4: boolean;
  holdsStatus: string | null;
  assignedTo: { id: string; name: string } | null;
  createdAt: Date;
};

function buildCreatedAtRangeFilter(
  startDate: string | null,
  endDate: string | null,
): Prisma.DateTimeFilter | undefined {
  const range: Prisma.DateTimeFilter = {};
  if (startDate) {
    range.gte = new Date(startDate);
  }
  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    range.lte = end;
  }
  return Object.keys(range).length > 0 ? range : undefined;
}

async function loadQueueHealthAnalytics(): Promise<{
  overview: {
    actionableOpenHoldsTasks: number;
    duplicateExceptions: number;
    agingTasks: number;
    approachingTasks: number;
    unassignedTasks: number;
  };
  queueStats: Record<string, number>;
  agingBreakdown: {
    '0-2 days': number;
    '3-4 days': number;
    '5+ days': number;
  };
  agingTaskRows: AgingTaskRow[];
  approachingTaskRows: AgingTaskRow[];
  allActionableRows: AgingTaskRow[];
}> {
  const currentDate = new Date();

  const tasks = await prisma.task.findMany({
    where: holdsOpenWorkflowQueuesWhere(),
    include: {
      assignedTo: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: [{ holdsOrderDate: 'asc' }, { holdsPriority: 'desc' }],
  });

  const actionableTasks = tasks.filter((t) => isHoldsActionableQueue(t.holdsStatus));
  const duplicateExceptions = tasks.filter((t) => t.holdsStatus === HOLDS_DUPLICATE_EXCEPTION_QUEUE).length;

  const tasksWithAging = actionableTasks.map((task) => {
    const days = holdsOrderAgeDays(task.holdsOrderDate, currentDate);
    return {
      ...task,
      aging: {
        daysSinceOrder: days,
        isAging5Plus: isOrderAgeAging5Plus(days),
        isApproaching3To4: isOrderAgeApproaching3To4(days),
        isFresh0To2: isOrderAgeFresh0To2(days),
      },
    };
  });

  const toRow = (task: (typeof tasksWithAging)[number]): AgingTaskRow => ({
    id: task.id,
    orderNumber: task.holdsOrderNumber,
    customerName: task.text?.replace('Holds - ', '') || 'Unknown',
    customerEmail: task.holdsCustomerEmail,
    orderDate: task.holdsOrderDate,
    daysSinceOrder: task.aging.daysSinceOrder,
    isAging5Plus: task.aging.isAging5Plus,
    isApproaching3To4: task.aging.isApproaching3To4,
    holdsStatus: task.holdsStatus,
    assignedTo: task.assignedTo,
    createdAt: task.createdAt,
  });

  const rows = tasksWithAging.map(toRow);

  const queueStats = Object.fromEntries(
    HOLDS_ACTIONABLE_QUEUES.map((q) => [q, tasksWithAging.filter((t) => t.holdsStatus === q).length]),
  ) as Record<string, number>;

  return {
    overview: {
      actionableOpenHoldsTasks: tasksWithAging.length,
      duplicateExceptions,
      agingTasks: tasksWithAging.filter((t) => t.aging.isAging5Plus).length,
      approachingTasks: tasksWithAging.filter((t) => t.aging.isApproaching3To4).length,
      unassignedTasks: tasksWithAging.filter((t) => !t.assignedTo).length,
    },
    queueStats,
    agingBreakdown: {
      '0-2 days': tasksWithAging.filter((t) => t.aging.isFresh0To2).length,
      '3-4 days': tasksWithAging.filter((t) => t.aging.isApproaching3To4).length,
      '5+ days': tasksWithAging.filter((t) => t.aging.isAging5Plus).length,
    },
    agingTaskRows: rows.filter((r) => r.isAging5Plus),
    approachingTaskRows: rows.filter((r) => r.isApproaching3To4),
    allActionableRows: rows,
  };
}

export async function GET(request: NextRequest) {
  const route = 'GET /api/holds/analytics';
  const startedAt = Date.now();
  let userEmail: string | null = null;
  let analyticsType: string | null = null;
  const auth = await requireManagerApiAuth(request);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);
  userEmail = auth.userEmail;

  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'overview';
    analyticsType = type;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    const createdAtRange = buildCreatedAtRangeFilter(startDate, endDate);

    switch (type) {
      case 'overview':
        return await getOverviewAnalytics();

      case 'aging':
        return await getAgingReport();

      case 'agent-performance':
        return await getAgentPerformance(createdAtRange);

      case 'queue-stats':
        return await getQueueStats();

      default:
        return NextResponse.json(
          { success: false, error: 'Invalid analytics type' },
          { status: 400 }
        );
    }

  } catch (error) {
    console.error('Error fetching holds analytics:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch analytics' },
      { status: 500 }
    );
  } finally {
    logRouteTiming({
      route,
      durationMs: Date.now() - startedAt,
      email: userEmail,
      extra:
        analyticsType != null
          ? { type: analyticsType }
          : undefined,
    });
  }
}

async function getOverviewAnalytics() {
  const payload = await loadQueueHealthAnalytics();

  return NextResponse.json({
    success: true,
    data: {
      overview: payload.overview,
      queueStats: payload.queueStats,
      agingBreakdown: payload.agingBreakdown,
      agingTasks: payload.agingTaskRows,
      approachingTasks: payload.approachingTaskRows,
    },
  });
}

async function getAgingReport() {
  const payload = await loadQueueHealthAnalytics();

  return NextResponse.json({
    success: true,
    data: {
      agingTasks: payload.agingTaskRows,
      approachingTasks: payload.approachingTaskRows,
      allTasks: payload.allActionableRows,
      summary: {
        totalActive: payload.overview.actionableOpenHoldsTasks,
        aging: payload.overview.agingTasks,
        approaching: payload.overview.approachingTasks,
        unassigned: payload.overview.unassignedTasks,
      },
    },
  });
}

async function getAgentPerformance(createdAtRange?: Prisma.DateTimeFilter) {
  let whereCondition: Prisma.TaskWhereInput = { taskType: TaskType.HOLDS };

  if (createdAtRange) {
    whereCondition = {
      AND: [
        { taskType: TaskType.HOLDS },
        {
          OR: [
            { status: 'COMPLETED', endTime: createdAtRange },
            {
              AND: [{ status: { not: 'COMPLETED' } }, { createdAt: createdAtRange }],
            },
          ],
        },
      ],
    };
  }

  const tasks = await prisma.task.findMany({
    where: whereCondition,
    include: {
      assignedTo: {
        select: {
          id: true,
          name: true,
        },
      },
      completedByUser: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  // Group by agent (consider both assignedTo and completedBy for completed tasks)
  const agentStats = tasks.reduce<Record<string, AgentPerformanceAccumulator>>((acc, task) => {
    // For completed tasks, use completedBy if available (for unassigned completions)
    // Otherwise use assignedTo
    const agentId = (task.status === 'COMPLETED' && task.completedBy && task.completedByUser) 
      ? task.completedByUser.id 
      : (task.assignedTo?.id || 'unassigned');
    const agentName = (task.status === 'COMPLETED' && task.completedBy && task.completedByUser)
      ? task.completedByUser.name
      : (task.assignedTo?.name || 'Unassigned');
    
    if (!acc[agentId]) {
      acc[agentId] = {
        agentId,
        agentName,
        total: 0,
        completed: 0,
        pending: 0,
        aging: 0,
        averageCompletionTime: 0,
        completionRate: 0,
      };
    }
    
    acc[agentId].total++;
    
    if (task.status === 'COMPLETED') {
      acc[agentId].completed++;
    } else {
      acc[agentId].pending++;
    }
    
    // Check if aging
    if (task.holdsOrderDate) {
      const daysSinceOrder = Math.floor((new Date().getTime() - task.holdsOrderDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysSinceOrder >= 5) {
        acc[agentId].aging++;
      }
    }
    
    return acc;
  }, {});

  // Calculate completion rates
  const agentList = Object.values(agentStats);
  for (const agent of agentList) {
    agent.completionRate = agent.total > 0 ? (agent.completed / agent.total) * 100 : 0;
  }

  return NextResponse.json({
    success: true,
    data: {
      agents: agentList,
      summary: {
        totalAgents: Object.keys(agentStats).length,
        totalTasks: tasks.length,
        averageCompletionRate:
          agentList.length > 0
            ? agentList.reduce((sum, agent) => sum + agent.completionRate, 0) / agentList.length
            : 0,
      },
    },
  });
}

async function getQueueStats() {
  const tasks = await prisma.task.findMany({
    where: holdsOpenWorkflowQueuesWhere(),
    include: {
      assignedTo: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  const currentDate = new Date();
  
  // Calculate queue statistics
  const queueStats = tasks.reduce<Record<string, QueueStatBucket>>((acc, task) => {
    const status = task.holdsStatus || 'Unknown';
    
    if (!acc[status]) {
      acc[status] = {
        total: 0,
        assigned: 0,
        unassigned: 0,
        aging: 0,
        approaching: 0,
      };
    }
    
    acc[status].total++;
    
    if (task.assignedTo) {
      acc[status].assigned++;
    } else {
      acc[status].unassigned++;
    }
    
    const days = holdsOrderAgeDays(task.holdsOrderDate, currentDate);
    if (isOrderAgeAging5Plus(days)) {
      acc[status].aging++;
    } else if (isOrderAgeApproaching3To4(days)) {
      acc[status].approaching++;
    }
    
    return acc;
  }, {});

  return NextResponse.json({
    success: true,
    data: {
      queues: queueStats,
      summary: {
        totalQueues: Object.keys(queueStats).length,
        totalTasks: tasks.length,
        totalAssigned: tasks.filter(task => task.assignedTo).length,
        totalUnassigned: tasks.filter(task => !task.assignedTo).length,
      },
    },
  });
}
