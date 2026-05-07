import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { calculateWorkMetadata } from '@/lib/holds-work-metadata';
import { apiAuthDeniedResponse, requireManagerApiAuth } from '@/lib/auth';
import { logRouteTiming } from '@/lib/route-timing-log';
import { Prisma, TaskType } from '@prisma/client';

// Assembly line queue statuses for holds
const HOLDS_QUEUES = [
  'Agent Research',
  'Customer Contact',
  'Escalated Call 4+ Day',
  'Duplicates',
  'Completed',
] as const;

type HoldsQueue = (typeof HOLDS_QUEUES)[number];

function logHeldQueuesError(route: string, phase: string, error: unknown) {
  const base = {
    route,
    phase,
    timestamp: new Date().toISOString(),
  };
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    console.error(
      '[holds/queues]',
      JSON.stringify({
        ...base,
        prismaCode: error.code,
        message: error.message,
        meta: error.meta,
        stack: error.stack,
      }),
    );
    return;
  }
  if (error instanceof Prisma.PrismaClientValidationError) {
    console.error(
      '[holds/queues]',
      JSON.stringify({
        ...base,
        validationError: true,
        message: error.message,
        stack: error.stack,
      }),
    );
    return;
  }
  if (error instanceof Error) {
    console.error(
      '[holds/queues]',
      JSON.stringify({
        ...base,
        message: error.message,
        stack: error.stack,
        name: error.name,
      }),
    );
    return;
  }
  console.error('[holds/queues]', JSON.stringify({ ...base, error: String(error) }));
}

