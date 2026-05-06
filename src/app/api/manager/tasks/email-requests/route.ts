import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiAuthDeniedResponse, requireManagerApiAuth } from '@/lib/auth';
import type { TaskStatus } from '@prisma/client';

/** Normalize query status to lowercase semantic keys (matches manager UI + Prisma TaskStatus via map). */
function parseEmailRequestsStatusKey(raw: string | null): string {
  return (raw ?? 'pending').trim().toLowerCase().replace(/\s+/g, '_');
}

export async function GET(request: NextRequest) {
  const auth = await requireManagerApiAuth(request);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);

  try {
    const { searchParams } = new URL(request.url);
    const statusKey = parseEmailRequestsStatusKey(searchParams.get('status'));
    const assignedTo = searchParams.get('assignedTo');
    const take = parseInt(searchParams.get('take') || '50');
    const skip = parseInt(searchParams.get('skip') || '0');
    const sortBy = searchParams.get('sortBy') || 'createdAt';
    const sortOrder = searchParams.get('sortOrder') || 'desc';

    // Build where clause
    const where: {
      taskType: 'EMAIL_REQUESTS';
      status?: TaskStatus;
      assignedToId?: string | null | { not: null };
    } = {
      taskType: 'EMAIL_REQUESTS'
    };

    // Handle "assigned_not_started" status (PENDING with assignedToId)
    if (statusKey === 'assigned_not_started') {
      where.status = 'PENDING';
      if (assignedTo && assignedTo !== 'unassigned') {
        where.assignedToId = assignedTo;
      } else {
        where.assignedToId = { not: null }; // Must be assigned
      }
    } else if (statusKey === 'pending') {
      // For "pending", only show unassigned tasks
      where.status = 'PENDING';
      where.assignedToId = null;  // Only unassigned
    } else if (statusKey === 'all') {
      // no status / assignment constraint from status bucket
    } else {
      const singleStatusMap: Record<string, TaskStatus> = {
        in_progress: 'IN_PROGRESS',
        assistance_required: 'ASSISTANCE_REQUIRED',
        resolved: 'RESOLVED',
        completed: 'COMPLETED',
      };
      const prismaStatus = singleStatusMap[statusKey];
      if (prismaStatus) {
        where.status = prismaStatus;
      }
    }

    // If assignedTo is specified and status is not "assigned_not_started" or "pending", apply it
    // (assigned_not_started + assignee is handled above; pending stays unassigned-only)
    if (assignedTo && statusKey !== 'assigned_not_started' && statusKey !== 'pending') {
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
