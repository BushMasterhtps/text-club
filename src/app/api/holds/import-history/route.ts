import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * Get Holds import history with duplicate details
 * Returns last 10 imports that had duplicates
 */

export async function GET(request: NextRequest) {
  try {
    // Fetch recent Holds imports with duplicates
    const importSessions = await prisma.importSession.findMany({
      where: {
        taskType: 'HOLDS',
        duplicates: { gt: 0 } // Only imports with duplicates
      },
      select: {
        id: true,
        fileName: true,
        importedAt: true,
        importedBy: true,
        totalRows: true,
        imported: true,
        duplicates: true,
        errors: true,
        duplicateDetails: true
      },
      orderBy: {
        importedAt: 'desc'
      },
      take: 10
    });

    return NextResponse.json({
      success: true,
      sessions: importSessions.map(session => ({
        timestamp: session.importedAt.toISOString(),
        fileName: session.fileName,
        duplicates: session.duplicateDetails || [],
        imported: session.imported,
        totalDuplicates: session.duplicates,
        errors: session.errors
      }))
    });

  } catch (error) {
    console.error('Error fetching import history:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch import history'
    }, { status: 500 });
  }
}

