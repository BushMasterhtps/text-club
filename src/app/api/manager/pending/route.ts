import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q        = searchParams.get('q') ?? '';
  const assigned = searchParams.get('assigned') ?? 'any'; // 'any' | 'unassigned' | <userId>
  const page     = Math.max(Number(searchParams.get('page') ?? '1'), 1);
  const pageSize = Math.min(Number(searchParams.get('pageSize') ?? '25'), 200);
  const skip     = (page - 1) * pageSize;

  // READY = not promoted yet; PROMOTED = assigned (still open)
  const statusFilter =
    assigned === 'unassigned' ? ['READY'] : (['READY', 'PROMOTED'] as const);

  const where: Prisma.RawMessageWhereInput = {
    status: { in: statusFilter as any },
    OR: q
      ? [
          { brand: { contains: q } },
          { text:  { contains: q } },
          { email: { contains: q } },
          { phone: { contains: q } },
        ]
      : undefined,
  };

  const raws = await prisma.rawMessage.findMany({
    where,
    orderBy: { receivedAt: 'desc' },
    skip,
    take: pageSize,
    include: {
      // latest non-completed task for display (requires db push/generate)
      tasks: {
        where: { status: { not: 'COMPLETED' as any } },
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: {
          assignedTo: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });

  const mapped = raws.map(r => {
    const t = r.tasks?.[0] ?? null;
    return {
      id: r.id,
      brand: r.brand,
      text: r.text,
      email: r.email,
      phone: r.phone,
      receivedAt: r.receivedAt ?? r.createdAt,
      createdAt: r.createdAt,
      rawStatus: r.status,
      assignedTaskId: t?.id ?? null,
      assignedToId: t?.assignedToId ?? null,
      assignedTo: t?.assignedTo ?? null,
    };
  });

  const filtered = mapped.filter(row => {
    if (assigned === 'any') return true;
    if (assigned === 'unassigned') return !row.assignedToId;
    return row.assignedToId === assigned;
  });

  return NextResponse.json({
    items: filtered,
    total: filtered.length,
    page,
    pageSize,
  });
}