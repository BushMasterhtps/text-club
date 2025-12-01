import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type SummaryRow = {
  pendingCount: number;
  inProgressCount: number;
  completedTodayCount: number;
  totalCompletedCount: number;
  mediumCount: number;
  highCount: number;
  urgentCount: number;
};

type DetailedRow = {
  bucket: 'medium' | 'high' | 'urgent';
  purchaseDate: Date;
  wodIvcsSource: string | null;
  count: number;
};

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export async function GET() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const now = Date.now();
    const oneDayAgo = new Date(now - DAY_IN_MS);
    const twoDaysAgo = new Date(now - 2 * DAY_IN_MS);
    const fourDaysAgo = new Date(now - 4 * DAY_IN_MS);

    const [summary] = await prisma.$queryRaw<SummaryRow[]>`
      SELECT
        CAST(COUNT(*) FILTER (WHERE "status" = 'PENDING') AS INTEGER) AS "pendingCount",
        CAST(COUNT(*) FILTER (WHERE "status" = 'IN_PROGRESS') AS INTEGER) AS "inProgressCount",
        CAST(COUNT(*) FILTER (WHERE "status" = 'COMPLETED' AND "endTime" >= ${today} AND "endTime" < ${tomorrow}) AS INTEGER) AS "completedTodayCount",
        CAST(COUNT(*) FILTER (WHERE "status" = 'COMPLETED') AS INTEGER) AS "totalCompletedCount",
        CAST(COUNT(*) FILTER (
          WHERE "status" = 'PENDING'
          AND "purchaseDate" >= ${twoDaysAgo}
          AND "purchaseDate" < ${oneDayAgo}
        ) AS INTEGER) AS "mediumCount",
        CAST(COUNT(*) FILTER (
          WHERE "status" = 'PENDING'
          AND "purchaseDate" >= ${fourDaysAgo}
          AND "purchaseDate" < ${twoDaysAgo}
        ) AS INTEGER) AS "highCount",
        CAST(COUNT(*) FILTER (
          WHERE "status" = 'PENDING'
          AND "purchaseDate" < ${fourDaysAgo}
        ) AS INTEGER) AS "urgentCount"
      FROM "public"."Task"
      WHERE "taskType" = 'WOD_IVCS';
    `;

    const {
      pendingCount = 0,
      inProgressCount = 0,
      completedTodayCount = 0,
      totalCompletedCount = 0,
      mediumCount = 0,
      highCount = 0,
      urgentCount = 0,
    } = summary ?? {};

    const totalTasks = pendingCount + inProgressCount + totalCompletedCount;
    const progressPercentage =
      totalTasks > 0 ? Math.round((totalCompletedCount / totalTasks) * 100) : 0;

    const detailedRows = await prisma.$queryRaw<DetailedRow[]>`
      SELECT
        CASE
          WHEN "purchaseDate" >= ${twoDaysAgo} AND "purchaseDate" < ${oneDayAgo} THEN 'medium'
          WHEN "purchaseDate" >= ${fourDaysAgo} AND "purchaseDate" < ${twoDaysAgo} THEN 'high'
          WHEN "purchaseDate" < ${fourDaysAgo} THEN 'urgent'
        END AS bucket,
        "purchaseDate",
        "wodIvcsSource",
        CAST(COUNT(*) AS INTEGER) AS count
      FROM "public"."Task"
      WHERE
        "taskType" = 'WOD_IVCS'
        AND "status" = 'PENDING'
        AND "purchaseDate" IS NOT NULL
        AND (
          ("purchaseDate" >= ${twoDaysAgo} AND "purchaseDate" < ${oneDayAgo}) OR
          ("purchaseDate" >= ${fourDaysAgo} AND "purchaseDate" < ${twoDaysAgo}) OR
          ("purchaseDate" < ${fourDaysAgo})
        )
      GROUP BY bucket, "purchaseDate", "wodIvcsSource"
      HAVING bucket IS NOT NULL
      ORDER BY bucket, "purchaseDate" DESC;
    `;

    const detailedBreakdown = {
      medium: [] as Array<{ purchaseDate: Date; wodIvcsSource: string | null; _count: { id: number } }>,
      high: [] as Array<{ purchaseDate: Date; wodIvcsSource: string | null; _count: { id: number } }>,
      urgent: [] as Array<{ purchaseDate: Date; wodIvcsSource: string | null; _count: { id: number } }>,
    };

    for (const row of detailedRows) {
      const purchaseDate = new Date(row.purchaseDate);
      detailedBreakdown[row.bucket].push({
        purchaseDate,
        wodIvcsSource: row.wodIvcsSource,
        _count: { id: row.count },
      });
    }

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
          medium: mediumCount,
          high: highCount,
          urgent: urgentCount,
        },
        detailedBreakdown,
      },
    });
  } catch (error) {
    console.error('WOD/IVCS overview API error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch overview data' },
      { status: 500 }
    );
  }
}
