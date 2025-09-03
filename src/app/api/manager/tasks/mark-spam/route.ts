import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type Body = { ids?: string[]; rawMessageIds?: string[]; id?: string };

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const ids =
      (Array.isArray(body.rawMessageIds) && body.rawMessageIds) ||
      (Array.isArray(body.ids) && body.ids) ||
      (body.id ? [body.id] : []);

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids[] required' }, { status: 400 });
    }

    const [upd, del] = await prisma.$transaction([
      prisma.rawMessage.updateMany({
        where: { id: { in: ids } },
        data: { status: 'SPAM_REVIEW' as any },
      }),
      prisma.task.deleteMany({
        where: { rawMessageId: { in: ids }, status: { not: 'COMPLETED' as any } },
      }),
    ]);

    return NextResponse.json({ success: true, rawsUpdated: upd.count, tasksDeleted: del.count });
  } catch (err: any) {
    console.error('POST /api/manager/tasks/mark-spam failed:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Mark spam failed' },
      { status: 500 }
    );
  }
}