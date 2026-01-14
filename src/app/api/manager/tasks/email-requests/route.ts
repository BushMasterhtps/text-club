import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'PENDING';
    const assignedTo = searchParams.get('assignedTo');
    const take = parseInt(searchParams.get('take') || '50');
    const skip = parseInt(searchParams.get('skip') || '0');
    const sortBy = searchParams.get('sortBy') || 'createdAt';
    const sortOrder = searchParams.get('sortOrder') || 'desc';

    // Build where clause
    const where: any = {
      taskType: 'EMAIL_REQUESTS'
    };

    // Handle "assigned_not_started" status (PENDING with assignedToId)
    if (status === 'assigned_not_started') {
      where.status = 'PENDING';
      where.assignedToId = { not: null };  // Must be assigned
    } else if (status === 'pending') {
      // For "pending", only show unassigned tasks
      where.status = 'PENDING';
      where.assignedToId = null;  // Only unassigned
    } else if (status && status !== 'all') {
      where.status = status;
    }

    // If assignedTo is specified and status is not "assigned_not_started" or "pending", apply it
    // (For "assigned_not_started" and "pending", the assignedToId is already set above)
    if (assignedTo && status !== 'assigned_not_started' && status !== 'pending') {
      where.assignedToId = assignedTo;
    }

    // Get tasks with all email request fields
    const tasks = await prisma.task.findMany({
      where,
      select: {
        id: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        assignedToId: true,
        // Email Request specific fields
        email: true,
        text: true,
        emailRequestFor: true,
        details: true,
        salesforceCaseNumber: true,
        customerNameNumber: true,
        salesOrderId: true,
        completionTime: true,
        timestamp: true,
        assignedTo: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        [sortBy]: sortOrder as 'asc' | 'desc',
      },
      take,
      skip,
    });

    // Get total count
    const totalCount = await prisma.task.count({ where });

    return NextResponse.json({
      success: true,
      tasks,
      totalCount,
      hasMore: skip + take < totalCount,
    });

  } catch (error) {
    console.error('Error fetching email request tasks:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch tasks' },
      { status: 500 }
    );
  }
}
