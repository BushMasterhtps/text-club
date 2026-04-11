import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiAuthDeniedResponse, requireManagerApiAuth } from '@/lib/auth';

export async function POST(req: NextRequest, { params }: { params: { id: string }}) {
  const auth = await requireManagerApiAuth(req);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);

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