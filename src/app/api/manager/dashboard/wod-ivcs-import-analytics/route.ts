import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    // Get last 3 import sessions
    const lastThreeImports = await prisma.importSession.findMany({
      where: {
        taskType: "WOD_IVCS"
      },
      orderBy: { createdAt: "desc" },
      take: 3,
      include: {
        duplicateRecords: true
      }
    });

    // Get total sessions count
    const totalSessions = await prisma.importSession.count({
      where: {
        taskType: "WOD_IVCS"
      }
    });

    // Process import sessions
    const processedSessions = lastThreeImports.map(session => {
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

    const data = {
      lastThreeImports: processedSessions,
      totalSessions
    };

    return NextResponse.json({
      success: true,
      data
    });

  } catch (error) {
    console.error('WOD/IVCS Import Analytics API Error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to load import analytics data'
    }, { status: 500 });
  }
}