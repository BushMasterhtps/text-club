import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

function coerceIds(input: any): string[] {
  if (!input) return [];
  if (Array.isArray(input)) return input.filter(Boolean).map(String);
  if (typeof input === 'string') return input.split(',').map(s => s.trim()).filter(Boolean);
  return [];
}

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    let body: any = {};
    try { body = await req.json(); } catch {}

    let ids: string[] = [
      ...coerceIds(body.ids),
      ...coerceIds(body.taskIds),
      ...coerceIds(body.rawMessageIds),
      ...coerceIds(body.selectedIds),
      ...coerceIds(body.selected),
      ...coerceIds(url.searchParams.get('ids')),
    ];
    const singleId = body.id ?? url.searchParams.get('id');
    if (singleId) ids.push(String(singleId));
    ids = Array.from(new Set(ids));

    if (ids.length === 0) {
      return NextResponse.json({ error: 'ids[] required', received: { ids } }, { status: 400 });
    }

    // Unassign tasks instead of deleting them
    const updated = await prisma.task.updateMany({
      where: { 
        id: { in: ids },
        status: { not: 'COMPLETED' as any }
      },
      data: {
        assignedToId: null,
        status: 'PENDING', // Reset to pending when unassigned
        startTime: null,
        endTime: null,
        durationSec: null,
        disposition: null,
        assistanceNotes: null,
        managerResponse: null,
      },
    });

    return NextResponse.json({ success: true, tasksUnassigned: updated.count });
  } catch (err: any) {
    console.error('POST /api/manager/tasks/unassign failed:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Unassign failed' },
      { status: 500 },
    );
  }
}