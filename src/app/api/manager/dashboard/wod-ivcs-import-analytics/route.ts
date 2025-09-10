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
        importDetails: true
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
      let totalTasks = 0;
      let totalDuplicates = 0;
      let totalPreviouslyCompleted = 0;

      // Group by source
      for (const detail of session.importDetails) {
        const source = detail.source || 'UNKNOWN';
        if (!sources[source]) {
          sources[source] = {
            total: 0,
            duplicates: 0,
            previouslyCompleted: 0,
            duplicateDetails: []
          };
        }

        sources[source].total += detail.totalImported || 0;
        sources[source].duplicates += detail.duplicatesFound || 0;
        sources[source].previouslyCompleted += detail.previouslyCompleted || 0;

        totalTasks += detail.totalImported || 0;
        totalDuplicates += detail.duplicatesFound || 0;
        totalPreviouslyCompleted += detail.previouslyCompleted || 0;

        // Add duplicate details if available
        if (detail.duplicateDetails && Array.isArray(detail.duplicateDetails)) {
          sources[source].duplicateDetails.push(...detail.duplicateDetails);
        }
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