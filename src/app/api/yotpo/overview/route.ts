import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiAuthDeniedResponse, requireManagerApiAuth } from '@/lib/auth';
import { getAgentReportingDayBoundsUtc } from '@/lib/agent-reporting-day-bounds';

/**
 * Yotpo Overview API
 * Returns overview statistics for Yotpo tasks
 */

export async function GET(request: NextRequest) {
  const auth = await requireManagerApiAuth(request);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);
  try {
    // Get unassigned PENDING Yotpo tasks (for "Ready to assign")
    const pendingUnassignedCount = await prisma.task.count({
      where: {
        taskType: 'YOTPO',
        status: 'PENDING',
        assignedToId: null
      }
    });

    // Get assigned-not-started count (PENDING with assignedToId)
    const assignedNotStartedCount = await prisma.task.count({
      where: {
        taskType: 'YOTPO',
        status: 'PENDING',
        assignedToId: { not: null }
      }
    });

    // Get in-progress Yotpo tasks
    const inProgressCount = await prisma.task.count({
      where: {
        taskType: 'YOTPO',
        status: 'IN_PROGRESS'
      }
    });

    // "Active Work" = assigned-not-started + in-progress
    const activeWorkCount = assignedNotStartedCount + inProgressCount;

    // Get completed today (PST-fixed reporting day, half-open — same helper as agent-facing stats)
    const { startUtc, endExclusiveUtc } = getAgentReportingDayBoundsUtc(null);

    const completedTodayCount = await prisma.task.count({
      where: {
        taskType: 'YOTPO',
        status: 'COMPLETED',
        endTime: {
          gte: startUtc,
          lt: endExclusiveUtc,
        },
      },
    });

    // Get total completed (all time)
    const totalCompletedCount = await prisma.task.count({
      where: {
        taskType: 'YOTPO',
        status: 'COMPLETED'
      }
    });

    // Calculate progress percentage (use all pending, including assigned-not-started)
    const totalPending = pendingUnassignedCount + assignedNotStartedCount;
    const totalTasks = totalPending + inProgressCount + totalCompletedCount;
    const progressPercentage = totalTasks > 0 
      ? Math.round((totalCompletedCount / totalTasks) * 100) 
      : 0;
    
    // "Ready to assign" = only unassigned PENDING tasks
    const pendingCount = pendingUnassignedCount;

    // Get last import info
    const lastImport = await prisma.importSession.findFirst({
      where: {
        source: 'YOTPO'
      },
      orderBy: {
        importedAt: 'desc'
      },
      select: {
        importedAt: true,
        imported: true,
        duplicates: true,
        errors: true
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        pendingCount, // Only unassigned PENDING tasks (for "Ready to assign")
        assignedNotStartedCount, // Assigned but not started
        activeWorkCount, // assigned-not-started + in-progress (for "Active Work")
        inProgressCount,
        completedTodayCount,
        totalCompletedCount,
        progressPercentage,
        totalTasks,
        lastImport: lastImport ? {
          date: lastImport.importedAt.toISOString(),
          imported: lastImport.imported,
          duplicates: lastImport.duplicates,
          errors: lastImport.errors
        } : null
      }
    });

  } catch (error) {
    console.error('Yotpo overview API error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to load overview data'
    }, { status: 500 });
  }
}

