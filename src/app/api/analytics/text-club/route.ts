import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiAuthDeniedResponse, requireManagerApiAuth } from "@/lib/auth";
import {
  getAgentReportingDayBoundsUtc,
  getAgentReportingRangeBoundsUtc,
} from "@/lib/agent-reporting-day-bounds";

export async function GET(request: NextRequest) {
  const auth = await requireManagerApiAuth(request);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);

  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const agentFilter = searchParams.get("agentFilter");
    const dispositionFilter = searchParams.get("dispositionFilter");

    let startUtc: Date;
    let endExclusiveUtc: Date;
    try {
      if (startDate && endDate) {
        ({ startUtc, endExclusiveUtc } = getAgentReportingRangeBoundsUtc(
          startDate,
          endDate
        ));
      } else {
        const b = getAgentReportingDayBoundsUtc(null);
        startUtc = b.startUtc;
        endExclusiveUtc = b.endExclusiveUtc;
      }
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid date format. Use YYYY-MM-DD." },
        { status: 400 }
      );
    }

    const endTimeRange = { gte: startUtc, lt: endExclusiveUtc };
    const periodOr = [
      { status: "COMPLETED" as const, endTime: endTimeRange },
      {
        status: "PENDING" as const,
        sentBackBy: { not: null },
        endTime: endTimeRange,
      },
    ];

    const todayBounds = getAgentReportingDayBoundsUtc(null);
    const todayRange = {
      gte: todayBounds.startUtc,
      lt: todayBounds.endExclusiveUtc,
    };
    const todayOr = [
      { status: "COMPLETED" as const, endTime: todayRange },
      {
        status: "PENDING" as const,
        sentBackBy: { not: null },
        endTime: todayRange,
      },
    ];

    const periodAnd: object[] = [{ OR: periodOr }];
    if (agentFilter && agentFilter !== "all") {
      periodAnd.push({
        OR: [{ assignedToId: agentFilter }, { sentBackBy: agentFilter }],
      });
    }
    if (dispositionFilter && dispositionFilter !== "all") {
      periodAnd.push({ disposition: dispositionFilter });
    }

    const todayAnd: object[] = [{ OR: todayOr }];
    if (agentFilter && agentFilter !== "all") {
      todayAnd.push({
        OR: [{ assignedToId: agentFilter }, { sentBackBy: agentFilter }],
      });
    }
    if (dispositionFilter && dispositionFilter !== "all") {
      todayAnd.push({ disposition: dispositionFilter });
    }

    const where: any = {
      taskType: "TEXT_CLUB",
      AND: periodAnd,
    };

    const todayWhere: any = {
      taskType: "TEXT_CLUB",
      AND: todayAnd,
    };

    const [totalCompleted, totalCompletedToday, avgHandleTimeResult] =
      await Promise.all([
        prisma.task.count({ where }),
        prisma.task.count({ where: todayWhere }),
        prisma.task.aggregate({
          where: {
            ...where,
            durationSec: { not: null },
          },
          _avg: {
            durationSec: true,
          },
        }),
      ]);

    const dispositionBreakdown = await prisma.task.groupBy({
      by: ["disposition"],
      where: {
        ...where,
        disposition: { not: null },
        durationSec: { not: null },
      },
      _avg: {
        durationSec: true,
      },
      _count: {
        id: true,
      },
    });

    const agentPerformance = await prisma.task.groupBy({
      by: ["assignedToId", "sentBackBy"],
      where: {
        ...where,
        durationSec: { not: null },
      },
      _avg: {
        durationSec: true,
      },
      _count: {
        id: true,
      },
    });

    const agentIds = [
      ...new Set([
        ...agentPerformance.map((a) => a.assignedToId).filter(Boolean),
        ...agentPerformance.map((a) => a.sentBackBy).filter(Boolean),
      ]),
    ] as string[];

    const agents = await prisma.user.findMany({
      where: { id: { in: agentIds } },
      select: { id: true, name: true, email: true },
    });

    const agentMap = agents.reduce(
      (acc, agent) => {
        acc[agent.id] = agent;
        return acc;
      },
      {} as Record<string, (typeof agents)[0]>
    );

    const agentPerformanceMap: Record<
      string,
      { count: number; totalDuration: number }
    > = {};

    agentPerformance.forEach((agent) => {
      const agentId = agent.assignedToId || agent.sentBackBy;
      if (!agentId) return;

      if (!agentPerformanceMap[agentId]) {
        agentPerformanceMap[agentId] = { count: 0, totalDuration: 0 };
      }

      agentPerformanceMap[agentId].count += agent._count.id;
      agentPerformanceMap[agentId].totalDuration +=
        (agent._avg.durationSec || 0) * agent._count.id;
    });

    const processedAgentPerformance = Object.entries(agentPerformanceMap)
      .map(([agentId, stats]) => ({
        agent: agentMap[agentId] || {
          name: "Unknown",
          email: "unknown@example.com",
        },
        completedCount: stats.count,
        avgDuration: Math.round(stats.totalDuration / stats.count),
      }))
      .sort((a, b) => b.completedCount - a.completedCount);

    const dailyTrends = await prisma.task.groupBy({
      by: ["endTime"],
      where: {
        ...where,
        durationSec: { not: null },
      },
      _avg: {
        durationSec: true,
      },
      _count: {
        id: true,
      },
    });

    const dailyTrendsMap: Record<string, { count: number; totalDuration: number }> =
      {};

    dailyTrends.forEach((day) => {
      if (day.endTime) {
        const dateKey = day.endTime.toISOString().split("T")[0];
        if (!dailyTrendsMap[dateKey]) {
          dailyTrendsMap[dateKey] = { count: 0, totalDuration: 0 };
        }
        dailyTrendsMap[dateKey].count += day._count.id;
        dailyTrendsMap[dateKey].totalDuration +=
          (day._avg.durationSec || 0) * day._count.id;
      }
    });

    const processedDailyTrends = Object.entries(dailyTrendsMap)
      .map(([date, data]) => ({
        date,
        count: data.count,
        avgDuration: Math.round(data.totalDuration / data.count),
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

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
          select: { name: true, email: true },
        },
        sentBackByUser: {
          select: { name: true, email: true },
        },
      },
      orderBy: { endTime: "desc" },
      take: 1000,
    });

    const processedRawData = rawData.map((task) => ({
      id: task.id,
      brand: task.brand || "Unknown",
      phone: task.phone || "Unknown",
      agent: (task.assignedTo || task.sentBackByUser)?.name || "Unknown",
      disposition: task.disposition || "Unknown",
      duration: task.durationSec || 0,
      completedAt: task.endTime?.toISOString() || new Date().toISOString(),
    }));

    const data = {
      totalCompleted,
      totalCompletedToday,
      avgHandleTime: Math.round(avgHandleTimeResult._avg.durationSec || 0),
      dispositionBreakdown: dispositionBreakdown.map((dispo) => ({
        disposition: dispo.disposition || "Unknown",
        count: dispo._count.id,
        avgDuration: Math.round(dispo._avg.durationSec || 0),
      })),
      agentPerformance: processedAgentPerformance,
      dailyTrends: processedDailyTrends,
      rawData: processedRawData,
    };

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Text Club Analytics API Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to load Text Club analytics data",
      },
      { status: 500 }
    );
  }
}
