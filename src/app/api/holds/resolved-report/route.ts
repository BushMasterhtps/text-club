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
    
    // Pagination
    const take = parseInt(searchParams.get('take') || '100', 10);
    const skip = parseInt(searchParams.get('skip') || '0', 10);
    
    // Build where clause
    // Exclude dispositions that just move to another queue (not truly resolved)
    const excludedDispositions = [
      'Unable to Resolve', // Moves to Customer Contact
      'Duplicate'          // Moves to Duplicates queue
    ];
    
    const where: any = {
      taskType: 'HOLDS',
      status: 'COMPLETED',
      disposition: { 
        not: null,
        notIn: excludedDispositions // Only show actually resolved orders
      }
    };
    
    // Date range filter
    if (startDate && endDate) {
      where.endTime = {
        gte: new Date(startDate),
        lte: new Date(endDate + 'T23:59:59.999Z')
      };
    }
    
    // Agent filter
    if (agentId && agentId !== 'all') {
      where.assignedToId = agentId;
    }
    
    // Disposition filter
    if (disposition && disposition !== 'all') {
      where.disposition = disposition;
    }
    
    // Search filter (order number or email)
    if (search) {
      where.OR = [
        { holdsOrderNumber: { contains: search, mode: 'insensitive' } },
        { holdsCustomerEmail: { contains: search, mode: 'insensitive' } }
      ];
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
        }
      },
      orderBy: {
        endTime: 'desc'
      },
      take: exportCsv ? undefined : take,
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
        orderDate: task.holdsOrderDate,
        priority: task.holdsPriority,
        finalQueue: task.holdsStatus,
        disposition: task.disposition,
        agentName: task.assignedTo?.name || 'Unassigned',
        agentEmail: task.assignedTo?.email || '',
        completedDate: task.endTime,
        duration: task.durationSec,
        queueTimes,
        queueHistory,
        createdAt: task.createdAt
      };
    });
    
    // If CSV export requested
    if (exportCsv) {
      const csvRows = [
        // Header row
        ['Order Number', 'Customer Email', 'Order Date', 'Priority', 'Final Queue', 'Disposition', 'Agent Name', 'Completed Date', 'Duration (sec)', 'Agent Research Time', 'Customer Contact Time', 'Escalated Call Time'].join(',')
      ];
      
      tasksWithMetrics.forEach(task => {
        const row = [
          task.orderNumber || '',
          task.customerEmail || '',
          task.orderDate ? new Date(task.orderDate).toLocaleDateString() : '',
          task.priority || '',
          task.finalQueue || '',
          task.disposition || '',
          task.agentName || '',
          task.completedDate ? new Date(task.completedDate).toLocaleString() : '',
          task.duration || '',
          task.queueTimes['Agent Research'] || '0',
          task.queueTimes['Customer Contact'] || '0',
          task.queueTimes['Escalated Call 4+ Day'] || '0'
        ].map(field => `"${String(field).replace(/"/g, '""')}"`);
        
        csvRows.push(row.join(','));
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

