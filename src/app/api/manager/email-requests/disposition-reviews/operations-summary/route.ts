import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiAuthDeniedResponse, requireManagerApiAuth } from '@/lib/auth';
import type { Prisma } from '@prisma/client';

const UNABLE_SUBSTR = 'unable to complete';

function parseCreatedAtUtcRange(request: NextRequest): { utcStart: Date; utcEnd: Date } {
  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');

  let start: Date;
  let end: Date;

  if (startDate && endDate) {
    const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
    const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
    start = new Date(startYear, startMonth - 1, startDay, 0, 0, 0, 0);
    end = new Date(endYear, endMonth - 1, endDay, 23, 59, 59, 999);
  } else {
    const today = new Date();
    start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
    end = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
  }

  const utcStart = new Date(start.getTime() - start.getTimezoneOffset() * 60000);
  const utcEnd = new Date(end.getTime() - end.getTimezoneOffset() * 60000);
  return { utcStart, utcEnd };
}

const emailRequestsInRange = (utcStart: Date, utcEnd: Date): Prisma.TaskWhereInput => ({
  taskType: 'EMAIL_REQUESTS',
  createdAt: { gte: utcStart, lte: utcEnd },
});

const unableCompletedInRange = (utcStart: Date, utcEnd: Date): Prisma.TaskWhereInput => ({
  taskType: 'EMAIL_REQUESTS',
  status: 'COMPLETED',
  disposition: { contains: UNABLE_SUBSTR, mode: 'insensitive' },
  createdAt: { gte: utcStart, lte: utcEnd },
});

function groupByDisposition(
  rows: { disposition: string | null; _count: { _all: number } }[]
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    const key = row.disposition?.trim() || 'Unknown';
    out[key] = (out[key] || 0) + row._count._all;
  }
  return out;
}

export async function GET(request: NextRequest) {
  const auth = await requireManagerApiAuth(request);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);

  const { utcStart, utcEnd } = parseCreatedAtUtcRange(request);

  try {
    const rangeWhere = emailRequestsInRange(utcStart, utcEnd);
    const unableWhere = unableCompletedInRange(utcStart, utcEnd);

    const [
      periodTasks,
      rawUnableToComplete,
      confirmedUnable,
      incorrectUnable,
      needsFollowUp,
    ] = await Promise.all([
      prisma.task.findMany({
        where: rangeWhere,
        select: { status: true, disposition: true },
      }),
      prisma.task.count({ where: unableWhere }),
      prisma.task.count({
        where: {
          ...unableWhere,
          emailRequestDispositionReview: { verdict: 'CORRECT' },
        },
      }),
      prisma.task.count({
        where: {
          ...unableWhere,
          emailRequestDispositionReview: { verdict: 'INCORRECT' },
        },
      }),
      prisma.task.count({
        where: {
          ...unableWhere,
          emailRequestDispositionReview: { verdict: 'NEEDS_FOLLOW_UP' },
        },
      }),
    ]);

    const rawTotalCompleted = periodTasks.filter(
      (t) =>
        t.status === 'COMPLETED' &&
        t.disposition &&
        !t.disposition.toLowerCase().includes(UNABLE_SUBSTR)
    ).length;

    const outcomeTotal = rawTotalCompleted + rawUnableToComplete;

    const reviewedUnableTotal = confirmedUnable + incorrectUnable + needsFollowUp;
    const unreviewedUnable = Math.max(0, rawUnableToComplete - reviewedUnableTotal);

    const reviewedCompleted = rawTotalCompleted + incorrectUnable;
    const reviewedUnable = confirmedUnable;
    const reviewedDenominator = reviewedCompleted + reviewedUnable;
    const reviewedCompletionRatePercent =
      reviewedDenominator > 0 ? (reviewedCompleted / reviewedDenominator) * 100 : null;

    const [confirmedRows, incorrectRows, needsRows] = await Promise.all([
      prisma.task.groupBy({
        by: ['disposition'],
        where: {
          ...unableWhere,
          emailRequestDispositionReview: { verdict: 'CORRECT' },
        },
        _count: { _all: true },
      }),
      prisma.task.groupBy({
        by: ['disposition'],
        where: {
          ...unableWhere,
          emailRequestDispositionReview: { verdict: 'INCORRECT' },
        },
        _count: { _all: true },
      }),
      prisma.task.groupBy({
        by: ['disposition'],
        where: {
          ...unableWhere,
          emailRequestDispositionReview: { verdict: 'NEEDS_FOLLOW_UP' },
        },
        _count: { _all: true },
      }),
    ]);

    return NextResponse.json({
      success: true,
      raw: {
        totalCompleted: rawTotalCompleted,
        unableToComplete: rawUnableToComplete,
        outcomeTotal,
      },
      reviewed: {
        confirmedUnable,
        incorrectUnable,
        needsFollowUp,
        unreviewedUnable,
      },
      reviewedCompletionRate: {
        reviewedCompleted,
        reviewedUnable,
        ratePercent: reviewedCompletionRatePercent,
        excludesNeedsFollowUpAndUnreviewed: true,
        note:
          'Rate uses reviewedCompleted = rawCompleted + incorrectUnable and reviewedUnable = confirmedUnable only. Needs follow-up and unreviewed unable are excluded from the denominator.',
      },
      breakdowns: {
        confirmedUnableByDisposition: groupByDisposition(confirmedRows),
        incorrectUnableByDisposition: groupByDisposition(incorrectRows),
        needsFollowUpByDisposition: groupByDisposition(needsRows),
      },
    });
  } catch (error) {
    console.error('[disposition-reviews-operations-summary GET]', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to load operations summary',
      },
      { status: 500 }
    );
  }
}
