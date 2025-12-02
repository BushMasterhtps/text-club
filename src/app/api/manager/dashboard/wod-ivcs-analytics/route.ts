import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calculateFinancialImpact } from "@/lib/wod-ivcs-disposition-impact";

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
    // Fetch ALL tasks for accurate financial calculations (not just paginated subset)
    const [completedTasks, allTasksForCalculations, totalCount] = await Promise.all([
      // Paginated tasks for display
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
              email: true,
              id: true
            }
          },
          sentBackByUser: {
            select: {
              name: true,
              email: true,
              id: true
            }
          },
          wodIvcsSource: true,
          documentNumber: true,
          webOrder: true,
          customerName: true,
          amount: true,
          webOrderDifference: true,
          purchaseDate: true,
          sentBackBy: true,
          assignedToId: true,
          brand: true // Include brand for breakdown
        },
        orderBy: { endTime: "desc" },
        take: limit,
        skip: offset
      }),
      // All tasks for financial calculations (no pagination)
      prisma.task.findMany({
        where,
        select: {
          id: true,
          disposition: true,
          amount: true,
          assignedToId: true,
          sentBackBy: true,
          assignedTo: {
            select: {
              name: true,
              email: true,
              id: true
            }
          },
          sentBackByUser: {
            select: {
              name: true,
              email: true,
              id: true
            }
          },
          wodIvcsSource: true,
          brand: true,
          durationSec: true
        }
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

    // Calculate financial impact metrics using ALL tasks (not just paginated)
    let totalSaved = 0;
    let totalLost = 0;
    let netAmount = 0;

    // Process agent analytics with financial impact
    const agentBreakdown: Record<string, { 
      name: string; 
      email: string;
      count: number; 
      totalDuration: number; 
      avgDuration: number; 
      totalSaved: number;
      totalLost: number;
      netAmount: number;
      dispositions: Record<string, { count: number; savedAmount: number; lostAmount: number; netAmount: number }> 
    }> = {};
    
    // Process brand breakdown with financial impact
    const brandBreakdown: Record<string, {
      count: number;
      totalSaved: number;
      totalLost: number;
      netAmount: number;
    }> = {};

    // Process source breakdown with financial impact
    const sourceBreakdown: Record<string, {
      count: number;
      totalSaved: number;
      totalLost: number;
      netAmount: number;
    }> = {};

    // Process all tasks for financial calculations
    for (const task of allTasksForCalculations) {
      const amount = task.amount ? Number(task.amount) : 0;
      const { savedAmount, lostAmount, netAmount: taskNetAmount } = calculateFinancialImpact(task.disposition, amount);
      
      // Update totals
      totalSaved += savedAmount;
      totalLost += lostAmount;
      netAmount += taskNetAmount;

      // Update agent breakdown
      const agentId = task.assignedToId || task.sentBackBy;
      const agentInfo = task.assignedTo || task.sentBackByUser;
      if (agentId && agentInfo) {
        if (!agentBreakdown[agentId]) {
          agentBreakdown[agentId] = {
            name: agentInfo.name || 'Unknown',
            email: agentInfo.email || '',
            count: 0,
            totalDuration: 0,
            avgDuration: 0,
            totalSaved: 0,
            totalLost: 0,
            netAmount: 0,
            dispositions: {}
          };
        }
        agentBreakdown[agentId].count++;
        agentBreakdown[agentId].totalSaved += savedAmount;
        agentBreakdown[agentId].totalLost += lostAmount;
        agentBreakdown[agentId].netAmount += taskNetAmount;
        agentBreakdown[agentId].totalDuration += task.durationSec || 0;

        // Update disposition breakdown per agent
        const disp = task.disposition || 'Unknown';
        if (!agentBreakdown[agentId].dispositions[disp]) {
          agentBreakdown[agentId].dispositions[disp] = { count: 0, savedAmount: 0, lostAmount: 0, netAmount: 0 };
        }
        agentBreakdown[agentId].dispositions[disp].count++;
        agentBreakdown[agentId].dispositions[disp].savedAmount += savedAmount;
        agentBreakdown[agentId].dispositions[disp].lostAmount += lostAmount;
        agentBreakdown[agentId].dispositions[disp].netAmount += taskNetAmount;
      }

      // Update brand breakdown
      const brand = task.brand || 'Unknown';
      if (!brandBreakdown[brand]) {
        brandBreakdown[brand] = {
          count: 0,
          totalSaved: 0,
          totalLost: 0,
          netAmount: 0
        };
      }
      brandBreakdown[brand].count++;
      brandBreakdown[brand].totalSaved += savedAmount;
      brandBreakdown[brand].totalLost += lostAmount;
      brandBreakdown[brand].netAmount += taskNetAmount;

      // Update source breakdown
      const source = task.wodIvcsSource || 'Unknown';
      if (!sourceBreakdown[source]) {
        sourceBreakdown[source] = {
          count: 0,
          totalSaved: 0,
          totalLost: 0,
          netAmount: 0
        };
      }
      sourceBreakdown[source].count++;
      sourceBreakdown[source].totalSaved += savedAmount;
      sourceBreakdown[source].totalLost += lostAmount;
      sourceBreakdown[source].netAmount += taskNetAmount;
    }

    // Calculate average durations for agents
    for (const agentId in agentBreakdown) {
      const agent = agentBreakdown[agentId];
      agent.avgDuration = agent.count > 0 ? agent.totalDuration / agent.count : 0;
    }

    // Process disposition analytics with financial impact
    const dispositionBreakdown: Record<string, { 
      count: number; 
      totalDuration: number; 
      avgDuration: number;
      totalSaved: number;
      totalLost: number;
      netAmount: number;
    }> = {};
    
    for (const task of allTasksForCalculations) {
      const disp = task.disposition;
      if (disp) {
        if (!dispositionBreakdown[disp]) {
          dispositionBreakdown[disp] = {
            count: 0,
            totalDuration: 0,
            avgDuration: 0,
            totalSaved: 0,
            totalLost: 0,
            netAmount: 0
          };
        }
        
        const amount = task.amount ? Number(task.amount) : 0;
        const { savedAmount, lostAmount, netAmount: taskNetAmount } = calculateFinancialImpact(disp, amount);
        
        dispositionBreakdown[disp].count++;
        dispositionBreakdown[disp].totalDuration += task.durationSec || 0;
        dispositionBreakdown[disp].totalSaved += savedAmount;
        dispositionBreakdown[disp].totalLost += lostAmount;
        dispositionBreakdown[disp].netAmount += taskNetAmount;
      }
    }

    // Calculate average durations for dispositions
    for (const disp in dispositionBreakdown) {
      const dispData = dispositionBreakdown[disp];
      dispData.avgDuration = dispData.count > 0 ? dispData.totalDuration / dispData.count : 0;
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
    const totalCompleted = totalCount; // Use totalCount from database, not limited completedTasks.length
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

    // Format completed work data with financial impact
    const completedWork = completedTasks.map(task => {
      const amount = task.amount ? Number(task.amount) : 0;
      const { savedAmount, lostAmount, netAmount: taskNetAmount } = calculateFinancialImpact(task.disposition, amount);
      
      return {
        id: task.id,
        endTime: task.endTime?.toISOString() || '',
        durationSec: task.durationSec,
        disposition: task.disposition,
        assignedTo: task.assignedTo || task.sentBackByUser,
        wodIvcsSource: task.wodIvcsSource,
        documentNumber: task.documentNumber,
        webOrder: task.webOrder,
        customerName: task.customerName,
        brand: task.brand,
        // Convert Decimal fields to numbers for JSON serialization
        amount: task.amount ? Number(task.amount) : null,
        webOrderDifference: task.webOrderDifference ? Number(task.webOrderDifference) : null,
        purchaseDate: task.purchaseDate?.toISOString() || null,
        // Financial impact
        savedAmount,
        lostAmount,
        netAmount: taskNetAmount
      };
    });

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
        totalCount,
        // Financial impact summary
        totalSaved,
        totalLost,
        netAmount
      },
      completedWork,
      dispositionBreakdown,
      agentBreakdown,
      brandBreakdown, // New: Brand breakdown with financial metrics
      sourceBreakdown, // New: Source breakdown with financial metrics
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