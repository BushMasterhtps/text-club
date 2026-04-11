import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiAuthDeniedResponse, requireManagerApiAuth } from '@/lib/auth';

export async function POST(req: NextRequest, { params }: { params: { id: string }}) {
  const auth = await requireManagerApiAuth(req);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);

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