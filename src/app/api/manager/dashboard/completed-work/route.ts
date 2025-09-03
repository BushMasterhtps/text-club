import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const agentEmail = searchParams.get("agent");
    const disposition = searchParams.get("disposition");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");



    // Build where clause
    const where: any = {
      status: "COMPLETED"
    };

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
        take: limit,
        skip: offset
      }),
      prisma.task.count({ where })
    ]);

    // Get analytics data
    const analytics = await Promise.all([
      // Average handle time by agent
      prisma.task.groupBy({
        by: ["assignedToId"],
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
      // Average handle time by disposition (including individual spam subcategories)
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
      // Total completed today
      prisma.task.count({
        where: {
          ...where,
          endTime: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
            lt: new Date(new Date().setHours(23, 59, 59, 999))
          }
        }
      })
    ]);

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

    const responseData = {
      success: true,
      completedTasks,
      totalCount,
      analytics: {
        agentAnalytics,
        dispositionAnalytics,
        completedToday: analytics[2]
      }
    };



    return NextResponse.json(responseData);

  } catch (error) {
    console.error("Error fetching completed work:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch completed work" },
      { status: 500 }
    );
  }
}
