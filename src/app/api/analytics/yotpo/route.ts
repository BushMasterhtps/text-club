import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Yotpo Analytics API
 * Similar to Text Club analytics but with Issue Topic breakdown
 */

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

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

    // Build where clause for Yotpo tasks with date filter
    const where = {
      taskType: "YOTPO" as const,
      status: "COMPLETED" as const,
      endTime: { gte: utcDateStart, lte: utcDateEnd }
    };

    // Get completed tasks for today
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
    const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
    const utcStartOfToday = startOfToday;
    const utcEndOfToday = endOfToday;

    const todayWhere = {
      taskType: "YOTPO" as const,
      status: "COMPLETED" as const,
      endTime: { gte: utcStartOfToday, lte: utcEndOfToday }
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

    /** Normalize product name for grouping (e.g. "Bio Complete 3", "BioComplete 3" → same key) */
    function productNormalizeKey(product: string | null): string {
      if (!product || typeof product !== 'string') return 'unknown';
      return product
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/[^\w\s]/g, '')
        .replace(/\s+/g, '')
        || 'unknown';
    }

    // Get Issue Topic breakdown (PRIMARY breakdown for Yotpo)
    const issueTopicBreakdown = await prisma.task.groupBy({
      by: ["yotpoIssueTopic"],
      where: {
        ...where,
        yotpoIssueTopic: { not: null },
        durationSec: { not: null }
      },
      _avg: {
        durationSec: true
      },
      _count: {
        id: true
      }
    });

    // Get product counts (raw) then combine by normalized name
    const productGroupBy = await prisma.task.groupBy({
      by: ["yotpoProduct"],
      where: {
        ...where,
        yotpoProduct: { not: null }
      },
      _count: { id: true }
    });

    // Group by normalized key; display name = most common raw spelling in that group
    const productMap: Record<string, { count: number; rawCounts: Record<string, number> }> = {};
    for (const row of productGroupBy) {
      const raw = (row.yotpoProduct || '').trim() || 'Unknown';
      const key = productNormalizeKey(row.yotpoProduct);
      if (!productMap[key]) {
        productMap[key] = { count: 0, rawCounts: {} };
      }
      productMap[key].count += row._count.id;
      productMap[key].rawCounts[raw] = (productMap[key].rawCounts[raw] || 0) + row._count.id;
    }
    const productBreakdown = Object.entries(productMap)
      .map(([key, { count, rawCounts }]) => {
        const displayName = Object.entries(rawCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || key;
        const variantCount = Object.keys(rawCounts).length;
        return { displayName, count, variantCount };
      })
      .sort((a, b) => b.count - a.count);

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
      by: ["assignedToId"],
      where: {
        ...where,
        assignedToId: { not: null },
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
    const agentIds = agentPerformance.map(a => a.assignedToId).filter(Boolean) as string[];
    const agents = await prisma.user.findMany({
      where: { id: { in: agentIds } },
      select: { id: true, name: true, email: true }
    });

    const agentMap = agents.reduce((acc, agent) => {
      acc[agent.id] = agent;
      return acc;
    }, {} as Record<string, typeof agents[0]>);

    // Get raw data (completed tasks with all details)
    const rawData = await prisma.task.findMany({
      where: {
        ...where,
        startTime: { not: null },
        endTime: { not: null },
        durationSec: { not: null }
      },
      select: {
        id: true,
        brand: true,
        yotpoCustomerName: true,
        yotpoEmail: true,
        yotpoProduct: true,
        yotpoIssueTopic: true,
        yotpoReview: true,
        disposition: true,
        startTime: true,
        endTime: true,
        durationSec: true,
        yotpoSfOrderLink: true,
        sfCaseNumber: true, // Add SF Case Number for analytics
        assignedTo: {
          select: { name: true, email: true }
        }
      },
      orderBy: { endTime: 'desc' },
      take: 1000 // Limit to most recent 1000
    });

    // Format response data (keep durations in SECONDS like Text Club)
    const data = {
      overview: {
        totalCompleted,
        totalCompletedToday,
        avgHandleTime: Math.round(avgHandleTimeResult._avg.durationSec || 0) // Keep in seconds
      },
      
      // Issue Topic breakdown (PRIMARY for Yotpo)
      issueTopicBreakdown: issueTopicBreakdown.map(item => ({
        topic: item.yotpoIssueTopic || 'Unknown',
        count: item._count.id,
        avgDuration: Math.round(item._avg.durationSec || 0) // Keep in seconds
      })).sort((a, b) => b.count - a.count), // Sort by count descending

      // Product breakdown (combined by normalized name: e.g. "Bio Complete 3", "BioComplete 3" → one row)
      productBreakdown,

      // Disposition breakdown (secondary)
      dispositionBreakdown: dispositionBreakdown.map(item => ({
        disposition: item.disposition || 'Unknown',
        count: item._count.id,
        avgDuration: Math.round(item._avg.durationSec || 0) // Keep in seconds
      })).sort((a, b) => b.count - a.count),

      // Agent performance
      agentPerformance: agentPerformance.map(item => ({
        agentId: item.assignedToId!,
        agentName: agentMap[item.assignedToId!]?.name || 'Unknown',
        agentEmail: agentMap[item.assignedToId!]?.email || 'Unknown',
        count: item._count.id,
        avgDuration: Math.round(item._avg.durationSec || 0) // Keep in seconds
      })).sort((a, b) => b.count - a.count),

      // Raw data (for detailed table view)
      rawData: rawData.map(task => ({
        id: task.id,
        brand: task.brand || 'Yotpo',
        customerName: task.yotpoCustomerName || 'Unknown',
        email: task.yotpoEmail || 'Unknown',
        product: task.yotpoProduct || 'Unknown',
        issueTopic: task.yotpoIssueTopic || 'Unknown',
        review: task.yotpoReview ? task.yotpoReview.substring(0, 100) : '', // Truncate review
        agent: task.assignedTo ? `${task.assignedTo.name || 'Unknown'} (${task.assignedTo.email || ''})` : 'Unknown',
        agentName: task.assignedTo?.name || 'Unknown',
        agentEmail: task.assignedTo?.email || 'Unknown',
        startTime: task.startTime?.toISOString() || '',
        endTime: task.endTime?.toISOString() || '',
        durationSec: task.durationSec || 0,
        disposition: task.disposition || 'Unknown',
        sfOrderLink: task.yotpoSfOrderLink || '',
        sfCaseNumber: task.sfCaseNumber || '' // Add SF Case Number
      }))
    };

    return NextResponse.json({
      success: true,
      data
    });

  } catch (error) {
    console.error('Yotpo Analytics API Error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to load Yotpo analytics'
    }, { status: 500 });
  }
}

