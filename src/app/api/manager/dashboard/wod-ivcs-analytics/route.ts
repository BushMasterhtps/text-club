import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const agentFilter = searchParams.get('agentFilter');
    const dispositionFilter = searchParams.get('dispositionFilter');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    const compareStartDate = searchParams.get('compareStartDate');
    const compareEndDate = searchParams.get('compareEndDate');

    // Parse dates with proper timezone handling
    let dateStart: Date;
    let dateEnd: Date;
    
    if (startDate && endDate) {
      // Parse dates as local timezone
      const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
      const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
      
      if (isNaN(startYear) || isNaN(startMonth) || isNaN(startDay) || 
          isNaN(endYear) || isNaN(endMonth) || isNaN(endDay)) {
        return NextResponse.json({ success: false, error: "Invalid date format. Use YYYY-MM-DD" }, { status: 400 });
      }
      
      dateStart = new Date(startYear, startMonth - 1, startDay, 0, 0, 0, 0);
      dateEnd = new Date(endYear, endMonth - 1, endDay, 23, 59, 59, 999);
    } else {
      // Default to today
      const today = new Date();
      dateStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
      dateEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
    }

    // Convert to UTC for database queries to avoid timezone issues
    const utcDateStart = new Date(dateStart.getTime() - dateStart.getTimezoneOffset() * 60000);
    const utcDateEnd = new Date(dateEnd.getTime() - dateEnd.getTimezoneOffset() * 60000);

    // Build where clause for WOD/IVCS tasks
    const where: any = {
      taskType: "WOD_IVCS",
      OR: [
        { status: "COMPLETED" },
        { 
          status: "PENDING",
          sentBackBy: { not: null },
          endTime: { not: null }
        }
      ],
      endTime: {
        gte: utcDateStart,
        lte: utcDateEnd
      }
    };

    // Apply agent filter
    if (agentFilter && agentFilter !== 'all') {
      where.OR = [
        { assignedToId: agentFilter },
        { sentBackBy: agentFilter }
      ];
    }

    // Apply disposition filter
    if (dispositionFilter && dispositionFilter !== 'all') {
      where.disposition = dispositionFilter;
    }

    // Get completed tasks with all necessary data
    const [completedTasks, totalCount] = await Promise.all([
      prisma.task.findMany({
        where,
        select: {
          id: true,
          endTime: true,
          durationSec: true,
          disposition: true,
          assignedTo: {
            select: {
              name: true,
              email: true
            }
          },
          sentBackByUser: {
            select: {
              name: true,
              email: true
            }
          },
          wodIvcsSource: true,
          documentNumber: true,
          webOrder: true,
          customerName: true,
          amount: true,
          webOrderDifference: true,
          purchaseDate: true,
          sentBackBy: true
        },
        orderBy: { endTime: "desc" },
        take: limit,
        skip: offset
      }),
      prisma.task.count({ where })
    ]);

    // Get analytics data
    const [
      agentAnalytics,
      dispositionAnalytics,
      dailyTrends
    ] = await Promise.all([
      // Agent analytics
      prisma.task.groupBy({
        by: ["assignedToId", "sentBackBy"],
        where: {
          ...where,
          durationSec: { not: null }
        },
        _avg: {
          durationSec: true
        },
        _count: {
          id: true
        }
      }),
      // Disposition analytics
      prisma.task.groupBy({
        by: ["disposition"],
        where: {
          ...where,
          durationSec: { not: null },
          disposition: { not: null }
        },
        _avg: {
          durationSec: true
        },
        _count: {
          id: true
        }
      }),
      // Daily trends
      prisma.task.groupBy({
        by: ["endTime"],
        where: {
          ...where,
          durationSec: { not: null }
        },
        _avg: {
          durationSec: true
        },
        _count: {
          id: true
        }
      })
    ]);

    // Process agent analytics
    const agentBreakdown: Record<string, { name: string; count: number; totalDuration: number; avgDuration: number; dispositions: Record<string, number> }> = {};
    
    for (const agent of agentAnalytics) {
      const agentId = agent.assignedToId || agent.sentBackBy;
      if (!agentId) continue;
      
      if (!agentBreakdown[agentId]) {
        agentBreakdown[agentId] = {
          name: '',
          count: 0,
          totalDuration: 0,
          avgDuration: 0,
          dispositions: {}
        };
      }
      
      agentBreakdown[agentId].count += agent._count.id;
      agentBreakdown[agentId].totalDuration += (agent._avg.durationSec || 0) * agent._count.id;
    }

    // Get agent names
    const agentIds = Object.keys(agentBreakdown);
    if (agentIds.length > 0) {
      const agents = await prisma.user.findMany({
        where: { id: { in: agentIds } },
        select: { id: true, name: true }
      });
      
      for (const agent of agents) {
        if (agentBreakdown[agent.id]) {
          agentBreakdown[agent.id].name = agent.name || 'Unknown';
          agentBreakdown[agent.id].avgDuration = agentBreakdown[agent.id].totalDuration / agentBreakdown[agent.id].count;
        }
      }
    }

    // Process disposition analytics
    const dispositionBreakdown: Record<string, { count: number; totalDuration: number; avgDuration: number }> = {};
    
    for (const disp of dispositionAnalytics) {
      if (disp.disposition) {
        dispositionBreakdown[disp.disposition] = {
          count: disp._count.id,
          totalDuration: (disp._avg.durationSec || 0) * disp._count.id,
          avgDuration: disp._avg.durationSec || 0
        };
      }
    }

    // Process daily trends
    const dailyTrendsMap: Record<string, { count: number; totalDuration: number; avgDuration: number; dispositions: Record<string, number> }> = {};
    
    for (const day of dailyTrends) {
      if (day.endTime) {
        const dateKey = day.endTime.toISOString().split('T')[0];
        if (!dailyTrendsMap[dateKey]) {
          dailyTrendsMap[dateKey] = {
            count: 0,
            totalDuration: 0,
            avgDuration: 0,
            dispositions: {}
          };
        }
        
        dailyTrendsMap[dateKey].count += day._count.id;
        dailyTrendsMap[dateKey].totalDuration += (day._avg.durationSec || 0) * day._count.id;
      }
    }

    // Calculate average durations for daily trends
    for (const dateKey in dailyTrendsMap) {
      const day = dailyTrendsMap[dateKey];
      day.avgDuration = day.count > 0 ? day.totalDuration / day.count : 0;
    }

    // Calculate summary stats
    const totalCompleted = completedTasks.length;
    const totalDuration = completedTasks.reduce((sum, task) => sum + (task.durationSec || 0), 0);
    const avgDuration = totalCompleted > 0 ? totalDuration / totalCompleted : 0;

    // Get comparison data if provided
    let comparisonData = null;
    if (compareStartDate && compareEndDate) {
      const [compareStartYear, compareStartMonth, compareStartDay] = compareStartDate.split('-').map(Number);
      const [compareEndYear, compareEndMonth, compareEndDay] = compareEndDate.split('-').map(Number);
      
      const compareDateStart = new Date(compareStartYear, compareStartMonth - 1, compareStartDay, 0, 0, 0, 0);
      const compareDateEnd = new Date(compareEndYear, compareEndMonth - 1, compareEndDay, 23, 59, 59, 999);
      
      // Convert to UTC for database queries
      const utcCompareDateStart = new Date(compareDateStart.getTime() - compareDateStart.getTimezoneOffset() * 60000);
      const utcCompareDateEnd = new Date(compareDateEnd.getTime() - compareDateEnd.getTimezoneOffset() * 60000);
      
      const compareCount = await prisma.task.count({
        where: {
          ...where,
          endTime: {
            gte: utcCompareDateStart,
            lte: utcCompareDateEnd
          }
        }
      });
      
      const compareDuration = await prisma.task.aggregate({
        where: {
          ...where,
          endTime: {
            gte: utcCompareDateStart,
            lte: utcCompareDateEnd
          },
          durationSec: { not: null }
        },
        _avg: {
          durationSec: true
        }
      });
      
      const compareAvgDuration = compareDuration._avg.durationSec || 0;
      
      comparisonData = {
        totalCompleted: compareCount,
        avgDuration: compareAvgDuration,
        completedChange: totalCompleted > 0 ? ((totalCompleted - compareCount) / compareCount) * 100 : 0,
        durationChange: compareAvgDuration > 0 ? ((avgDuration - compareAvgDuration) / compareAvgDuration) * 100 : 0
      };
    }

    // Format completed work data
    const completedWork = completedTasks.map(task => ({
      id: task.id,
      endTime: task.endTime?.toISOString() || '',
      durationSec: task.durationSec,
      disposition: task.disposition,
      assignedTo: task.assignedTo || task.sentBackByUser,
      wodIvcsSource: task.wodIvcsSource,
      documentNumber: task.documentNumber,
      webOrder: task.webOrder,
      customerName: task.customerName,
      amount: task.amount,
      webOrderDifference: task.webOrderDifference,
      purchaseDate: task.purchaseDate?.toISOString() || null
    }));

    // Format daily trends
    const dailyTrendsArray = Object.entries(dailyTrendsMap)
      .map(([date, data]) => ({
        date,
        count: data.count,
        totalDuration: data.totalDuration,
        avgDuration: data.avgDuration,
        dispositions: data.dispositions
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const data = {
      summary: {
        totalCompleted,
        avgDuration,
        totalCount
      },
      completedWork,
      dispositionBreakdown,
      agentBreakdown,
      dailyTrends: dailyTrendsArray,
      comparisonData,
      pagination: {
        limit,
        offset,
        totalCount,
        hasMore: offset + limit < totalCount
      }
    };

    return NextResponse.json({
      success: true,
      data
    });

  } catch (error) {
    console.error('WOD/IVCS Analytics API Error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to load analytics data'
    }, { status: 500 });
  }
}