import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { Prisma, TaskStatus } from '@prisma/client';

// ----------------- helpers -----------------

type StatusKey =
  | 'pending'
  | 'in_progress'
  | 'assistance_required'
  | 'resolved'
  | 'completed'
  | 'all';

function parseStatus(s: string | null): StatusKey {
  const v = (s ?? '').toLowerCase().replace(/\s+/g, '_') as StatusKey;
  if (
    v === 'pending' ||
    v === 'in_progress' ||
    v === 'assistance_required' ||
    v === 'resolved' ||
    v === 'completed' ||
    v === 'all'
  ) return v;
  // Default to 'all' when no status is provided so the "All" filter works
  return 'all';
}

function parseAssigned(a: string | null) {
  const v = (a ?? '').trim();
  if (!v || v.toLowerCase() === 'any') return { kind: 'any' } as const;
  if (v.toLowerCase() === 'unassigned') return { kind: 'unassigned' } as const;
  // anything else: could be id, name, or email
  return { kind: 'user', raw: v } as const;
}

// try to detect if a string looks like an id (cuid/uuid-ish)
function looksLikeId(s: string) {
  return /^[a-z0-9_-]{10,}$/i.test(s);
}

// ----------------- route -------------------

export async function GET(req: Request) {
  const url = new URL(req.url);
  const statusKey = parseStatus(url.searchParams.get('status'));
  const assignedQ = parseAssigned(url.searchParams.get('assigned'));
  const q = (url.searchParams.get('q') ?? '').trim();
  const take = Math.min(Math.max(Number(url.searchParams.get('take') ?? 50), 1), 200);
  const skip = Math.max(Number(url.searchParams.get('skip') ?? 0), 0);

  // Build where clause for Task entities
  const where: Prisma.TaskWhereInput = {};

  // Status filter
  if (statusKey !== 'all') {
    where.status = statusKey.toUpperCase() as TaskStatus;
  }

  // Assigned filter
  if (assignedQ.kind === 'unassigned') {
    where.assignedToId = null;
  } else if (assignedQ.kind === 'user') {
    const raw = assignedQ.raw;
    const userFilter: Prisma.UserWhereInput = looksLikeId(raw)
      ? { id: raw }
      : { OR: [{ name: raw }, { email: raw }] };
    where.assignedTo = userFilter;
  }

  // Search filter
  if (q) {
    where.OR = [
      { brand: { contains: q } },
      { text: { contains: q } },
      { email: { contains: q } },
      { phone: { contains: q } },
    ];
  }

  // Query tasks
  const [total, tasks] = await Promise.all([
    prisma.task.count({ where }),
    prisma.task.findMany({
      where,
      orderBy: { createdAt: 'asc' }, // Oldest first
      skip,
      take,
      include: {
        assignedTo: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    }),
  ]);

  // Transform to match expected format
  const items = tasks.map(task => ({
    id: task.id,
    brand: task.brand,
    text: task.text,
    email: task.email,
    phone: task.phone,
    status: task.status.toLowerCase(),
    assignedToId: task.assignedToId,
    assignedTo: task.assignedTo,
    createdAt: task.createdAt,
    startTime: task.startTime,
    updatedAt: task.updatedAt,
  }));

  return NextResponse.json({
    success: true,
    items,
    total,
    pageSize: take,
    offset: skip,
  });
}