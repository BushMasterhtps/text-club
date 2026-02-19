import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeBrand, getBrandFilterValues } from "@/lib/brand-normalize";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const agentEmail = searchParams.get("agent");
    const disposition = searchParams.get("disposition");
    const brandFilter = searchParams.get("brandFilter");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");
    const includeAll = searchParams.get("includeAll") === "true";

    // Build where clause
    const where: any = {
      status: "COMPLETED",
      taskType: "TEXT_CLUB" // Only show Text Club tasks
    };

    // Add date filtering if provided
    if (startDate && endDate) {
      const start = new Date(startDate + 'T00:00:00.000Z');
      const end = new Date(endDate + 'T23:59:59.999Z');
      where.endTime = {
        gte: start,
        lte: end
      };
    }

    if (brandFilter && brandFilter !== "all") {
      const brandValues = getBrandFilterValues(brandFilter);
      where.brand = { in: brandValues };
    }

    if (agentEmail) {
      const agent = await prisma.user.findFirst({
        where: { email: agentEmail },
        select: { id: true }
      });
      if (agent) {
        where.assignedToId = agent.id;
      }
    }

    if (disposition && disposition !== "all") {
      // Handle merged dispositions
      if (disposition === "Spam") {
        where.disposition = {
          in: [
            "Spam - Negative Feedback",
            "Spam - Positive Feedback", 
            "Spam - Off Topic",
            "Spam - Gibberish",
            "Spam - One word statement",
            "Spam - Reaction Message"
          ]
        };
      } else if (disposition === "Answered in SF") {
        where.disposition = {
          contains: "Answered in SF"
        };
      } else {
        where.disposition = disposition;
      }
    }

    // Get completed tasks with agent and raw message data
    const [completedTasks, totalCount] = await Promise.all([
      prisma.task.findMany({
        where,
        select: {
          id: true,
          brand: true,
          text: true,
          status: true,
          startTime: true,
          endTime: true,
          durationSec: true,
          disposition: true,
          sfCaseNumber: true,
          assignedTo: {
            select: {
              name: true,
              email: true
            }
          },
          rawMessage: {
            select: {
              brand: true,
              phone: true,
              text: true
            }
          }
        },
        orderBy: { endTime: "desc" },
        ...(includeAll ? {} : { take: limit, skip: offset })
      }),
      prisma.task.count({ where })
    ]);

    // Base where for brand breakdown (same filters but no brand filter, so we see all brands)
    const { brand: _b, ...whereForBrandBreakdown } = where;

    // Get analytics data + brand breakdown (by raw brand, then we merge by canonical)
    const [agentGroup, dispositionGroup, completedTodayCount, brandGroup] = await Promise.all([
      // Average handle time by agent
      prisma.task.groupBy({
        by: ["assignedToId"],
        where: {
          ...where,
          durationSec: { not: null }
        },
        _avg: { durationSec: true },
        _count: { id: true }
      }),
      // Average handle time by disposition (including individual spam subcategories)
      prisma.task.groupBy({
        by: ["disposition"],
        where: {
          ...where,
          durationSec: { not: null },
          disposition: { not: null }
        },
        _avg: { durationSec: true },
        _count: { id: true }
      }),
      // Total completed in the selected date range (or today if no range specified)
      prisma.task.count({
        where: startDate && endDate ? where : {
          ...where,
          endTime: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
            lt: new Date(new Date().setHours(23, 59, 59, 999))
          }
        }
      }),
      // Brand breakdown (no brand filter): group by raw brand, merge by canonical name
      prisma.task.groupBy({
        by: ["brand"],
        where: {
          ...whereForBrandBreakdown,
          brand: { not: null }
        },
        _count: { id: true }
      })
    ]);

    const analytics = [agentGroup, dispositionGroup, completedTodayCount] as const;

    // Get agent names for analytics
    const agentIds = analytics[0].map(a => a.assignedToId).filter(Boolean);
    const agents = await prisma.user.findMany({
      where: { id: { in: agentIds } },
      select: { id: true, name: true, email: true }
    });

    const agentMap = new Map(agents.map(a => [a.id, a]));

    const agentAnalytics = analytics[0].map(stat => ({
      agent: agentMap.get(stat.assignedToId) || { name: "Unknown", email: "unknown" },
      avgDuration: Math.round(stat._avg.durationSec || 0),
      completedCount: stat._count.id
    }));

    // Process disposition analytics and merge spam subcategories
    const rawDispositionStats = analytics[1];
    const dispositionMap = new Map();
    
    // Group dispositions, merging spam subcategories
    rawDispositionStats.forEach(stat => {
      const disposition = stat.disposition || "Unknown";
      let groupKey = disposition;
      
      // Merge all spam subcategories into "Spam"
      if (disposition.includes("Spam") || 
          disposition.includes("Negative Feedback") || 
          disposition.includes("Positive Feedback") || 
          disposition.includes("Off Topic") || 
          disposition.includes("Gibberish") || 
          disposition.includes("One word statement") || 
          disposition.includes("Reaction Message")) {
        groupKey = "Spam";
      }
      
      // Merge all "Answered in SF" cases into "Answered in SF"
      if (disposition.includes("Answered in SF")) {
        groupKey = "Answered in SF";
      }
      
      if (!dispositionMap.has(groupKey)) {
        dispositionMap.set(groupKey, {
          disposition: groupKey,
          avgDuration: 0,
          completedCount: 0,
          subcategories: []
        });
      }
      
      const group = dispositionMap.get(groupKey);
      group.completedCount += stat._count.id;
      group.subcategories.push({
        disposition: disposition,
        avgDuration: Math.round(stat._avg.durationSec || 0),
        completedCount: stat._count.id
      });
    });
    
    // Calculate weighted average duration for merged categories
    const dispositionAnalytics = Array.from(dispositionMap.values()).map(group => {
      if (group.subcategories.length > 1) {
        // Calculate weighted average for merged categories
        const totalCount = group.subcategories.reduce((sum, sub) => sum + sub.completedCount, 0);
        const weightedSum = group.subcategories.reduce((sum, sub) => 
          sum + (sub.avgDuration * sub.completedCount), 0);
        group.avgDuration = totalCount > 0 ? Math.round(weightedSum / totalCount) : 0;
      } else {
        group.avgDuration = group.subcategories[0]?.avgDuration || 0;
      }
      return {
        disposition: group.disposition,
        avgDuration: group.avgDuration,
        completedCount: group.completedCount,
        subcategories: group.subcategories
      };
    });

    // Merge raw brand groups into canonical names (handles "Gundry" + "GundryMD" -> one row)
    const brandCountByCanonical: Record<string, number> = {};
    for (const row of brandGroup) {
      const canonical = normalizeBrand(row.brand);
      brandCountByCanonical[canonical] = (brandCountByCanonical[canonical] || 0) + row._count.id;
    }
    const brandBreakdown = Object.entries(brandCountByCanonical)
      .map(([brand, count]) => ({ brand, count }))
      .sort((a, b) => b.count - a.count);

    const responseData = {
      success: true,
      completedTasks,
      totalCount,
      analytics: {
        agentAnalytics,
        dispositionAnalytics,
        brandBreakdown,
        completedToday: analytics[2]
      }
    };



    return NextResponse.json(responseData);

  } catch (error) {
    console.error("Error fetching completed work:", error);
    console.error("Error details:", {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined
    });
    return NextResponse.json(
      { 
        success: false, 
        error: "Failed to fetch completed work",
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
