import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * API for Resolved Holds Orders Report
 * Returns completed holds tasks with disposition, agent, date, and duration
 */

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Filters
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const agentId = searchParams.get('agentId');
    const disposition = searchParams.get('disposition');
    const search = searchParams.get('search'); // Search by order number, email
    const exportCsv = searchParams.get('export') === 'true';
    
    // Pagination - Use large limit for UI, no limit for CSV export
    const take = exportCsv ? undefined : parseInt(searchParams.get('take') || '10000', 10); // Large limit for UI to get all tasks
    const skip = exportCsv ? undefined : parseInt(searchParams.get('skip') || '0', 10);
    
    // Build where clause - Include ALL completed tasks, including unassigning dispositions
    // These dispositions count as completed work for agents even if they move to another queue
    const where: any = {
      taskType: 'HOLDS',
      status: 'COMPLETED', // Use status instead of holdsStatus to include all completions
      disposition: { not: null }
    };
    
    // Date range filter - Convert PST dates to UTC boundaries
    // Use endTime for completed tasks (when they were actually completed)
    if (startDate && endDate) {
      const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
      const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
      
      // Start of day in PST = 8:00 AM UTC (PST is UTC-8)
      const pstStartUTC = new Date(Date.UTC(startYear, startMonth - 1, startDay, 8, 0, 0, 0));
      // End of day in PST = 7:59:59.999 AM UTC next day
      const pstEndUTC = new Date(Date.UTC(endYear, endMonth - 1, endDay + 1, 7, 59, 59, 999));
      
      // Filter by endTime (when task was completed)
      where.endTime = {
        gte: pstStartUTC,
        lte: pstEndUTC
      };
    }
    
    // Agent filter - include both assignedToId and completedBy
    // Build OR condition that works with existing where clause
    if (agentId && agentId !== 'all') {
      const agentFilter = {
        OR: [
          { assignedToId: agentId },
          { completedBy: agentId }
        ]
      };
      
      // If date filter exists, combine with AND
      if (where.endTime) {
        where.AND = [
          { endTime: where.endTime },
          agentFilter
        ];
        delete where.endTime;
      } else {
        Object.assign(where, agentFilter);
      }
    }
    
    // Disposition filter
    if (disposition && disposition !== 'all') {
      where.disposition = disposition;
    }
    
    // Search filter (order number or email)
    if (search) {
      // If date filter exists, combine with AND; otherwise just add search
      if (startDate && endDate && where.OR) {
        where.AND = [
          { OR: where.OR },
          {
            OR: [
              { holdsOrderNumber: { contains: search, mode: 'insensitive' } },
              { holdsCustomerEmail: { contains: search, mode: 'insensitive' } }
            ]
          }
        ];
        delete where.OR;
      } else {
        where.OR = [
          { holdsOrderNumber: { contains: search, mode: 'insensitive' } },
          { holdsCustomerEmail: { contains: search, mode: 'insensitive' } }
        ];
      }
    }
    
    // Get total count
    const total = await prisma.task.count({ where });
    
    // Fetch resolved tasks
    const tasks = await prisma.task.findMany({
      where,
      select: {
        id: true,
        holdsOrderNumber: true,
        holdsCustomerEmail: true,
        holdsOrderDate: true,
        holdsPriority: true,
        holdsStatus: true,
        holdsQueueHistory: true,
        holdsOrderAmount: true,
        holdsNotes: true,
        disposition: true,
        startTime: true,
        endTime: true,
        durationSec: true,
        createdAt: true,
        assignedTo: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        completedByUser: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: {
        endTime: 'desc'
      },
      take: exportCsv ? undefined : (take > 10000 ? 10000 : take), // Cap at 10k for UI
      skip: exportCsv ? undefined : skip
    });
    
    // Calculate queue time breakdowns
    const tasksWithMetrics = tasks.map(task => {
      const queueHistory = Array.isArray(task.holdsQueueHistory) ? task.holdsQueueHistory : [];
      
      // Calculate time spent in each queue
      const queueTimes: Record<string, number> = {};
      queueHistory.forEach((entry: any) => {
        if (entry.enteredAt) {
          const entered = new Date(entry.enteredAt);
          const exited = entry.exitedAt ? new Date(entry.exitedAt) : new Date();
          const timeInQueue = Math.round((exited.getTime() - entered.getTime()) / 1000); // seconds
          queueTimes[entry.queue] = (queueTimes[entry.queue] || 0) + timeInQueue;
        }
      });
      
      return {
        id: task.id,
        orderNumber: task.holdsOrderNumber,
        customerEmail: task.holdsCustomerEmail,
        // Convert Date fields to ISO strings for JSON serialization
        orderDate: task.holdsOrderDate?.toISOString() || null,
        priority: task.holdsPriority,
        finalQueue: task.holdsStatus,
        disposition: task.disposition,
        // Use completedBy if available (for unassigned completions), otherwise use assignedTo
        agentName: task.completedByUser?.name || task.assignedTo?.name || 'Unassigned',
        agentEmail: task.completedByUser?.email || task.assignedTo?.email || '',
        completedDate: task.endTime?.toISOString() || null,
        duration: task.durationSec,
        queueTimes,
        queueHistory,
        // Convert Decimal field to number for JSON serialization
        orderAmount: task.holdsOrderAmount ? Number(task.holdsOrderAmount) : 0,
        notes: task.holdsNotes || '',
        createdAt: task.createdAt?.toISOString() || null
      };
    });
    
    // If CSV export requested
    if (exportCsv) {
      const includeComments = searchParams.get('includeComments') === 'true';
      const headers = ['Order Number', 'Customer Email', 'Order Date', 'Priority', 'Final Queue', 'Disposition', 'Agent Name', 'Order Amount', 'Completed Date', 'Duration (sec)', 'Agent Research Time', 'Customer Contact Time', 'Escalated Call Time'];
      if (includeComments) {
        headers.push('Comments');
      }
      
      const csvRows = [
        headers.join(',')
      ];
      
      tasksWithMetrics.forEach(task => {
        // Convert dates to PST timezone for CSV export
        const formatDateToPST = (dateString: string | null) => {
          if (!dateString) return '';
          return new Date(dateString).toLocaleString('en-US', { 
            timeZone: 'America/Los_Angeles',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
          });
        };
        
        const row = [
          task.orderNumber || '',
          task.customerEmail || '',
          formatDateToPST(task.orderDate),
          task.priority || '',
          task.finalQueue || '',
          task.disposition || '',
          task.agentName || '',
          task.orderAmount || '0',
          formatDateToPST(task.completedDate),
          task.duration || '',
          task.queueTimes['Agent Research'] || '0',
          task.queueTimes['Customer Contact'] || '0',
          task.queueTimes['Escalated Call 4+ Day'] || '0'
        ];
        
        if (includeComments) {
          row.push(task.notes || '');
        }
        
        csvRows.push(row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(','));
      });
      
      const csvContent = csvRows.join('\n');
      
      return new NextResponse(csvContent, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="holds-resolved-report-${new Date().toISOString().split('T')[0]}.csv"`
        }
      });
    }
    
    // Return JSON for UI display
    return NextResponse.json({
      success: true,
      data: {
        tasks: tasksWithMetrics,
        total,
        page: Math.floor(skip / take) + 1,
        totalPages: Math.ceil(total / take)
      }
    });
    
  } catch (error) {
    console.error('Error fetching resolved holds report:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch resolved holds report' },
      { status: 500 }
    );
  }
}

