import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiAuthDeniedResponse, requireManagerApiAuth } from '@/lib/auth';
import type { EmailRequestDispositionReviewVerdict, Prisma } from '@prisma/client';

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

const VERDICT_FILTERS = ['unreviewed', 'correct', 'incorrect', 'needs_follow_up', 'all'] as const;
type VerdictFilter = (typeof VERDICT_FILTERS)[number];

function verdictWhere(verdictParam: string | null): Prisma.TaskWhereInput {
  const v = (verdictParam || 'unreviewed') as VerdictFilter;
  if (!VERDICT_FILTERS.includes(v)) {
    return { emailRequestDispositionReview: null };
  }
  if (v === 'all') return {};
  if (v === 'unreviewed') return { emailRequestDispositionReview: null };
  if (v === 'correct') return { emailRequestDispositionReview: { verdict: 'CORRECT' } };
  if (v === 'incorrect') return { emailRequestDispositionReview: { verdict: 'INCORRECT' } };
  return { emailRequestDispositionReview: { verdict: 'NEEDS_FOLLOW_UP' } };
}

export async function GET(request: NextRequest) {
  const auth = await requireManagerApiAuth(request);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);

  const { utcStart, utcEnd } = parseCreatedAtUtcRange(request);
  const { searchParams } = new URL(request.url);
  const verdictParam = searchParams.get('verdict');

  const baseWhere: Prisma.TaskWhereInput = {
    taskType: 'EMAIL_REQUESTS',
    status: 'COMPLETED',
    disposition: { contains: UNABLE_SUBSTR, mode: 'insensitive' },
    createdAt: { gte: utcStart, lte: utcEnd },
  };

  try {
    const [tasks, totalUnable, unreviewedCount, correctCount, incorrectCount, needsFollowUpCount] =
      await Promise.all([
        prisma.task.findMany({
          where: {
            ...baseWhere,
            ...verdictWhere(verdictParam),
          },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            disposition: true,
            details: true,
            salesforceCaseNumber: true,
            emailRequestFor: true,
            text: true,
            email: true,
            createdAt: true,
            endTime: true,
            assignedTo: { select: { id: true, email: true, name: true } },
            completedByUser: { select: { id: true, email: true, name: true } },
            emailRequestDispositionReview: {
              select: {
                verdict: true,
                note: true,
                reviewedAt: true,
                reviewer: { select: { id: true, email: true, name: true } },
              },
            },
          },
        }),
        prisma.task.count({ where: baseWhere }),
        prisma.task.count({
          where: { ...baseWhere, emailRequestDispositionReview: null },
        }),
        prisma.task.count({
          where: { ...baseWhere, emailRequestDispositionReview: { verdict: 'CORRECT' } },
        }),
        prisma.task.count({
          where: { ...baseWhere, emailRequestDispositionReview: { verdict: 'INCORRECT' } },
        }),
        prisma.task.count({
          where: { ...baseWhere, emailRequestDispositionReview: { verdict: 'NEEDS_FOLLOW_UP' } },
        }),
      ]);

    const items = tasks.map((t) => ({
      taskId: t.id,
      agent: t.assignedTo
        ? { id: t.assignedTo.id, email: t.assignedTo.email, name: t.assignedTo.name }
        : null,
      completedBy: t.completedByUser
        ? { id: t.completedByUser.id, email: t.completedByUser.email, name: t.completedByUser.name }
        : null,
      createdAt: t.createdAt.toISOString(),
      endTime: t.endTime ? t.endTime.toISOString() : null,
      disposition: t.disposition,
      emailRequestFor: t.emailRequestFor,
      submittedName: t.text,
      submittedEmail: t.email,
      details: t.details,
      salesforceCaseNumber: t.salesforceCaseNumber,
      review: t.emailRequestDispositionReview
        ? {
            verdict: t.emailRequestDispositionReview.verdict,
            note: t.emailRequestDispositionReview.note,
            reviewedAt: t.emailRequestDispositionReview.reviewedAt.toISOString(),
            reviewer: t.emailRequestDispositionReview.reviewer,
          }
        : null,
    }));

    const reviewedCount = totalUnable - unreviewedCount;

    return NextResponse.json({
      success: true,
      items,
      summary: {
        totalUnable,
        unreviewed: unreviewedCount,
        reviewed: reviewedCount,
        correct: correctCount,
        incorrect: incorrectCount,
        needsFollowUp: needsFollowUpCount,
      },
    });
  } catch (e) {
    console.error('[disposition-reviews GET]', e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Failed to load review queue' },
      { status: 500 }
    );
  }
}

function parseVerdict(body: unknown): EmailRequestDispositionReviewVerdict | null {
  if (!body || typeof body !== 'object') return null;
  const v = (body as { verdict?: unknown }).verdict;
  if (v === 'CORRECT' || v === 'INCORRECT' || v === 'NEEDS_FOLLOW_UP') return v;
  return null;
}

async function upsertReview(
  auth: { userId: string },
  taskId: string,
  verdict: EmailRequestDispositionReviewVerdict,
  note: string | null
) {
  const task = await prisma.task.findFirst({
    where: {
      id: taskId,
      taskType: 'EMAIL_REQUESTS',
      status: 'COMPLETED',
      disposition: { contains: UNABLE_SUBSTR, mode: 'insensitive' },
    },
    select: { id: true },
  });
  if (!task) {
    return { error: 'Task not found or not eligible for disposition review', status: 404 as const };
  }

  const reviewedAt = new Date();
  const row = await prisma.emailRequestDispositionReview.upsert({
    where: { taskId },
    create: {
      taskId,
      reviewerId: auth.userId,
      verdict,
      note,
      reviewedAt,
    },
    update: {
      reviewerId: auth.userId,
      verdict,
      note,
      reviewedAt,
    },
    select: {
      id: true,
      taskId: true,
      verdict: true,
      note: true,
      reviewedAt: true,
      reviewer: { select: { id: true, email: true, name: true } },
    },
  });

  return {
    review: {
      verdict: row.verdict,
      note: row.note,
      reviewedAt: row.reviewedAt.toISOString(),
      reviewer: row.reviewer,
    },
  };
}

export async function POST(request: NextRequest) {
  const auth = await requireManagerApiAuth(request);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ success: false, error: 'Invalid body' }, { status: 400 });
  }
  const taskId = (body as { taskId?: unknown }).taskId;
  if (typeof taskId !== 'string' || !taskId) {
    return NextResponse.json({ success: false, error: 'taskId is required' }, { status: 400 });
  }
  const verdict = parseVerdict(body);
  if (!verdict) {
    return NextResponse.json(
      { success: false, error: 'verdict must be CORRECT, INCORRECT, or NEEDS_FOLLOW_UP' },
      { status: 400 }
    );
  }
  const rawNote = (body as { note?: unknown }).note;
  const note = rawNote == null || rawNote === '' ? null : typeof rawNote === 'string' ? rawNote : null;
  if (rawNote != null && rawNote !== '' && typeof rawNote !== 'string') {
    return NextResponse.json({ success: false, error: 'note must be a string' }, { status: 400 });
  }

  try {
    const result = await upsertReview(auth, taskId, verdict, note);
    if ('error' in result) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    }
    return NextResponse.json({ success: true, taskId, review: result.review });
  } catch (e) {
    console.error('[disposition-reviews POST]', e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Failed to save review' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  return POST(request);
}
