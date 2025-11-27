import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'overview';
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // Build date filter - use endTime for completed tasks, createdAt for others
    const dateFilter: any = {};
    if (startDate) {
      dateFilter.gte = new Date(startDate);
    }
    if (endDate) {
      // Add end of day time (23:59:59.999) to include the full day
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      dateFilter.lte = end;
    }

    const whereClause: any = {
      taskType: 'HOLDS',
    };

    // Store date filter separately to be used appropriately in each function
    // For completed tasks, we'll filter by endTime; for others, by createdAt
    if (Object.keys(dateFilter).length > 0) {
      whereClause.dateFilter = dateFilter;
      // For non-completed tasks, still use createdAt
      whereClause.createdAt = dateFilter;
    }

    switch (type) {
      case 'overview':
        return await getOverviewAnalytics(whereClause);
      
      case 'aging':
        return await getAgingReport(whereClause);
      
      case 'agent-performance':
        return await getAgentPerformance(whereClause);
      
      case 'queue-stats':
        return await getQueueStats(whereClause);
      
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
  }
}

async function getOverviewAnalytics(whereClause: any) {
  const currentDate = new Date();
  
  // Get all holds tasks
  const tasks = await prisma.task.findMany({
    where: whereClause,
    include: {
      assignedTo: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  // Calculate aging metrics
  const tasksWithAging = tasks.map(task => {
    const orderDate = task.holdsOrderDate;
    const daysSinceOrder = orderDate ? Math.floor((currentDate.getTime() - orderDate.getTime()) / (1000 * 60 * 60 * 24)) : 0;
    const isAging = daysSinceOrder >= 5;
    const isApproaching = daysSinceOrder >= 3;

    return {
      ...task,
      aging: {
        daysSinceOrder,
        isAging,
        isApproaching,
      },
    };
  });

  // Calculate statistics
  const totalTasks = tasksWithAging.length;
  const agingTasks = tasksWithAging.filter(task => task.aging.isAging).length;
  const approachingTasks = tasksWithAging.filter(task => task.aging.isApproaching).length;
  const unassignedTasks = tasksWithAging.filter(task => !task.assignedTo).length;
  const completedTasks = tasksWithAging.filter(task => task.status === 'COMPLETED').length;
  const pendingTasks = tasksWithAging.filter(task => task.status === 'PENDING').length;

  // Queue distribution
  const queueStats = tasksWithAging.reduce((acc, task) => {
    const status = task.holdsStatus || 'Unknown';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Priority distribution
  const priorityStats = tasksWithAging.reduce((acc, task) => {
    const priority = task.holdsPriority || 4;
    acc[priority] = (acc[priority] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);

  return NextResponse.json({
    success: true,
    data: {
      overview: {
        totalTasks,
        agingTasks,
        approachingTasks,
        unassignedTasks,
        completedTasks,
        pendingTasks,
        completionRate: totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0,
      },
      queueStats,
      priorityStats,
      agingBreakdown: {
        '0-2 days': tasksWithAging.filter(task => task.aging.daysSinceOrder <= 2).length,
        '3-4 days': tasksWithAging.filter(task => task.aging.daysSinceOrder >= 3 && task.aging.daysSinceOrder <= 4).length,
        '5+ days': agingTasks,
      },
    },
  });
}

async function getAgingReport(whereClause: any) {
  const currentDate = new Date();
  
  const tasks = await prisma.task.findMany({
    where: {
      ...whereClause,
      status: 'PENDING', // Only pending tasks for aging report
    },
    include: {
      assignedTo: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: [
      { holdsOrderDate: 'asc' },
      { holdsPriority: 'desc' },
    ],
  });

  const agingTasks = tasks.map(task => {
    const orderDate = task.holdsOrderDate;
    const daysSinceOrder = orderDate ? Math.floor((currentDate.getTime() - orderDate.getTime()) / (1000 * 60 * 60 * 24)) : 0;
    const isAging = daysSinceOrder >= 5;
    const isApproaching = daysSinceOrder >= 3;

    return {
      id: task.id,
      orderNumber: task.holdsOrderNumber,
      customerName: task.text?.replace('Holds - ', '') || 'Unknown',
      customerEmail: task.holdsCustomerEmail,
      orderDate,
      daysSinceOrder,
      isAging,
      isApproaching,
      priority: task.holdsPriority,
      status: task.holdsStatus,
      assignedTo: task.assignedTo,
      createdAt: task.createdAt,
    };
  });

  return NextResponse.json({
    success: true,
    data: {
      agingTasks: agingTasks.filter(task => task.isAging),
      approachingTasks: agingTasks.filter(task => task.isApproaching && !task.isAging),
      allTasks: agingTasks,
      summary: {
        total: agingTasks.length,
        aging: agingTasks.filter(task => task.isAging).length,
        approaching: agingTasks.filter(task => task.isApproaching && !task.isAging).length,
        unassigned: agingTasks.filter(task => !task.assignedTo).length,
      },
    },
  });
}

async function getAgentPerformance(whereClause: any) {
  // Extract date filter if present
  const dateFilter = whereClause.dateFilter;
  const baseWhere: any = {
    taskType: 'HOLDS',
  };

  // Build query: For completed tasks, filter by endTime; for others, filter by createdAt
  let whereCondition: any = baseWhere;
  
  if (dateFilter) {
    // If date filter exists, use OR to handle both completed (endTime) and non-completed (createdAt)
    whereCondition = {
      ...baseWhere,
      OR: [
        // Completed tasks: filter by endTime (includes completedBy tasks)
        {
          status: 'COMPLETED',
          endTime: dateFilter,
        },
        // Non-completed tasks: filter by createdAt
        {
          status: { not: 'COMPLETED' },
          createdAt: dateFilter,
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
  const agentStats = tasks.reduce((acc, task) => {
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
  }, {} as Record<string, any>);

  // Calculate completion rates
  Object.values(agentStats).forEach((agent: any) => {
    agent.completionRate = agent.total > 0 ? (agent.completed / agent.total) * 100 : 0;
  });

  return NextResponse.json({
    success: true,
    data: {
      agents: Object.values(agentStats),
      summary: {
        totalAgents: Object.keys(agentStats).length,
        totalTasks: tasks.length,
        averageCompletionRate: tasks.length > 0 ? 
          Object.values(agentStats).reduce((sum: number, agent: any) => sum + agent.completionRate, 0) / Object.keys(agentStats).length : 0,
      },
    },
  });
}

async function getQueueStats(whereClause: any) {
  const tasks = await prisma.task.findMany({
    where: whereClause,
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
  const queueStats = tasks.reduce((acc, task) => {
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
    
    // Check aging
    if (task.holdsOrderDate) {
      const daysSinceOrder = Math.floor((currentDate.getTime() - task.holdsOrderDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysSinceOrder >= 5) {
        acc[status].aging++;
      } else if (daysSinceOrder >= 3) {
        acc[status].approaching++;
      }
    }
    
    return acc;
  }, {} as Record<string, any>);

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
