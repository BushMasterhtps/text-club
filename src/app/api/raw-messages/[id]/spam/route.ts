import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(_req: Request, { params }: { params: { id: string }}) {
  const { id: rawMessageId } = params;

  const [raw, _] = await prisma.$transaction([
    prisma.rawMessage.update({
      where: { id: rawMessageId },
      data:  { status: 'SPAM_REVIEW' as any },
    }),
    prisma.task.deleteMany({
      where: { rawMessageId, status: { not: 'COMPLETED' as any } },
    }),
  ]);

  return NextResponse.json(raw);
}