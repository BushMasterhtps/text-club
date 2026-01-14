import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // OPTIMIZED: Consolidate 4 count queries + 3 groupBy queries into 2 raw SQL queries
    // First query: Aggregate all status counts and age bucket counts in a single database trip
    const statusAndAgeQuery = await prisma.$queryRaw<Array<{
      status: string;
      pending_unassigned_count: bigint;
      assigned_not_started_count: bigint;
      in_progress_count: bigint;
      completed_today_count: bigint;
      total_completed_count: bigint;
      medium_count: bigint;
      high_count: bigint;
      urgent_count: bigint;
    }>>`
      SELECT 
        'WOD_IVCS' as task_type,
        COUNT(*) FILTER (WHERE status = 'PENDING' AND "assignedToId" IS NULL)::bigint as pending_unassigned_count,
        COUNT(*) FILTER (WHERE status = 'PENDING' AND "assignedToId" IS NOT NULL)::bigint as assigned_not_started_count,
        COUNT(*) FILTER (WHERE status = 'IN_PROGRESS')::bigint as in_progress_count,
        COUNT(*) FILTER (WHERE status = 'COMPLETED' AND "endTime" >= ${today} AND "endTime" < ${tomorrow})::bigint as completed_today_count,
        COUNT(*) FILTER (WHERE status = 'COMPLETED')::bigint as total_completed_count,
        COUNT(*) FILTER (
          WHERE status = 'PENDING' 
          AND "assignedToId" IS NULL
          AND "purchaseDate" IS NOT NULL
          AND EXTRACT(EPOCH FROM (NOW() - "purchaseDate")) / 86400 >= 1
          AND EXTRACT(EPOCH FROM (NOW() - "purchaseDate")) / 86400 < 2
        )::bigint as medium_count,
        COUNT(*) FILTER (
          WHERE status = 'PENDING' 
          AND "assignedToId" IS NULL
          AND "purchaseDate" IS NOT NULL
          AND EXTRACT(EPOCH FROM (NOW() - "purchaseDate")) / 86400 >= 2
          AND EXTRACT(EPOCH FROM (NOW() - "purchaseDate")) / 86400 < 4
        )::bigint as high_count,
        COUNT(*) FILTER (
          WHERE status = 'PENDING' 
          AND "assignedToId" IS NULL
          AND "purchaseDate" IS NOT NULL
          AND EXTRACT(EPOCH FROM (NOW() - "purchaseDate")) / 86400 >= 4
        )::bigint as urgent_count
      FROM "Task"
      WHERE "taskType" = 'WOD_IVCS'
    `;

    const result = statusAndAgeQuery[0];
    const pendingUnassignedCount = Number(result.pending_unassigned_count);
    const assignedNotStartedCount = Number(result.assigned_not_started_count);
    const inProgressCount = Number(result.in_progress_count);
    const completedTodayCount = Number(result.completed_today_count);
    const totalCompletedCount = Number(result.total_completed_count);
    const mediumCount = Number(result.medium_count);
    const highCount = Number(result.high_count);
    const urgentCount = Number(result.urgent_count);

    // "Ready to assign" = only unassigned PENDING tasks
    const pendingCount = pendingUnassignedCount;
    // "Active Work" = assigned-not-started + in-progress
    const activeWorkCount = assignedNotStartedCount + inProgressCount;

    // Calculate progress percentage (use all pending, including assigned-not-started)
    const totalPending = pendingUnassignedCount + assignedNotStartedCount;
    const totalTasks = totalPending + inProgressCount + totalCompletedCount;
    const progressPercentage = totalTasks > 0 ? Math.round((totalCompletedCount / totalTasks) * 100) : 0;
    
    const ageBreakdown = [mediumCount, highCount, urgentCount];

    // Second query: Use CASE statements and GROUP BY to fetch detailed age breakdown
    const detailedBreakdownQuery = await prisma.$queryRaw<Array<{
      purchase_date: Date;
      wod_ivcs_source: string | null;
      age_bucket: string;
      count: bigint;
    }>>`
      SELECT 
        DATE("purchaseDate") as purchase_date,
        "wodIvcsSource" as wod_ivcs_source,
        CASE
          WHEN EXTRACT(EPOCH FROM (NOW() - "purchaseDate")) / 86400 >= 1 
           AND EXTRACT(EPOCH FROM (NOW() - "purchaseDate")) / 86400 < 2 THEN 'medium'
          WHEN EXTRACT(EPOCH FROM (NOW() - "purchaseDate")) / 86400 >= 2 
           AND EXTRACT(EPOCH FROM (NOW() - "purchaseDate")) / 86400 < 4 THEN 'high'
          WHEN EXTRACT(EPOCH FROM (NOW() - "purchaseDate")) / 86400 >= 4 THEN 'urgent'
        END as age_bucket,
        COUNT(*)::bigint as count
      FROM "Task"
      WHERE "taskType" = 'WOD_IVCS'
        AND status = 'PENDING'
        AND "assignedToId" IS NULL
        AND "purchaseDate" IS NOT NULL
        AND EXTRACT(EPOCH FROM (NOW() - "purchaseDate")) / 86400 >= 1
      GROUP BY DATE("purchaseDate"), "wodIvcsSource", age_bucket
      ORDER BY purchase_date DESC, wod_ivcs_source
    `;

    // Normalize detailed breakdown to match original API response structure
    const detailedBreakdown = {
      medium: detailedBreakdownQuery
        .filter(r => r.age_bucket === 'medium')
        .map(r => ({
          purchaseDate: r.purchase_date,
          wodIvcsSource: r.wod_ivcs_source,
          _count: { id: Number(r.count) }
        })),
      high: detailedBreakdownQuery
        .filter(r => r.age_bucket === 'high')
        .map(r => ({
          purchaseDate: r.purchase_date,
          wodIvcsSource: r.wod_ivcs_source,
          _count: { id: Number(r.count) }
        })),
      urgent: detailedBreakdownQuery
        .filter(r => r.age_bucket === 'urgent')
        .map(r => ({
          purchaseDate: r.purchase_date,
          wodIvcsSource: r.wod_ivcs_source,
          _count: { id: Number(r.count) }
        }))
    };

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
        ageBreakdown: {
          medium: ageBreakdown[0], // 1-2 days
          high: ageBreakdown[1], // 3-4 days
          urgent: ageBreakdown[2] // 5+ days
        },
        detailedBreakdown
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
