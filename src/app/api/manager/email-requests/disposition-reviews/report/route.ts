import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiAuthDeniedResponse, requireManagerApiAuth } from '@/lib/auth';
import type { Prisma } from '@prisma/client';

type VerdictFilter = 'all' | 'correct' | 'incorrect' | 'needs_follow_up';

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

function verdictWhere(filterRaw: string | null): Prisma.EmailRequestDispositionReviewWhereInput {
  const filter = (filterRaw || 'all') as VerdictFilter;
  if (filter === 'correct') return { verdict: 'CORRECT' };
  if (filter === 'incorrect') return { verdict: 'INCORRECT' };
  if (filter === 'needs_follow_up') return { verdict: 'NEEDS_FOLLOW_UP' };
  return {};
}

function summarizeCounts(rows: { verdict: 'CORRECT' | 'INCORRECT' | 'NEEDS_FOLLOW_UP' }[]) {
  const summary = { correct: 0, incorrect: 0, needsFollowUp: 0, totalReviewed: rows.length };
  for (const row of rows) {
    if (row.verdict === 'CORRECT') summary.correct += 1;
    else if (row.verdict === 'INCORRECT') summary.incorrect += 1;
    else summary.needsFollowUp += 1;
  }
  return summary;
}

export async function GET(request: NextRequest) {
  const auth = await requireManagerApiAuth(request);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);

  const { searchParams } = new URL(request.url);
  const verdictParam = searchParams.get('verdict');
  const { utcStart, utcEnd } = parseCreatedAtUtcRange(request);

  try {
    const rows = await prisma.emailRequestDispositionReview.findMany({
      where: {
        ...verdictWhere(verdictParam),
        task: {
          taskType: 'EMAIL_REQUESTS',
          status: 'COMPLETED',
          disposition: { contains: 'unable to complete', mode: 'insensitive' },
          createdAt: { gte: utcStart, lte: utcEnd },
        },
      },
      orderBy: { reviewedAt: 'desc' },
      select: {
        verdict: true,
        note: true,
        reviewedAt: true,
        reviewer: { select: { id: true, name: true, email: true } },
        task: {
          select: {
            id: true,
            salesforceCaseNumber: true,
            emailRequestFor: true,
            text: true,
            email: true,
            disposition: true,
            details: true,
            createdAt: true,
            endTime: true,
            assignedTo: { select: { id: true, name: true, email: true } },
            completedByUser: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    const items = rows.map((row) => ({
      taskId: row.task.id,
      salesforceCaseNumber: row.task.salesforceCaseNumber,
      emailRequestFor: row.task.emailRequestFor,
      submittedName: row.task.text,
      submittedEmail: row.task.email,
      assignedAgent: row.task.assignedTo,
      completedBy: row.task.completedByUser,
      originalDisposition: row.task.disposition,
      requestDetails: row.task.details,
      createdAt: row.task.createdAt.toISOString(),
      completedAt: row.task.endTime ? row.task.endTime.toISOString() : null,
      managerVerdict: row.verdict,
      managerReviewNote: row.note,
      reviewedBy: row.reviewer,
      reviewedAt: row.reviewedAt.toISOString(),
    }));

    const summary = summarizeCounts(rows);
    return NextResponse.json({ success: true, summary, items });
  } catch (error) {
    console.error('[disposition-reviews-report GET]', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to load reviewed report' },
      { status: 500 }
    );
  }
}
