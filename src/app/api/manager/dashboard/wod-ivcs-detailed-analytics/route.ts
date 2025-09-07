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

    // Get import sessions in the date range
    const importSessionData = await prisma.importSession.findMany({
      where: {
        importedAt: {
          gte: start,
          lte: end,
        },
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

      // Process duplicate records
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

        sources[duplicate.source].duplicateDetails.push({
          duplicateTask: {
            id: duplicate.id,
            documentNumber: duplicate.documentNumber,
            webOrder: duplicate.webOrder,
            customerName: duplicate.customerName,
            source: duplicate.source,
            createdAt: session.importedAt,
            status: 'DUPLICATE'
          },
          originalTask: {
            id: duplicate.originalTaskId,
            documentNumber: duplicate.documentNumber,
            webOrder: duplicate.webOrder,
            customerName: duplicate.customerName,
            source: duplicate.source,
            completedOn: duplicate.originalCompletedAt,
            disposition: duplicate.originalDisposition,
            completedBy: duplicate.originalCompletedBy,
            completedByEmail: duplicate.originalCompletedBy,
            createdAt: duplicate.originalCreatedAt,
            status: duplicate.originalCompletedAt ? 'COMPLETED' : 'PENDING'
          },
          key: `${duplicate.source}-${duplicate.documentNumber || duplicate.webOrder}`,
          ageInDays: duplicate.ageInDays,
          wasImported: false // Duplicates are not imported
        });
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
      session.duplicateRecords.map(duplicate => ({
        duplicateTask: {
          id: duplicate.id,
          documentNumber: duplicate.documentNumber,
          webOrder: duplicate.webOrder,
          customerName: duplicate.customerName,
          source: duplicate.source,
          createdAt: session.importedAt,
          status: 'DUPLICATE'
        },
        originalTask: {
          id: duplicate.originalTaskId,
          documentNumber: duplicate.documentNumber,
          webOrder: duplicate.webOrder,
          customerName: duplicate.customerName,
          source: duplicate.source,
          completedOn: duplicate.originalCompletedAt,
          disposition: duplicate.originalDisposition,
          completedBy: duplicate.originalCompletedBy,
          completedByEmail: duplicate.originalCompletedBy,
          createdAt: duplicate.originalCreatedAt,
          status: duplicate.originalCompletedAt ? 'COMPLETED' : 'PENDING'
        },
        key: `${duplicate.source}-${duplicate.documentNumber || duplicate.webOrder}`,
        ageInDays: duplicate.ageInDays,
        wasImported: false
      }))
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
