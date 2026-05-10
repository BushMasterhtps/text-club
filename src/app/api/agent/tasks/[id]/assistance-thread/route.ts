import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authorizeAgentTasksList } from '@/lib/auth';
import { fetchAssistanceThreadForTaskId } from '@/lib/assistance-thread-query';

/**
 * GET durable assistance transcript for a task (agent read-only).
 * Same payload shape as manager route; access limited to queue owner (or completed-by attribution).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const listAuth = await authorizeAgentTasksList(req);
    if (!listAuth.ok) return listAuth.response;

    const { id: taskId } = await params;
    if (!taskId) {
      return NextResponse.json({ success: false, error: 'Task ID required' }, { status: 400 });
    }

    const actor = await prisma.user.findUnique({
      where: { email: listAuth.targetEmail },
      select: { id: true },
    });

    if (!actor) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        assignedToId: true,
        completedBy: true,
        status: true,
      },
    });

    if (!task) {
      return NextResponse.json({ success: false, error: 'Task not found' }, { status: 404 });
    }

    const allowed =
      task.assignedToId === actor.id ||
      (task.status === 'COMPLETED' && task.completedBy === actor.id);

    if (!allowed) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    const { thread, messages } = await fetchAssistanceThreadForTaskId(taskId);

    return NextResponse.json({
      success: true,
      thread,
      messages: messages.map((m) => ({
        id: m.id,
        threadId: m.threadId,
        taskId: m.taskId,
        authorUserId: m.authorUserId,
        authorRole: m.authorRole,
        messageType: m.messageType,
        body: m.body,
        taskStatusAtSend: m.taskStatusAtSend,
        taskTypeAtSend: m.taskTypeAtSend,
        metadata: m.metadata,
        createdAt: m.createdAt,
        author: m.author,
      })),
    });
  } catch (err: unknown) {
    console.error('GET /api/agent/tasks/[id]/assistance-thread failed:', err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to load assistance thread',
      },
      { status: 500 }
    );
  }
}
