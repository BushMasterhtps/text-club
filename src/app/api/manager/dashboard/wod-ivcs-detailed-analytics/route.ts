import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (!startDate || !endDate) {
      return NextResponse.json({ 
        success: false, 
        error: 'Start date and end date are required' 
      }, { status: 400 });
    }

    // Parse dates and create date range
    const start = new Date(startDate + 'T00:00:00.000Z');
    const end = new Date(endDate + 'T23:59:59.999Z');

    // Get all completed tasks to cross-reference with duplicates
    const completedTasks = await prisma.task.findMany({
      where: {
        taskType: 'WOD_IVCS',
        status: 'COMPLETED'
      },
      select: {
        id: true,
        documentNumber: true,
        webOrder: true,
        customerName: true,
        disposition: true,
        endTime: true,
        createdAt: true,
        assignedTo: {
          select: { name: true, email: true }
        }
      }
    });

    // Create a lookup map for completed tasks
    const completedTaskMap = new Map();
    completedTasks.forEach(task => {
      const key1 = task.documentNumber;
      const key2 = task.webOrder;
      if (key1) completedTaskMap.set(key1, task);
      if (key2) completedTaskMap.set(key2, task);
    });

    // Get import sessions in the date range
    // CACHE BUST: Force new deployment to clear Netlify cache - v2
    // Timestamp: ${new Date().toISOString()}
    const importSessionData = await prisma.importSession.findMany({
      where: {
        importedAt: {
          gte: start,
          lte: end,
        },
        // Note: ImportSession doesn't have taskType field, so we'll filter by source instead
      },
      include: {
        duplicateRecords: true,
      },
      orderBy: {
        importedAt: 'desc',
      },
    });

    // Get all WOD_IVCS tasks in the date range
    const tasks = await prisma.task.findMany({
      where: {
        taskType: 'WOD_IVCS',
        createdAt: {
          gte: start,
          lte: end,
        },
      },
      include: {
        assignedTo: {
          select: {
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Process import sessions data
    const processedSessions = importSessionData.map(session => {
      const formattedTime = session.importedAt.toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZoneName: 'short'
      });

      // Group duplicates by source
      const sources: Record<string, {
        total: number;
        duplicates: number;
        previouslyCompleted: number;
        duplicateDetails: any[];
      }> = {};

      // Initialize sources
      sources[session.source] = {
        total: session.imported,
        duplicates: session.duplicates,
        previouslyCompleted: 0,
        duplicateDetails: []
      };

      // Process duplicate records (simplified - detailed processing done later)
      session.duplicateRecords.forEach(duplicate => {
        if (!sources[duplicate.source]) {
          sources[duplicate.source] = {
            total: 0,
            duplicates: 0,
            previouslyCompleted: 0,
            duplicateDetails: []
          };
        }

        sources[duplicate.source].duplicates += 1;
        
        if (duplicate.originalCompletedAt) {
          sources[duplicate.source].previouslyCompleted += 1;
        }
      });

      return {
        id: session.id,
        timestamp: session.importedAt,
        formattedTime,
        tasks: [], // We don't need individual tasks for this view
        sources,
        totalTasks: session.imported,
        totalDuplicates: session.duplicates,
        totalPreviouslyCompleted: session.duplicateRecords.filter(d => d.originalCompletedAt).length,
      };
    });

    // Analyze all duplicates from import sessions
    const allDuplicates = importSessionData.flatMap(session => 
      session.duplicateRecords.map(duplicate => {
        // Try to find the completed task that matches this duplicate
        const completedTask = completedTaskMap.get(duplicate.documentNumber) || 
                             completedTaskMap.get(duplicate.webOrder);

        // Calculate age in days properly - use the completed task's creation date if available
        const referenceDate = completedTask?.createdAt || duplicate.originalCreatedAt;
        const ageInDays = referenceDate 
          ? Math.floor((new Date().getTime() - new Date(referenceDate).getTime()) / (1000 * 60 * 60 * 24))
          : 0;

        return {
          duplicateTask: {
            id: duplicate.id,
            documentNumber: duplicate.documentNumber,
            webOrder: duplicate.webOrder,
            customerName: completedTask?.customerName || duplicate.customerName || 'Unknown',
            source: duplicate.source,
            createdAt: session.importedAt,
            status: 'DUPLICATE'
          },
          originalTask: {
            id: completedTask?.id || duplicate.originalTaskId,
            documentNumber: duplicate.documentNumber,
            webOrder: duplicate.webOrder,
            customerName: completedTask?.customerName || duplicate.customerName || 'Unknown',
            source: duplicate.source,
            completedOn: completedTask?.endTime || duplicate.originalCompletedAt,
            disposition: completedTask?.disposition || duplicate.originalDisposition,
            completedBy: completedTask?.assignedTo?.name || duplicate.originalCompletedBy || 'Unknown',
            completedByEmail: completedTask?.assignedTo?.email || duplicate.originalCompletedBy || 'Unknown',
            createdAt: completedTask?.createdAt || duplicate.originalCreatedAt,
            status: (completedTask?.endTime || duplicate.originalCompletedAt) ? 'COMPLETED' : 'PENDING'
          },
          key: `${duplicate.source}-${duplicate.documentNumber || duplicate.webOrder}`,
          ageInDays: ageInDays,
          wasImported: false
        };
      })
    );

    const duplicateAnalysis = {
      totalDuplicates: allDuplicates.length,
      duplicateDetails: allDuplicates,
      duplicateGroups: allDuplicates.reduce((acc, item) => {
        const source = item.duplicateTask.source;
        acc[source] = (acc[source] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      totalPreviouslyCompleted: allDuplicates.filter(d => d.originalTask.completedOn).length,
      previouslyCompletedDetails: allDuplicates.filter(d => d.originalTask.completedOn),
    };

    const response = NextResponse.json({
      success: true,
      version: "2.0", // Force cache invalidation
      data: {
        dateRange: {
          start: start.toISOString(),
          end: end.toISOString(),
          startDate,
          endDate,
        },
        importSessions: processedSessions,
        duplicateAnalysis,
        summary: {
          totalImported: importSessionData.reduce((sum, session) => sum + session.imported, 0),
          totalSessions: processedSessions.length,
          totalDuplicates: duplicateAnalysis.totalDuplicates,
          totalPreviouslyCompleted: duplicateAnalysis.totalPreviouslyCompleted,
        },
      },
    });

    response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');

    return response;
  } catch (error) {
    console.error('Error fetching detailed WOD/IVCS analytics:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to fetch detailed analytics' 
    }, { status: 500 });
  }
}


function createTaskKey(task: any): string {
  switch (task.wodIvcsSource) {
    case 'INVALID_CASH_SALE':
      return `ICS-${task.documentNumber}`;
    case 'ORDERS_NOT_DOWNLOADING':
      return `OND-${task.webOrder}`;
    case 'SO_VS_WEB_DIFFERENCE':
      return `SWD-${task.webOrder}`;
    default:
      return `UNKNOWN-${task.id}`;
  }
}
