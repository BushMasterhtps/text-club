import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Assembly line queue statuses for holds
const HOLDS_QUEUES = [
  'Agent Research',
  'Customer Contact', 
  'Escalated Call 4+ Day',
  'Duplicates',
  'Completed'
] as const;

type HoldsQueue = typeof HOLDS_QUEUES[number];

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const queue = searchParams.get('queue') as HoldsQueue | null;
    const includeAging = searchParams.get('includeAging') === 'true';

    // Get all holds tasks
    const whereClause: any = {
      taskType: 'HOLDS',
    };

    // Filter by specific queue if requested
    if (queue && HOLDS_QUEUES.includes(queue)) {
      whereClause.holdsStatus = queue;
    }

    const tasks = await prisma.task.findMany({
      where: whereClause,
      select: {
        id: true,
        text: true,
        status: true,
        holdsStatus: true,
        holdsOrderNumber: true,
        holdsCustomerEmail: true,
        holdsOrderDate: true,
        holdsPriority: true,
        holdsDaysInSystem: true,
        holdsOrderAmount: true,
        holdsQueueHistory: true,
        createdAt: true,
        updatedAt: true,
        assignedTo: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: [
        // Priority items first (5-day+ items)
        { holdsOrderDate: 'asc' },
        { holdsPriority: 'desc' },
        { createdAt: 'asc' },
      ],
    });

    // Calculate aging and time in queue for each task
    const tasksWithAging = tasks.map(task => {
      const currentDate = new Date();
      const orderDate = task.holdsOrderDate;
      const daysSinceOrder = orderDate ? Math.floor((currentDate.getTime() - orderDate.getTime()) / (1000 * 60 * 60 * 24)) : 0;
      const isAging = daysSinceOrder >= 4; // Changed from 5 to 4
      const isApproaching = daysSinceOrder === 3; // Changed from >= 3 to exactly 3

      // Calculate time in current queue from holdsQueueHistory
      let hoursInQueue = 0;
      if (task.holdsQueueHistory && Array.isArray(task.holdsQueueHistory)) {
        const history = task.holdsQueueHistory as Array<any>;
        // Get the most recent queue entry (current queue)
        const currentQueueEntry = history[history.length - 1];
        if (currentQueueEntry && currentQueueEntry.enteredAt) {
          const enteredAt = new Date(currentQueueEntry.enteredAt);
          const hoursElapsed = (currentDate.getTime() - enteredAt.getTime()) / (1000 * 60 * 60);
          hoursInQueue = Math.floor(hoursElapsed);
        }
      }

      return {
        ...task,
        aging: {
          daysSinceOrder,
          isAging,
          isApproaching,
          orderDate,
        },
        hoursInQueue,
        needsAttention: hoursInQueue >= 48, // Flag if 48+ hours in queue
      };
    });

    // Group by queue status
    const queueStats = HOLDS_QUEUES.reduce((acc, queueName) => {
      const queueTasks = tasksWithAging.filter(task => task.holdsStatus === queueName);
      const approachingTasks = queueTasks.filter(task => task.aging.isApproaching);

      acc[queueName] = {
        total: queueTasks.length,
        approaching: approachingTasks.length,
        tasks: queueTasks,
      };
      return acc;
    }, {} as Record<string, any>);

    // Calculate overall stats
    const totalTasks = tasksWithAging.length;
    const totalApproaching = tasksWithAging.filter(task => task.aging.isApproaching).length;
    const unassignedTasks = tasksWithAging.filter(task => !task.assignedTo).length;

    const response = {
      success: true,
      data: {
        queues: queueStats,
        summary: {
          totalTasks,
          totalApproaching,
          unassignedTasks,
        },
        tasks: includeAging ? tasksWithAging : tasks,
      },
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('Error fetching holds queues:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch holds queues' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { taskId, newStatus, notes } = body;

    if (!taskId || !newStatus) {
      return NextResponse.json(
        { success: false, error: 'Task ID and new status are required' },
        { status: 400 }
      );
    }

    if (!HOLDS_QUEUES.includes(newStatus)) {
      return NextResponse.json(
        { success: false, error: 'Invalid queue status' },
        { status: 400 }
      );
    }

    // Update the task status
    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: {
        holdsStatus: newStatus,
        // Add notes if provided
        ...(notes && { notes: notes }),
        updatedAt: new Date(),
      },
      include: {
        assignedTo: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Task status updated successfully',
      task: updatedTask,
    });

  } catch (error) {
    console.error('Error updating holds task status:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update task status' },
      { status: 500 }
    );
  }
}
