import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const agentFilter = searchParams.get('agentFilter');
    const dispositionFilter = searchParams.get('dispositionFilter');

    // Parse dates with proper timezone handling
    let dateStart: Date;
    let dateEnd: Date;
    
    if (startDate && endDate) {
      const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
      const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
      
      dateStart = new Date(startYear, startMonth - 1, startDay, 0, 0, 0, 0);
      dateEnd = new Date(endYear, endMonth - 1, endDay, 23, 59, 59, 999);
    } else {
      // Default to today
      const today = new Date();
      dateStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
      dateEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
    }

    // Use local dates directly - no UTC conversion needed
    const utcDateStart = dateStart;
    const utcDateEnd = dateEnd;

    // Build where clause
    const where: any = {
      taskType: "TEXT_CLUB",
      OR: [
        {
          status: "COMPLETED",
          endTime: { gte: utcDateStart, lte: utcDateEnd }
        },
        {
          status: "PENDING",
          sentBackBy: { not: null },
          endTime: { gte: utcDateStart, lte: utcDateEnd }
        }
      ]
    };

    // Apply filters
    if (agentFilter && agentFilter !== 'all') {
      where.OR = [
        { assignedToId: agentFilter },
        { sentBackBy: agentFilter }
      ];
    }

    if (dispositionFilter && dispositionFilter !== 'all') {
      where.disposition = dispositionFilter;
    }

    // Get completed tasks for today
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
    const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
    const utcStartOfToday = startOfToday;
    const utcEndOfToday = endOfToday;

    const todayWhere = {
      ...where,
      OR: [
        {
          status: "COMPLETED",
          endTime: { gte: utcStartOfToday, lte: utcEndOfToday }
        },
        {
          status: "PENDING",
          sentBackBy: { not: null },
          endTime: { gte: utcStartOfToday, lte: utcEndOfToday }
        }
      ]
    };

    // Get stats
    const [totalCompleted, totalCompletedToday, avgHandleTimeResult] = await Promise.all([
      prisma.task.count({ where }),
      prisma.task.count({ where: todayWhere }),
      prisma.task.aggregate({
        where: {
          ...where,
          durationSec: { not: null }
        },
        _avg: {
          durationSec: true
        }
      })
    ]);

    // Get disposition breakdown
    const dispositionBreakdown = await prisma.task.groupBy({
      by: ["disposition"],
      where: {
        ...where,
        disposition: { not: null },
        durationSec: { not: null }
      },
      _avg: {
        durationSec: true
      },
      _count: {
        id: true
      }
    });

    // Get agent performance
    const agentPerformance = await prisma.task.groupBy({
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
    });

    // Get agent names
    const agentIds = [...new Set([
      ...agentPerformance.map(a => a.assignedToId).filter(Boolean),
      ...agentPerformance.map(a => a.sentBackBy).filter(Boolean)
    ])];

    const agents = await prisma.user.findMany({
      where: { id: { in: agentIds } },
      select: { id: true, name: true, email: true }
    });

    const agentMap = agents.reduce((acc, agent) => {
      acc[agent.id] = agent;
      return acc;
    }, {} as Record<string, any>);

    // Process agent performance
    const agentPerformanceMap: Record<string, { count: number; totalDuration: number }> = {};
    
    agentPerformance.forEach(agent => {
      const agentId = agent.assignedToId || agent.sentBackBy;
      if (!agentId) return;
      
      if (!agentPerformanceMap[agentId]) {
        agentPerformanceMap[agentId] = { count: 0, totalDuration: 0 };
      }
      
      agentPerformanceMap[agentId].count += agent._count.id;
      agentPerformanceMap[agentId].totalDuration += (agent._avg.durationSec || 0) * agent._count.id;
    });

    const processedAgentPerformance = Object.entries(agentPerformanceMap).map(([agentId, stats]) => ({
      agent: agentMap[agentId] || { name: 'Unknown', email: 'unknown@example.com' },
      completedCount: stats.count,
      avgDuration: Math.round(stats.totalDuration / stats.count)
    })).sort((a, b) => b.completedCount - a.completedCount);

    // Get daily trends
    const dailyTrends = await prisma.task.groupBy({
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
    });

    const dailyTrendsMap: Record<string, { count: number; totalDuration: number }> = {};
    
    dailyTrends.forEach(day => {
      if (day.endTime) {
        const dateKey = day.endTime.toISOString().split('T')[0];
        if (!dailyTrendsMap[dateKey]) {
          dailyTrendsMap[dateKey] = { count: 0, totalDuration: 0 };
        }
        dailyTrendsMap[dateKey].count += day._count.id;
        dailyTrendsMap[dateKey].totalDuration += (day._avg.durationSec || 0) * day._count.id;
      }
    });

    const processedDailyTrends = Object.entries(dailyTrendsMap)
      .map(([date, data]) => ({
        date,
        count: data.count,
        avgDuration: Math.round(data.totalDuration / data.count)
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Get raw data for CSV export
    const rawData = await prisma.task.findMany({
      where,
      select: {
        id: true,
        brand: true,
        phone: true,
        disposition: true,
        durationSec: true,
        endTime: true,
        assignedTo: {
          select: { name: true, email: true }
        },
        sentBackByUser: {
          select: { name: true, email: true }
        }
      },
      orderBy: { endTime: "desc" },
      take: 1000
    });

    const processedRawData = rawData.map(task => ({
      id: task.id,
      brand: task.brand || 'Unknown',
      phone: task.phone || 'Unknown',
      agent: (task.assignedTo || task.sentBackByUser)?.name || 'Unknown',
      disposition: task.disposition || 'Unknown',
      duration: task.durationSec || 0,
      completedAt: task.endTime?.toISOString() || new Date().toISOString()
    }));

    const data = {
      totalCompleted,
      totalCompletedToday,
      avgHandleTime: Math.round(avgHandleTimeResult._avg.durationSec || 0),
      dispositionBreakdown: dispositionBreakdown.map(dispo => ({
        disposition: dispo.disposition || 'Unknown',
        count: dispo._count.id,
        avgDuration: Math.round(dispo._avg.durationSec || 0)
      })),
      agentPerformance: processedAgentPerformance,
      dailyTrends: processedDailyTrends,
      rawData: processedRawData
    };

    return NextResponse.json({
      success: true,
      data
    });

  } catch (error) {
    console.error('Text Club Analytics API Error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to load Text Club analytics data'
    }, { status: 500 });
  }
}
