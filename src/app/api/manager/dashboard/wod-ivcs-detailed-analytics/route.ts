import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (!startDate || !endDate) {
      return NextResponse.json({
        success: false,
        error: 'Start date and end date are required'
      }, { status: 400 });
    }

    // Parse dates with proper timezone handling
    const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
    const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
    
    const dateStart = new Date(startYear, startMonth - 1, startDay, 0, 0, 0, 0);
    const dateEnd = new Date(endYear, endMonth - 1, endDay, 23, 59, 59, 999);

    // Get import sessions in date range
    const importSessions = await prisma.importSession.findMany({
      where: {
        taskType: "WOD_IVCS",
        createdAt: {
          gte: dateStart,
          lte: dateEnd
        }
      },
      orderBy: { createdAt: "desc" },
      include: {
        duplicateRecords: true
      }
    });

    // Process import sessions (async to fetch original task details)
    const processedSessions = await Promise.all(importSessions.map(async (session) => {
      const sources: Record<string, any> = {};
      let totalTasks = session.imported || 0;
      let totalDuplicates = session.duplicates || 0;
      let totalPreviouslyCompleted = session.filtered || 0;

      // Collect all unique original task IDs to batch fetch (CRITICAL: Prevents connection pool exhaustion)
      const originalTaskIds = session.duplicateRecords
        .map(d => d.originalTaskId)
        .filter((id): id is string => !!id);
      
      // Batch fetch ALL original tasks in a single query (instead of N individual queries)
      // FIXED: Also batch fetch users separately to avoid N+1 on assignedTo relation
      const originalTasksMap = new Map<string, any>();
      if (originalTaskIds.length > 0) {
        try {
          // First, fetch tasks without relation to avoid N+1
          const originalTasks = await prisma.task.findMany({
            where: { id: { in: originalTaskIds } },
            select: {
              id: true,
              amount: true,
              webOrderDifference: true,
              netSuiteTotal: true,
              webTotal: true,
              webVsNsDifference: true,
              nsVsWebDiscrepancy: true,
              warehouseEdgeStatus: true,
              purchaseDate: true,
              disposition: true,
              endTime: true,
              assignedToId: true // Get the ID instead of relation
            }
          });
          
          // Batch fetch all unique users in a single query
          const uniqueUserIds = Array.from(new Set(
            originalTasks
              .map(t => t.assignedToId)
              .filter((id): id is string => !!id)
          ));
          
          const usersMap = new Map<string, { name: string | null; email: string }>();
          if (uniqueUserIds.length > 0) {
            const users = await prisma.user.findMany({
              where: { id: { in: uniqueUserIds } },
              select: {
                id: true,
                name: true,
                email: true
              }
            });
            
            for (const user of users) {
              usersMap.set(user.id, {
                name: user.name,
                email: user.email
              });
            }
          }
          
          // Create a map for O(1) lookup, using batched user data
          for (const task of originalTasks) {
            const user = task.assignedToId ? usersMap.get(task.assignedToId) : null;
            originalTasksMap.set(task.id, {
              amount: task.amount ? Number(task.amount) : null,
              webOrderDifference: task.webOrderDifference ? Number(task.webOrderDifference) : null,
              netSuiteTotal: task.netSuiteTotal ? Number(task.netSuiteTotal) : null,
              webTotal: task.webTotal ? Number(task.webTotal) : null,
              webVsNsDifference: task.webVsNsDifference ? Number(task.webVsNsDifference) : null,
              nsVsWebDiscrepancy: task.nsVsWebDiscrepancy ? Number(task.nsVsWebDiscrepancy) : null,
              warehouseEdgeStatus: task.warehouseEdgeStatus,
              purchaseDate: task.purchaseDate?.toISOString() || null,
              disposition: task.disposition,
              completedAt: task.endTime?.toISOString() || null,
              completedBy: user?.name || null,
              completedByEmail: user?.email || null
            });
          }
        } catch (error) {
          console.error(`Error batch fetching original tasks:`, error);
        }
      }

      // Group duplicates by source and map to original task details
      const duplicateDetails = session.duplicateRecords.map((duplicate) => {
        const source = duplicate.source || 'UNKNOWN';
        if (!sources[source]) {
          sources[source] = {
            total: 0,
            duplicates: 0,
            previouslyCompleted: 0,
            duplicateDetails: []
          };
        }

        sources[source].duplicates += 1;
        
        // Look up original task details from the batch-fetched map
        const originalTaskDetails = duplicate.originalTaskId 
          ? originalTasksMap.get(duplicate.originalTaskId) 
          : null;
        
        return {
          duplicateTask: {
            documentNumber: duplicate.documentNumber,
            webOrder: duplicate.webOrder,
            customerName: duplicate.customerName,
            source: duplicate.source
          },
          originalTask: {
            completedBy: originalTaskDetails?.completedBy || duplicate.originalCompletedBy,
            completedOn: duplicate.originalCompletedAt,
            disposition: originalTaskDetails?.disposition || duplicate.originalDisposition,
            createdAt: duplicate.originalCreatedAt,
            taskId: duplicate.originalTaskId,
            // Enhanced financial details from batch-fetched data
            ...(originalTaskDetails || {})
          },
          ageInDays: duplicate.ageInDays,
          wasImported: false,
          lastSeenDate: session.createdAt.toISOString(), // When this duplicate was detected
          importSessionId: session.id
        };
      });
      
      // Add details to their respective sources
      for (const detail of duplicateDetails) {
        const source = detail.duplicateTask.source || 'UNKNOWN';
        if (sources[source]) {
          sources[source].duplicateDetails.push(detail);
        }
      }

      // Add a general source entry for the session
      const sessionSource = session.source || 'UNKNOWN';
      if (!sources[sessionSource]) {
        sources[sessionSource] = {
          total: totalTasks,
          duplicates: totalDuplicates,
          previouslyCompleted: totalPreviouslyCompleted,
          duplicateDetails: []
        };
      } else {
        sources[sessionSource].total = totalTasks;
        sources[sessionSource].previouslyCompleted = totalPreviouslyCompleted;
      }

      return {
        id: session.id,
        totalTasks,
        totalDuplicates,
        totalPreviouslyCompleted,
        sources,
        formattedTime: session.createdAt.toLocaleString()
      };
    }));

    // Get duplicate analysis with frequency tracking
    const duplicateAnalysis = {
      totalDuplicates: 0,
      duplicateGroups: {} as Record<string, number>,
      duplicateDetails: [] as any[],
      staleOrders: [] as any[] // Orders 5+ days old that keep appearing
    };

    // Track frequency of each order (by documentNumber or webOrder)
    const orderFrequency = new Map<string, {
      count: number;
      firstSeen: Date;
      lastSeen: Date;
      details: any[];
    }>();

    // Process duplicates from all sessions
    for (const session of processedSessions) {
      for (const [source, sourceData] of Object.entries(session.sources)) {
        if (sourceData.duplicates > 0) {
          duplicateAnalysis.totalDuplicates += sourceData.duplicates;
          duplicateAnalysis.duplicateGroups[source] = (duplicateAnalysis.duplicateGroups[source] || 0) + sourceData.duplicates;
          
          // Add duplicate details and track frequency
          if (sourceData.duplicateDetails) {
            for (const detail of sourceData.duplicateDetails) {
              duplicateAnalysis.duplicateDetails.push(detail);
              
              // Track frequency by order identifier
              const orderKey = detail.duplicateTask.documentNumber || detail.duplicateTask.webOrder || 'unknown';
              const lastSeenDate = new Date(detail.lastSeenDate);
              
              if (!orderFrequency.has(orderKey)) {
                orderFrequency.set(orderKey, {
                  count: 1,
                  firstSeen: new Date(detail.originalTask.createdAt),
                  lastSeen: lastSeenDate,
                  details: [detail]
                });
              } else {
                const existing = orderFrequency.get(orderKey)!;
                existing.count += 1;
                if (lastSeenDate > existing.lastSeen) {
                  existing.lastSeen = lastSeenDate;
                }
                existing.details.push(detail);
              }
            }
          }
        }
      }
    }

    // Identify stale orders (5+ days old, appearing multiple times)
    for (const [orderKey, frequency] of orderFrequency.entries()) {
      const daysSinceFirstSeen = Math.floor((Date.now() - frequency.firstSeen.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysSinceFirstSeen >= 5 && frequency.count > 1) {
        // Get the most recent detail for this order
        const mostRecentDetail = frequency.details.sort((a, b) => 
          new Date(b.lastSeenDate).getTime() - new Date(a.lastSeenDate).getTime()
        )[0];
        
        duplicateAnalysis.staleOrders.push({
          orderKey,
          documentNumber: mostRecentDetail.duplicateTask.documentNumber,
          webOrder: mostRecentDetail.duplicateTask.webOrder,
          customerName: mostRecentDetail.duplicateTask.customerName,
          source: mostRecentDetail.duplicateTask.source,
          frequency: frequency.count,
          firstSeen: frequency.firstSeen.toISOString(),
          lastSeen: frequency.lastSeen.toISOString(),
          daysSinceFirstSeen,
          originalTask: mostRecentDetail.originalTask,
          ageInDays: mostRecentDetail.ageInDays
        });
      }
    }

    // Sort stale orders by frequency (most frequent first) then by age
    duplicateAnalysis.staleOrders.sort((a, b) => {
      if (b.frequency !== a.frequency) return b.frequency - a.frequency;
      return b.daysSinceFirstSeen - a.daysSinceFirstSeen;
    });

    // Get total sessions count
    const totalSessions = await prisma.importSession.count({
      where: {
        taskType: "WOD_IVCS"
      }
    });

    const data = {
      dateRange: {
        startDate: dateStart.toISOString(),
        endDate: dateEnd.toISOString()
      },
      summary: {
        totalImported: processedSessions.reduce((sum, session) => sum + session.totalTasks, 0),
        totalDuplicates: processedSessions.reduce((sum, session) => sum + session.totalDuplicates, 0),
        totalPreviouslyCompleted: processedSessions.reduce((sum, session) => sum + session.totalPreviouslyCompleted, 0),
        totalSessions: processedSessions.length
      },
      importSessions: processedSessions,
      duplicateAnalysis
    };

    return NextResponse.json({
      success: true,
      data
    });

  } catch (error) {
    console.error('WOD/IVCS Detailed Analytics API Error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to load detailed analytics data'
    }, { status: 500 });
  }
}