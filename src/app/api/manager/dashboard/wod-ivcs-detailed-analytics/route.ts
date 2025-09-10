import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
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

    // Parse dates with proper timezone handling
    const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
    const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
    
    const dateStart = new Date(startYear, startMonth - 1, startDay, 0, 0, 0, 0);
    const dateEnd = new Date(endYear, endMonth - 1, endDay, 23, 59, 59, 999);

    // Get import sessions in date range
    const importSessions = await prisma.importSession.findMany({
      where: {
        taskType: "WOD_IVCS",
        createdAt: {
          gte: dateStart,
          lte: dateEnd
        }
      },
      orderBy: { createdAt: "desc" },
      include: {
        duplicateRecords: true
      }
    });

    // Process import sessions
    const processedSessions = importSessions.map(session => {
      const sources: Record<string, any> = {};
      let totalTasks = session.imported || 0;
      let totalDuplicates = session.duplicates || 0;
      let totalPreviouslyCompleted = session.filtered || 0;

      // Group duplicates by source
      for (const duplicate of session.duplicateRecords) {
        const source = duplicate.source || 'UNKNOWN';
        if (!sources[source]) {
          sources[source] = {
            total: 0,
            duplicates: 0,
            previouslyCompleted: 0,
            duplicateDetails: []
          };
        }

        sources[source].duplicates += 1;
        sources[source].duplicateDetails.push({
          duplicateTask: {
            documentNumber: duplicate.documentNumber,
            webOrder: duplicate.webOrder,
            customerName: duplicate.customerName,
            source: duplicate.source
          },
          originalTask: {
            completedBy: duplicate.originalCompletedBy,
            completedOn: duplicate.originalCompletedAt,
            disposition: duplicate.originalDisposition,
            createdAt: duplicate.originalCreatedAt
          },
          ageInDays: duplicate.ageInDays,
          wasImported: false
        });
      }

      // Add a general source entry for the session
      const sessionSource = session.source || 'UNKNOWN';
      if (!sources[sessionSource]) {
        sources[sessionSource] = {
          total: totalTasks,
          duplicates: totalDuplicates,
          previouslyCompleted: totalPreviouslyCompleted,
          duplicateDetails: []
        };
      } else {
        sources[sessionSource].total = totalTasks;
        sources[sessionSource].previouslyCompleted = totalPreviouslyCompleted;
      }

      return {
        id: session.id,
        totalTasks,
        totalDuplicates,
        totalPreviouslyCompleted,
        sources,
        formattedTime: session.createdAt.toLocaleString()
      };
    });

    // Get duplicate analysis
    const duplicateAnalysis = {
      totalDuplicates: 0,
      duplicateGroups: {} as Record<string, number>,
      duplicateDetails: [] as any[]
    };

    // Process duplicates from all sessions
    for (const session of processedSessions) {
      for (const [source, sourceData] of Object.entries(session.sources)) {
        if (sourceData.duplicates > 0) {
          duplicateAnalysis.totalDuplicates += sourceData.duplicates;
          duplicateAnalysis.duplicateGroups[source] = (duplicateAnalysis.duplicateGroups[source] || 0) + sourceData.duplicates;
          
          // Add duplicate details
          if (sourceData.duplicateDetails) {
            duplicateAnalysis.duplicateDetails.push(...sourceData.duplicateDetails);
          }
        }
      }
    }

    // Get total sessions count
    const totalSessions = await prisma.importSession.count({
      where: {
        taskType: "WOD_IVCS"
      }
    });

    const data = {
      dateRange: {
        startDate: dateStart.toISOString(),
        endDate: dateEnd.toISOString()
      },
      summary: {
        totalImported: processedSessions.reduce((sum, session) => sum + session.totalTasks, 0),
        totalDuplicates: processedSessions.reduce((sum, session) => sum + session.totalDuplicates, 0),
        totalPreviouslyCompleted: processedSessions.reduce((sum, session) => sum + session.totalPreviouslyCompleted, 0),
        totalSessions: processedSessions.length
      },
      importSessions: processedSessions,
      duplicateAnalysis
    };

    return NextResponse.json({
      success: true,
      data
    });

  } catch (error) {
    console.error('WOD/IVCS Detailed Analytics API Error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to load detailed analytics data'
    }, { status: 500 });
  }
}