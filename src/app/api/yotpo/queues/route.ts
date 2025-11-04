import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * Yotpo Queues API
 * Returns pending Yotpo tasks for manager assignment
 */

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const statusFilter = url.searchParams.get('status') || 'all';
    const assignedFilter = url.searchParams.get('assigned') || 'all';
    const searchQuery = url.searchParams.get('search') || '';

    // Build where clause
    const where: any = {
      taskType: 'YOTPO'
    };

    // Status filter
    if (statusFilter && statusFilter !== 'all') {
      where.status = statusFilter.toUpperCase();
    }

    // Assigned filter
    if (assignedFilter === 'unassigned') {
      where.assignedToId = null;
    } else if (assignedFilter === 'assigned') {
      where.assignedToId = { not: null };
    }

    // Search filter (email, customer name, or SF case number)
    if (searchQuery) {
      where.OR = [
        { yotpoEmail: { contains: searchQuery, mode: 'insensitive' } },
        { yotpoCustomerName: { contains: searchQuery, mode: 'insensitive' } },
        { yotpoSfOrderLink: { contains: searchQuery, mode: 'insensitive' } },
        { yotpoProduct: { contains: searchQuery, mode: 'insensitive' } },
        { yotpoIssueTopic: { contains: searchQuery, mode: 'insensitive' } }
      ];
    }

    // Fetch tasks
    const tasks = await prisma.task.findMany({
      where,
      include: {
        assignedTo: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: [
        { yotpoDateSubmitted: 'asc' }, // Oldest to newest by Date Submitted
        { createdAt: 'asc' }           // Fallback to creation date
      ]
    });

    return NextResponse.json({
      success: true,
      tasks: tasks.map(task => ({
        id: task.id,
        status: task.status,
        
        // All 10 Yotpo columns
        dateSubmitted: task.yotpoDateSubmitted?.toISOString() || null,
        prOrYotpo: task.yotpoPrOrYotpo,
        customerName: task.yotpoCustomerName,
        email: task.yotpoEmail,
        orderDate: task.yotpoOrderDate?.toISOString() || null,
        product: task.yotpoProduct,
        issueTopic: task.yotpoIssueTopic,
        reviewDate: task.yotpoReviewDate?.toISOString() || null,
        review: task.yotpoReview,
        sfOrderLink: task.yotpoSfOrderLink,
        
        // Assignment info
        assignedTo: task.assignedTo ? {
          id: task.assignedTo.id,
          name: task.assignedTo.name || task.assignedTo.email,
          email: task.assignedTo.email
        } : null,
        
        // Metadata
        createdAt: task.createdAt.toISOString(),
        updatedAt: task.updatedAt.toISOString()
      }))
    });

  } catch (error) {
    console.error('Yotpo queues API error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to load Yotpo tasks'
    }, { status: 500 });
  }
}

