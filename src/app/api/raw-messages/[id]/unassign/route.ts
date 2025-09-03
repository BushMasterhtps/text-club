import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(_req: Request, { params }: { params: { id: string }}) {
  const { id: rawMessageId } = params;

  const [_, raw] = await prisma.$transaction([
    prisma.task.deleteMany({
      where: { rawMessageId, status: { not: 'COMPLETED' as any } },
    }),
    prisma.rawMessage.update({
      where: { id: rawMessageId },
      data:  { status: 'READY' as any },
    }),
  ]);

  return NextResponse.json({ ok: true, raw });
}