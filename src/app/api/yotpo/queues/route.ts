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
    const assignedToId = url.searchParams.get('assignedTo'); // Specific agent ID
    const searchQuery = url.searchParams.get('search') || '';
    
    // Pagination
    const take = parseInt(url.searchParams.get('take') || '1000', 10);
    const skip = parseInt(url.searchParams.get('skip') || '0', 10);
    
    // Sorting
    const sortBy = url.searchParams.get('sortBy') || 'dateSubmitted';
    const sortOrder = url.searchParams.get('sortOrder') || 'asc';

    // Build where clause
    const where: any = {
      taskType: 'YOTPO'
    };

    // Status filter - handle "assigned_not_started" specially
    if (statusFilter === 'assigned_not_started') {
      // For "assigned_not_started", show PENDING tasks that are assigned
      where.status = 'PENDING';
      where.assignedToId = { not: null };  // Must be assigned
    } else if (statusFilter === 'pending') {
      // For "pending", only show unassigned tasks
      where.status = 'PENDING';
      where.assignedToId = null;  // Only unassigned
    } else if (statusFilter && statusFilter !== 'all') {
      where.status = statusFilter.toUpperCase();
    }

    // Assigned filter (priority: specific agent > general filter)
    // Only apply if status is not "assigned_not_started" or "pending" (already handled above)
    if (statusFilter !== 'assigned_not_started' && statusFilter !== 'pending') {
      if (assignedToId) {
        // Filter by specific agent ID
        where.assignedToId = assignedToId;
      } else if (assignedFilter === 'unassigned') {
        where.assignedToId = null;
      } else if (assignedFilter === 'assigned') {
        where.assignedToId = { not: null };
      }
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

    // Build orderBy clause based on sortBy parameter
    const buildOrderBy = () => {
      const direction = sortOrder === 'desc' ? 'desc' : 'asc';
      
      // Map frontend sortKeys to database fields
      const fieldMap: Record<string, any> = {
        status: { status: direction },
        dateSubmitted: { yotpoDateSubmitted: direction },
        prOrYotpo: { yotpoPrOrYotpo: direction },
        customerName: { yotpoCustomerName: direction },
        email: { yotpoEmail: direction },
        orderDate: { yotpoOrderDate: direction },
        product: { yotpoProduct: direction },
        issueTopic: { yotpoIssueTopic: direction },
        reviewDate: { yotpoReviewDate: direction },
        assignedTo: { assignedTo: { name: direction } },
        createdAt: { createdAt: direction }
      };

      return fieldMap[sortBy] || { yotpoDateSubmitted: 'asc' };
    };

    // Get total count for pagination
    const total = await prisma.task.count({ where });

    // Fetch tasks with pagination and sorting
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
      orderBy: buildOrderBy(),
      take,
      skip
    });

    return NextResponse.json({
      success: true,
      total,
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
        
        // Import tracking
        importSource: task.yotpoImportSource,
        submittedBy: task.yotpoSubmittedBy,
        
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

