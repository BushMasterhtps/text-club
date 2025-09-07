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

    // Get age breakdown for pending tasks with new priority ranges
    const ageBreakdown = await Promise.all([
      // 1-2 days old (Medium Priority)
      prisma.task.count({
        where: {
          taskType: 'WOD_IVCS',
          status: 'PENDING',
          AND: [
            { orderDate: { gte: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) } },
            { orderDate: { lt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000) } }
          ]
        }
      }),
      // 3-4 days old (High Priority)
      prisma.task.count({
        where: {
          taskType: 'WOD_IVCS',
          status: 'PENDING',
          AND: [
            { orderDate: { gte: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000) } },
            { orderDate: { lt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) } }
          ]
        }
      }),
      // 5+ days old (Urgent Priority)
      prisma.task.count({
        where: {
          taskType: 'WOD_IVCS',
          status: 'PENDING',
          orderDate: {
            lt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000)
          }
        }
      })
    ]);

    // Get detailed breakdown by date and report for each priority range
    const detailedBreakdown = await Promise.all([
      // 1-2 days old detailed breakdown
      prisma.task.groupBy({
        by: ['orderDate', 'wodIvcsSource'],
        where: {
          taskType: 'WOD_IVCS',
          status: 'PENDING',
          AND: [
            { orderDate: { gte: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) } },
            { orderDate: { lt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000) } }
          ]
        },
        _count: {
          id: true
        }
      }),
      // 3-4 days old detailed breakdown
      prisma.task.groupBy({
        by: ['orderDate', 'wodIvcsSource'],
        where: {
          taskType: 'WOD_IVCS',
          status: 'PENDING',
          AND: [
            { orderDate: { gte: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000) } },
            { orderDate: { lt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) } }
          ]
        },
        _count: {
          id: true
        }
      }),
      // 5+ days old detailed breakdown
      prisma.task.groupBy({
        by: ['orderDate', 'wodIvcsSource'],
        where: {
          taskType: 'WOD_IVCS',
          status: 'PENDING',
          orderDate: {
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
