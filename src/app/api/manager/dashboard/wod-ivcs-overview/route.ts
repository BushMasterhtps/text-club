import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Get counts for WOD/IVCS tasks
    const [
      pendingCount,
      inProgressCount,
      completedTodayCount,
      totalCompletedCount,
    ] = await Promise.all([
      // Pending tasks
      prisma.task.count({
        where: {
          taskType: 'WOD_IVCS',
          status: 'PENDING'
        }
      }),
      
      // In progress tasks
      prisma.task.count({
        where: {
          taskType: 'WOD_IVCS',
          status: 'IN_PROGRESS'
        }
      }),
      
      // Completed today
      prisma.task.count({
        where: {
          taskType: 'WOD_IVCS',
          status: 'COMPLETED',
          endTime: {
            gte: today,
            lt: tomorrow
          }
        }
      }),
      
      // Total completed
      prisma.task.count({
        where: {
          taskType: 'WOD_IVCS',
          status: 'COMPLETED'
        }
      })
    ]);

    // Calculate progress percentage
    const totalTasks = pendingCount + inProgressCount + totalCompletedCount;
    const progressPercentage = totalTasks > 0 ? Math.round((totalCompletedCount / totalTasks) * 100) : 0;

    // FIXED: Get age breakdown for pending tasks in a single query instead of 3 separate queries
    // Use groupBy with conditional aggregation to reduce from 3 queries to 1
    const now = Date.now();
    const twoDaysAgo = new Date(now - 2 * 24 * 60 * 60 * 1000);
    const oneDayAgo = new Date(now - 1 * 24 * 60 * 60 * 1000);
    const fourDaysAgo = new Date(now - 4 * 24 * 60 * 60 * 1000);
    
    // Fetch all pending WOD/IVCS tasks with purchaseDate
    const pendingTasks = await prisma.task.findMany({
      where: {
        taskType: 'WOD_IVCS',
        status: 'PENDING',
        purchaseDate: { not: null }
      },
      select: {
        purchaseDate: true
      }
    });
    
    // Calculate age breakdown in memory (much faster than 3 separate queries)
    let mediumCount = 0; // 1-2 days old
    let highCount = 0; // 3-4 days old
    let urgentCount = 0; // 5+ days old
    
    for (const task of pendingTasks) {
      if (!task.purchaseDate) continue;
      const purchaseTime = task.purchaseDate.getTime();
      const ageInDays = (now - purchaseTime) / (24 * 60 * 60 * 1000);
      
      if (ageInDays >= 1 && ageInDays < 2) {
        mediumCount++;
      } else if (ageInDays >= 2 && ageInDays < 4) {
        highCount++;
      } else if (ageInDays >= 4) {
        urgentCount++;
      }
    }
    
    const ageBreakdown = [mediumCount, highCount, urgentCount];

    // Get detailed breakdown by date and report for each priority range
    const detailedBreakdown = await Promise.all([
      // 1-2 days old detailed breakdown
      prisma.task.groupBy({
        by: ['purchaseDate', 'wodIvcsSource'],
        where: {
          taskType: 'WOD_IVCS',
          status: 'PENDING',
          AND: [
            { purchaseDate: { gte: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) } },
            { purchaseDate: { lt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000) } }
          ]
        },
        _count: {
          id: true
        }
      }),
      // 3-4 days old detailed breakdown
      prisma.task.groupBy({
        by: ['purchaseDate', 'wodIvcsSource'],
        where: {
          taskType: 'WOD_IVCS',
          status: 'PENDING',
          AND: [
            { purchaseDate: { gte: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000) } },
            { purchaseDate: { lt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) } }
          ]
        },
        _count: {
          id: true
        }
      }),
      // 5+ days old detailed breakdown
      prisma.task.groupBy({
        by: ['purchaseDate', 'wodIvcsSource'],
        where: {
          taskType: 'WOD_IVCS',
          status: 'PENDING',
          purchaseDate: {
            lt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000)
          }
        },
        _count: {
          id: true
        }
      })
    ]);

    return NextResponse.json({
      success: true,
      data: {
        pendingCount,
        inProgressCount,
        completedTodayCount,
        totalCompletedCount,
        progressPercentage,
        totalTasks,
        ageBreakdown: {
          medium: ageBreakdown[0], // 1-2 days
          high: ageBreakdown[1], // 3-4 days
          urgent: ageBreakdown[2] // 5+ days
        },
        detailedBreakdown: {
          medium: detailedBreakdown[0], // 1-2 days detailed
          high: detailedBreakdown[1], // 3-4 days detailed
          urgent: detailedBreakdown[2] // 5+ days detailed
        }
      }
    });
  } catch (error) {
    console.error('WOD/IVCS overview API error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch overview data' },
      { status: 500 }
    );
  }
}
