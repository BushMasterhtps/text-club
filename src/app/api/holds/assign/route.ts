import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get('agentId');
    const queue = searchParams.get('queue');

    // Build where clause - include both PENDING and COMPLETED (for reassignment)
    const whereClause: any = {
      taskType: 'HOLDS',
      status: { in: ['PENDING', 'COMPLETED'] },
    };

    // Filter by agent if specified (otherwise only unassigned)
    if (agentId) {
      whereClause.assignedToId = agentId;
    } else {
      whereClause.assignedToId = null; // Only show unassigned tasks
    }

    // Filter by queue if specified
    if (queue) {
      whereClause.holdsStatus = queue;
    }

    // Get holds tasks
    const tasks = await prisma.task.findMany({
      where: whereClause,
      include: {
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

    // Calculate aging for each task
    const tasksWithAging = tasks.map(task => {
      const currentDate = new Date();
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
          orderDate,
        },
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        tasks: tasksWithAging,
        total: tasksWithAging.length,
        aging: tasksWithAging.filter(task => task.aging.isAging).length,
        approaching: tasksWithAging.filter(task => task.aging.isApproaching).length,
      },
    });

  } catch (error) {
    console.error('Error fetching holds tasks for assignment:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch holds tasks' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { taskIds, agentId, maxTasks = 200 } = body;

    if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Task IDs array is required' },
        { status: 400 }
      );
    }

    if (!agentId) {
      return NextResponse.json(
        { success: false, error: 'Agent ID is required' },
        { status: 400 }
      );
    }

    // Verify agent exists and has appropriate role
    const agent = await prisma.user.findFirst({
      where: {
        id: agentId,
        role: {
          in: ['AGENT', 'MANAGER_AGENT'],
        },
      },
    });

    if (!agent) {
      return NextResponse.json(
        { success: false, error: 'Agent not found or invalid role' },
        { status: 400 }
      );
    }

    // Check current workload
    const currentWorkload = await prisma.task.count({
      where: {
        assignedToId: agentId,
        taskType: 'HOLDS',
        status: 'PENDING',
      },
    });

    const availableSlots = maxTasks - currentWorkload;
    const tasksToAssign = Math.min(taskIds.length, availableSlots);

    if (tasksToAssign <= 0) {
      return NextResponse.json(
        { 
          success: false, 
          error: `Agent has reached maximum workload (${maxTasks} tasks). Current: ${currentWorkload}` 
        },
        { status: 400 }
      );
    }

    // Assign tasks
    const tasksToUpdate = taskIds.slice(0, tasksToAssign);
    
    // First, check which tasks need to be reassigned (COMPLETED tasks)
    const tasksToReassign = await prisma.task.findMany({
      where: {
        id: { in: tasksToUpdate },
        taskType: 'HOLDS',
        status: 'COMPLETED',
      },
      select: { id: true, holdsStatus: true }
    });
    
    // Set COMPLETED tasks back to PENDING for reassignment
    if (tasksToReassign.length > 0) {
      await prisma.task.updateMany({
        where: {
          id: { in: tasksToReassign.map(t => t.id) },
        },
        data: {
          status: 'PENDING',
        },
      });
    }
    
    // Now assign all tasks (both previously PENDING and newly reassigned)
    const updateResult = await prisma.task.updateMany({
      where: {
        id: { in: tasksToUpdate },
        taskType: 'HOLDS',
        status: 'PENDING',
        assignedToId: null, // Only assign unassigned tasks
      },
      data: {
        assignedToId: agentId,
        updatedAt: new Date(),
      },
    });

    // Get updated tasks for response
    const updatedTasks = await prisma.task.findMany({
      where: {
        id: { in: tasksToUpdate },
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
      message: `Successfully assigned ${updateResult.count} holds tasks to ${agent.name}`,
      data: {
        assigned: updateResult.count,
        requested: taskIds.length,
        available: availableSlots,
        tasks: updatedTasks,
      },
    });

  } catch (error) {
    console.error('Error assigning holds tasks:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to assign tasks' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { taskIds } = body;

    if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Task IDs array is required' },
        { status: 400 }
      );
    }

    // Unassign tasks
    const updateResult = await prisma.task.updateMany({
      where: {
        id: { in: taskIds },
        taskType: 'HOLDS',
      },
      data: {
        assignedToId: null,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      message: `Successfully unassigned ${updateResult.count} holds tasks`,
      data: {
        unassigned: updateResult.count,
        requested: taskIds.length,
      },
    });

  } catch (error) {
    console.error('Error unassigning holds tasks:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to unassign tasks' },
      { status: 500 }
    );
  }
}