export async function GET(request: NextRequest) {
  const route = 'GET /api/holds/queues';
  const startedAt = Date.now();
  let rowCount = 0;
  let userEmail: string | null = null;
  const auth = await requireManagerApiAuth(request);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);
  userEmail = auth.userEmail;

  try {
    const { searchParams } = new URL(request.url);
    const queue = searchParams.get('queue') as HoldsQueue | null;
    const includeAging = searchParams.get('includeAging') === 'true';
    const sortBy = searchParams.get('sortBy') || 'neverWorkedFirst';
    const filter = searchParams.get('filter');
    const debug = searchParams.get('debug') === '1';

    // Minimal diagnostics (still requires manager JWT). Helps isolate Prisma vs transforms.
    if (debug) {
      const whereDbg = { taskType: TaskType.HOLDS } as const;
      const selectFields = ['where', JSON.stringify(whereDbg), 'findMany take 5', 'minimal select id, taskType, holdsStatus'].join(
        ' | ',
      );
      console.info('[holds/queues]', JSON.stringify({ route, phase: 'debug-minimal-query', query: selectFields }));
      try {
        const minimalTasks = await prisma.task.findMany({
          where: whereDbg,
          take: 5,
          select: { id: true, taskType: true, holdsStatus: true },
        });
        console.info('[holds/queues]', JSON.stringify({ route, phase: 'debug-minimal-success', rowCount: minimalTasks.length }));
        return NextResponse.json({ success: true, debug: true, tasks: minimalTasks });
      } catch (dbgErr) {
        logHeldQueuesError(route, 'debug-minimal-query', dbgErr);
        throw dbgErr;
      }
    }

    const whereClause = {
      taskType: TaskType.HOLDS,
      ...(queue && HOLDS_QUEUES.includes(queue) ? { holdsStatus: queue } : {}),
    };

    const selectShape = {
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
      completedBy: true,
      completedAt: true,
      createdAt: true,
      updatedAt: true,
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
    } as const;

    console.info(
      '[holds/queues]',
      JSON.stringify({
        route,
        phase: 'prisma-findMany:start',
        where: whereClause,
        taskTypeEnum: TaskType.HOLDS,
        selectShapeKeys: Object.keys(selectShape),
        sortBy,
        filter: filter ?? null,
        queue: queue ?? null,
      }),
    );

    let tasks:
      | Awaited<
          ReturnType<
            typeof prisma.task.findMany
          >
        >
      | undefined;

    let allUsers: Awaited<ReturnType<typeof prisma.user.findMany>> | undefined;

    try {
      const paired = await Promise.all([
        prisma.task.findMany({
          where: whereClause,
          select: selectShape,
          orderBy: [{ holdsOrderDate: 'asc' }, { holdsPriority: 'desc' }, { createdAt: 'asc' }],
        }),
        prisma.user.findMany({
          select: {
            id: true,
            name: true,
            email: true,
          },
        }),
      ]);
      tasks = paired[0];
      allUsers = paired[1];
      rowCount = tasks.length;
      console.info(
        '[holds/queues]',
        JSON.stringify({
          route,
          phase: 'prisma-findMany:success',
          rowCount,
        }),
      );
    } catch (prismaErr) {
      logHeldQueuesError(route, 'prisma-findMany', prismaErr);
      throw prismaErr;
    }

    if (!tasks || !allUsers) {
      throw new Error('Invariant: tasks or allUsers unset after parallel fetch');
    }

    let tasksWithMetadata = tasks.map((task) => {
      const currentDate = new Date();
      const orderDate = task.holdsOrderDate;
      const daysSinceOrder = orderDate
        ? Math.floor((currentDate.getTime() - orderDate.getTime()) / (1000 * 60 * 60 * 24))
        : 0;
      const isAging = daysSinceOrder >= 4;
      const isApproaching = daysSinceOrder === 3;

      let hoursInQueue = 0;
      if (task.holdsQueueHistory && Array.isArray(task.holdsQueueHistory)) {
        const history = task.holdsQueueHistory as Array<{ enteredAt?: string }>;
        const currentQueueEntry = history[history.length - 1];
        if (currentQueueEntry?.enteredAt) {
          const enteredAt = new Date(currentQueueEntry.enteredAt);
          const hoursElapsed = (currentDate.getTime() - enteredAt.getTime()) / (1000 * 60 * 60);
          hoursInQueue = Math.floor(hoursElapsed);
        }
      }

      const workMetadata = calculateWorkMetadata(task, allUsers);

      return {
        ...task,
        aging: {
          daysSinceOrder,
          isAging,
          isApproaching,
          orderDate,
        },
        hoursInQueue,
        needsAttention: hoursInQueue >= 48,
        holdsOrderAmount: task.holdsOrderAmount ? Number(task.holdsOrderAmount) : null,
        workMetadata: {
          ...workMetadata,
          lastWorkedAt: workMetadata.lastWorkedAt?.toISOString() || null,
        },
      };
    });

    if (filter === 'neverWorked') {
      tasksWithMetadata = tasksWithMetadata.filter((task) => !task.workMetadata.hasBeenWorked);
    } else if (filter === 'reworked') {
      tasksWithMetadata = tasksWithMetadata.filter((task) => task.workMetadata.isRework);
    } else if (filter === 'workedToday') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      tasksWithMetadata = tasksWithMetadata.filter(
        (task) =>
          task.workMetadata.lastWorkedAt && new Date(task.workMetadata.lastWorkedAt) >= today,
      );
    }

    if (sortBy === 'neverWorkedFirst') {
      tasksWithMetadata.sort((a, b) => {
        if (a.workMetadata.hasBeenWorked !== b.workMetadata.hasBeenWorked) {
          return a.workMetadata.hasBeenWorked ? 1 : -1;
        }
        const aDate = a.holdsOrderDate?.getTime() || 0;
        const bDate = b.holdsOrderDate?.getTime() || 0;
        return aDate - bDate;
      });
    } else if (sortBy === 'oldestFirst') {
      tasksWithMetadata.sort((a, b) => {
        const aDate = a.holdsOrderDate?.getTime() || 0;
        const bDate = b.holdsOrderDate?.getTime() || 0;
        return aDate - bDate;
      });
    } else if (sortBy === 'recentlyWorkedLast') {
      tasksWithMetadata.sort((a, b) => {
        if (!a.workMetadata.hasBeenWorked && b.workMetadata.hasBeenWorked) return -1;
        if (a.workMetadata.hasBeenWorked && !b.workMetadata.hasBeenWorked) return 1;
        if (a.workMetadata.recentlyWorked !== b.workMetadata.recentlyWorked) {
          return a.workMetadata.recentlyWorked ? 1 : -1;
        }
        const aDate = a.holdsOrderDate?.getTime() || 0;
        const bDate = b.holdsOrderDate?.getTime() || 0;
        return aDate - bDate;
      });
    }

    const tasksWithAging = tasksWithMetadata;
    rowCount = tasksWithAging.length;

    const queueStats = HOLDS_QUEUES.reduce((acc, queueName) => {
      const queueTasks = tasksWithAging.filter((task) => task.holdsStatus === queueName);
      const approachingTasks = queueTasks.filter((task) => task.aging.isApproaching);

      acc[queueName] = {
        total: queueTasks.length,
        approaching: approachingTasks.length,
        tasks: queueTasks,
      };
      return acc;
    }, {} as Record<string, Record<string, unknown>>);

    const totalTasks = tasksWithAging.length;
    const totalApproaching = tasksWithAging.filter((task) => task.aging.isApproaching).length;
    const unassignedTasks = tasksWithAging.filter((task) => !task.assignedTo).length;

    /** Never attach raw Prisma rows here: Decimal (e.g. holdsOrderAmount) breaks JSON serialization. */
    const tasksPayload = includeAging
      ? tasksWithAging
      : tasksWithAging.map(
          ({
            aging: _omitAging,
            hoursInQueue: _omitHours,
            needsAttention: _omitNeed,
            workMetadata: _omitWm,
            ...slimFields
          }) => slimFields,
        );

    const response = {
      success: true,
      data: {
        queues: queueStats,
        summary: {
          totalTasks,
          totalApproaching,
          unassignedTasks,
        },
        tasks: tasksPayload,
      },
    };

    try {
      return NextResponse.json(response);
    } catch (serializationErr) {
      logHeldQueuesError(route, 'NextResponse.json', serializationErr);
      throw serializationErr;
    }
  } catch (error) {
    logHeldQueuesError(route, 'GET catch', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch holds queues' },
      { status: 500 },
    );
  } finally {
    logRouteTiming({
      route,
      durationMs: Date.now() - startedAt,
      rowCount,
      email: userEmail,
    });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { taskId, newStatus, notes } = body;

    if (!taskId || !newStatus) {
      return NextResponse.json(
        { success: false, error: 'Task ID and new status are required' },
        { status: 400 },
      );
    }

    if (!HOLDS_QUEUES.includes(newStatus)) {
      return NextResponse.json(
        { success: false, error: 'Invalid queue status' },
        { status: 400 },
      );
    }

    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: {
        holdsStatus: newStatus,
        ...(notes != null && notes !== ''
          ? { holdsNotes: typeof notes === 'string' ? notes : String(notes) }
          : {}),
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
      { status: 500 },
    );
  }
}
