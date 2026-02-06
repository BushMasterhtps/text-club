import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { calculateWorkMetadata } from '@/lib/holds-work-metadata';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get('agentId');
    const queue = searchParams.get('queue');
    const sortBy = searchParams.get('sortBy') || 'neverWorkedFirst'; // Default: never worked first

    // Build where clause - include PENDING, COMPLETED, IN_PROGRESS, and ASSISTANCE_REQUIRED (for reassignment)
    const whereClause: any = {
      taskType: 'HOLDS',
      status: { in: ['PENDING', 'COMPLETED', 'IN_PROGRESS', 'ASSISTANCE_REQUIRED'] },
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

    // Fetch tasks and users in parallel
    const [tasks, allUsers] = await Promise.all([
      prisma.task.findMany({
        where: whereClause,
        include: {
          assignedTo: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          completedByUser: {
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
      }),
      prisma.user.findMany({
        select: {
          id: true,
          name: true,
          email: true,
        },
      }),
    ]);

    // Calculate aging and work metadata for each task
    let tasksWithAging = tasks.map(task => {
      const currentDate = new Date();
      const orderDate = task.holdsOrderDate;
      const daysSinceOrder = orderDate ? Math.floor((currentDate.getTime() - orderDate.getTime()) / (1000 * 60 * 60 * 24)) : 0;
      const isAging = daysSinceOrder >= 4;
      const isApproaching = daysSinceOrder === 3;

      // Calculate work metadata
      const workMetadata = calculateWorkMetadata(task, allUsers);

      return {
        ...task,
        aging: {
          daysSinceOrder,
          isAging,
          isApproaching,
          orderDate,
        },
        workMetadata: {
          ...workMetadata,
          lastWorkedAt: workMetadata.lastWorkedAt?.toISOString() || null, // Convert Date to ISO string
        },
      };
    });

    // Apply sorting
    if (sortBy === 'neverWorkedFirst') {
      // Never worked first, then by order date
      tasksWithAging.sort((a, b) => {
        if (a.workMetadata.hasBeenWorked !== b.workMetadata.hasBeenWorked) {
          return a.workMetadata.hasBeenWorked ? 1 : -1;
        }
        // Same work status, sort by order date (oldest first)
        const aDate = a.holdsOrderDate?.getTime() || 0;
        const bDate = b.holdsOrderDate?.getTime() || 0;
        return aDate - bDate;
      });
    } else if (sortBy === 'oldestFirst') {
      // Sort by order date only (oldest first)
      tasksWithAging.sort((a, b) => {
        const aDate = a.holdsOrderDate?.getTime() || 0;
        const bDate = b.holdsOrderDate?.getTime() || 0;
        return aDate - bDate;
      });
    } else if (sortBy === 'recentlyWorkedLast') {
      // Never worked first, then recently worked last
      tasksWithAging.sort((a, b) => {
        if (!a.workMetadata.hasBeenWorked && b.workMetadata.hasBeenWorked) return -1;
        if (a.workMetadata.hasBeenWorked && !b.workMetadata.hasBeenWorked) return 1;
        if (a.workMetadata.recentlyWorked !== b.workMetadata.recentlyWorked) {
          return a.workMetadata.recentlyWorked ? 1 : -1;
        }
        // Same work status, sort by order date (oldest first)
        const aDate = a.holdsOrderDate?.getTime() || 0;
        const bDate = b.holdsOrderDate?.getTime() || 0;
        return aDate - bDate;
      });
    }

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

    // Check current workload (count PENDING and IN_PROGRESS tasks)
    const currentWorkload = await prisma.task.count({
      where: {
        assignedToId: agentId,
        taskType: 'HOLDS',
        status: { in: ['PENDING', 'IN_PROGRESS'] },
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
    
    // First, check which tasks need status changes before assignment
    // - COMPLETED, ASSISTANCE_REQUIRED, and RESOLVED tasks need to be set back to PENDING
    //   (RESOLVED can occur after manager response; they were excluded and caused "assigned 0 tasks")
    // - IN_PROGRESS tasks can be reassigned directly
    const tasksToReassign = await prisma.task.findMany({
      where: {
        id: { in: tasksToUpdate },
        taskType: 'HOLDS',
        status: { in: ['COMPLETED', 'ASSISTANCE_REQUIRED', 'RESOLVED'] },
      },
      select: { id: true, holdsStatus: true }
    });

    // Set COMPLETED, ASSISTANCE_REQUIRED, and RESOLVED back to PENDING so the assign update matches
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

    // Now assign all tasks - allow reassignment of already-assigned tasks
    // Include RESOLVED so any task that wasn't in the previous batch (e.g. race) can still be assigned
    const updateResult = await prisma.task.updateMany({
      where: {
        id: { in: tasksToUpdate },
        taskType: 'HOLDS',
        status: { in: ['PENDING', 'IN_PROGRESS', 'ASSISTANCE_REQUIRED', 'RESOLVED'] },
      },
      data: {
        assignedToId: agentId,
        status: 'PENDING', // Set to PENDING when assigned (agent must click Start)
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
