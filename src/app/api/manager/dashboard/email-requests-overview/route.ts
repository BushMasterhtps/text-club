import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // FIXED: Get counts for Email Request tasks using groupBy to reduce from 4 queries to 2 queries
    // First, get all status counts in one query
    const statusCounts = await prisma.task.groupBy({
      by: ['status'],
      where: {
        taskType: 'EMAIL_REQUESTS'
      },
      _count: {
        id: true
      }
    });
    
    // Get completed today count separately (needs date filter)
    const completedTodayCount = await prisma.task.count({
      where: {
        taskType: 'EMAIL_REQUESTS',
        status: 'COMPLETED',
        endTime: {
          gte: today,
          lt: tomorrow
        }
      }
    });
    
    // Map status counts to variables
    const statusMap = new Map(statusCounts.map(item => [item.status, item._count.id]));
    const pendingCount = statusMap.get('PENDING') || 0;
    const inProgressCount = statusMap.get('IN_PROGRESS') || 0;
    const totalCompletedCount = statusMap.get('COMPLETED') || 0;

    // Calculate progress percentage
    const totalTasks = pendingCount + inProgressCount + totalCompletedCount;
    const progressPercentage = totalTasks > 0 ? Math.round((totalCompletedCount / totalTasks) * 100) : 0;

    // Get request type breakdown for pending tasks
    const requestTypeBreakdown = await prisma.task.groupBy({
      by: ['emailRequestFor'],
      where: {
        taskType: 'EMAIL_REQUESTS',
        status: 'PENDING'
      },
      _count: {
        id: true
      }
    });

    // Get last import info (for now, we'll skip this since ImportSession doesn't have taskType)
    const lastImport = null;

    return NextResponse.json({
      success: true,
      data: {
        pendingCount,
        inProgressCount,
        completedTodayCount,
        totalCompletedCount,
        progressPercentage,
        totalTasks,
        requestTypeBreakdown: requestTypeBreakdown.map(item => ({
          type: item.emailRequestFor || 'Unknown',
          count: item._count.id
        })),
        lastImport: lastImport ? {
          date: lastImport.createdAt,
          imported: lastImport.totalImported,
          duplicates: lastImport.duplicatesFound
        } : null
      }
    });
  } catch (error) {
    console.error('Email Requests overview API error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch overview data' },
      { status: 500 }
    );
  }
}
