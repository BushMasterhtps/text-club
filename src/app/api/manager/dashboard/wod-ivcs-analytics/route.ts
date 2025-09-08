import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const compareStartDate = searchParams.get('compareStartDate');
    const compareEndDate = searchParams.get('compareEndDate');
    const agentFilter = searchParams.get('agentFilter');
    const dispositionFilter = searchParams.get('dispositionFilter');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Parse dates - ensure we're working with UTC dates
    const start = startDate ? new Date(startDate + 'T00:00:00.000Z') : new Date();
    const end = endDate ? new Date(endDate + 'T23:59:59.999Z') : new Date();
    const compareStart = compareStartDate ? new Date(compareStartDate + 'T00:00:00.000Z') : null;
    const compareEnd = compareEndDate ? new Date(compareEndDate + 'T23:59:59.999Z') : null;

    // Build where clause for main data
    const whereClause: any = {
      taskType: 'WOD_IVCS',
      status: 'COMPLETED',
      endTime: {
        gte: start,
        lte: end
      }
    };

    // Add agent filter
    if (agentFilter && agentFilter !== 'all') {
      whereClause.assignedToId = agentFilter;
    }

    // Add disposition filter
    if (dispositionFilter && dispositionFilter !== 'all') {
      whereClause.disposition = dispositionFilter;
    }

    // Get completed work data
    const completedWork = await prisma.task.findMany({
      where: whereClause,
      select: {
        id: true,
        endTime: true,
        durationSec: true,
        disposition: true,
        assignedToId: true,
        assignedTo: {
          select: {
            name: true,
            email: true
          }
        },
        wodIvcsSource: true,
        documentNumber: true,
        customerName: true,
        amount: true,
        webOrderDifference: true,
        purchaseDate: true
      },
      orderBy: {
        endTime: 'desc'
      },
      take: limit,
      skip: offset
    });

    // Get total count for pagination
    const totalCount = await prisma.task.count({
      where: whereClause
    });

    // Calculate analytics
    const totalCompleted = completedWork.length;
    const avgDuration = completedWork.reduce((sum, task) => sum + (task.durationSec || 0), 0) / totalCompleted || 0;

    // Group by disposition
    const dispositionBreakdown = completedWork.reduce((acc, task) => {
      const disposition = task.disposition || 'Unknown';
      if (!acc[disposition]) {
        acc[disposition] = {
          count: 0,
          totalDuration: 0,
          avgDuration: 0
        };
      }
      acc[disposition].count++;
      acc[disposition].totalDuration += task.durationSec || 0;
      acc[disposition].avgDuration = acc[disposition].totalDuration / acc[disposition].count;
      return acc;
    }, {} as Record<string, { count: number; totalDuration: number; avgDuration: number }>);

    // Group by agent
    const agentBreakdown = completedWork.reduce((acc, task) => {
      const agentId = task.assignedToId || 'unassigned';
      const agentName = task.assignedTo?.name || 'Unassigned';
      if (!acc[agentId]) {
        acc[agentId] = {
          name: agentName,
          count: 0,
          totalDuration: 0,
          avgDuration: 0,
          dispositions: {} as Record<string, number>
        };
      }
      acc[agentId].count++;
      acc[agentId].totalDuration += task.durationSec || 0;
      acc[agentId].avgDuration = acc[agentId].totalDuration / acc[agentId].count;
      
      const disposition = task.disposition || 'Unknown';
      acc[agentId].dispositions[disposition] = (acc[agentId].dispositions[disposition] || 0) + 1;
      
      return acc;
    }, {} as Record<string, { name: string; count: number; totalDuration: number; avgDuration: number; dispositions: Record<string, number> }>);

    // Group by date for trends
    const dailyTrends = completedWork.reduce((acc, task) => {
      if (!task.endTime) return acc;
      const date = task.endTime.toISOString().split('T')[0];
      if (!acc[date]) {
        acc[date] = {
          date,
          count: 0,
          totalDuration: 0,
          avgDuration: 0,
          dispositions: {} as Record<string, number>
        };
      }
      acc[date].count++;
      acc[date].totalDuration += task.durationSec || 0;
      acc[date].avgDuration = acc[date].totalDuration / acc[date].count;
      
      const disposition = task.disposition || 'Unknown';
      acc[date].dispositions[disposition] = (acc[date].dispositions[disposition] || 0) + 1;
      
      return acc;
    }, {} as Record<string, { date: string; count: number; totalDuration: number; avgDuration: number; dispositions: Record<string, number> }>);

    // Get comparison data if comparison dates provided
    let comparisonData = null;
    if (compareStart && compareEnd) {
      const compareWhereClause = {
        ...whereClause,
        endTime: {
          gte: compareStart,
          lte: compareEnd
        }
      };

      const compareWork = await prisma.task.findMany({
        where: compareWhereClause,
        select: {
          id: true,
          endTime: true,
          durationSec: true,
          disposition: true,
          assignedToId: true
        }
      });

      const compareTotalCompleted = compareWork.length;
      const compareAvgDuration = compareWork.reduce((sum, task) => sum + (task.durationSec || 0), 0) / compareTotalCompleted || 0;

      // Calculate percentage changes
      const completedChange = totalCompleted > 0 && compareTotalCompleted > 0 
        ? ((totalCompleted - compareTotalCompleted) / compareTotalCompleted) * 100 
        : 0;
      
      const durationChange = avgDuration > 0 && compareAvgDuration > 0 
        ? ((avgDuration - compareAvgDuration) / compareAvgDuration) * 100 
        : 0;

      comparisonData = {
        totalCompleted: compareTotalCompleted,
        avgDuration: compareAvgDuration,
        completedChange,
        durationChange
      };
    }

    const response = NextResponse.json({
      success: true,
      data: {
        summary: {
          totalCompleted,
          avgDuration,
          totalCount
        },
        completedWork,
        dispositionBreakdown,
        agentBreakdown,
        dailyTrends: Object.values(dailyTrends).sort((a, b) => a.date.localeCompare(b.date)),
        comparisonData,
        pagination: {
          limit,
          offset,
          totalCount,
          hasMore: offset + limit < totalCount
        }
      }
    });

    // Add cache-busting headers to ensure fresh data
    response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');

    return response;

  } catch (error) {
    console.error('WOD/IVCS Analytics API Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch analytics data' },
      { status: 500 }
    );
  }
}
