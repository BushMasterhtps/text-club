import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiAuthDeniedResponse, requireManagerApiAuth } from '@/lib/auth';

export async function POST(req: NextRequest, { params }: { params: { id: string }}) {
  const auth = await requireManagerApiAuth(req);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);

  const { id: rawMessageId } = params;
  const { userId } = await req.json().catch(() => ({}));
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

  const raw = await prisma.rawMessage.findUnique({ where: { id: rawMessageId }});
  if (!raw) return NextResponse.json({ error: 'RawMessage not found' }, { status: 404 });

  const [_, task, updatedRaw] = await prisma.$transaction([
    prisma.task.deleteMany({
      where: { rawMessageId, status: { not: 'COMPLETED' as any } },
    }),
    prisma.task.create({
      data: {
        rawMessageId,
        assignedToId: userId,
        status: 'PENDING' as any,
        brand: raw.brand ?? undefined,
        text:  raw.text  ?? undefined,
        email: raw.email ?? undefined,
        phone: raw.phone ?? undefined,
        startTime: null,
        endTime:   null,
      },
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.rawMessage.update({
      where: { id: rawMessageId },
      data:  { status: 'PROMOTED' as any },
    }),
  ]);

  return NextResponse.json({ task, raw: updatedRaw });
}