// src/app/api/manager/tasks/delete/route.ts
// Optimized bulk task deletion endpoint
// Uses efficient bulk operations to avoid Netlify timeout issues

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireManagerRole } from '@/lib/auth';

function coerceIds(input: any): string[] {
  if (!input) return [];
  if (Array.isArray(input)) return input.filter(Boolean).map(String);
  if (typeof input === 'string') return input.split(',').map(s => s.trim()).filter(Boolean);
  return [];
}

/**
 * POST body:
 * {
 *   ids?: string[];  // Task IDs or RawMessage IDs to delete
 *   rawMessageIds?: string[];  // RawMessage IDs to delete (for Spam Review queue)
 * }
 *
 * Returns: { 
 *   success: true, 
 *   deletedCount: number,
 *   skippedCount: number,
 *   skippedTasks: Array<{id: string, reason: string}>,
 *   deletedTaskDetails: Array<{id: string, taskType: string, status: string}>,
 *   rawMessagesDeleted: number
 * }
 * 
 * This endpoint uses efficient bulk delete operations to avoid timeout issues.
 * Only allows deletion of PENDING, IN_PROGRESS, and SPAM_REVIEW (Text Club only) tasks.
 * For Text Club tasks, also deletes associated RawMessages.
 * Can also delete RawMessages directly (for Spam Review queue).
 */
export async function POST(req: NextRequest) {
  const startTime = Date.now();
  
  // SECURITY: Verify manager role
  const auth = requireManagerRole(req);
  if (!auth.success) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    let ids: string[] = [
      ...coerceIds(body.ids),
      ...coerceIds(body.taskIds),
      ...coerceIds(body.selectedIds),
      ...coerceIds(body.selected),
    ];
    const singleId = body.id ?? body.taskId;
    if (singleId) ids.push(String(singleId));
    ids = Array.from(new Set(ids));

    // Also handle rawMessageIds (for Spam Review queue)
    const rawMessageIds = coerceIds(body.rawMessageIds || []);
    const allIds = [...ids, ...rawMessageIds];

    if (allIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Task IDs or RawMessage IDs required' },
        { status: 400 }
      );
    }

    // Step 1: Fetch tasks to validate status and get details
    const tasks = await prisma.task.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        taskType: true,
        status: true,
        rawMessageId: true,
      },
    });

    // Step 1b: Fetch RawMessages that are not associated with tasks (for Spam Review)
    const rawMessages = rawMessageIds.length > 0 
      ? await prisma.rawMessage.findMany({
          where: { 
            id: { in: rawMessageIds },
            status: 'SPAM_REVIEW' as any, // Only allow deletion of SPAM_REVIEW RawMessages
          },
          select: {
            id: true,
            status: true,
          },
        })
      : [];

    if (tasks.length === 0 && rawMessages.length === 0) {
      return NextResponse.json({
        success: true,
        deletedCount: 0,
        skippedCount: allIds.length,
        skippedTasks: allIds.map(id => ({ id, reason: 'Task or RawMessage not found' })),
        deletedTaskDetails: [],
        rawMessagesDeleted: 0,
        processingTimeMs: Date.now() - startTime,
      });
    }

    // Step 2: Separate tasks by deletable status
    const deletableStatuses = ['PENDING', 'IN_PROGRESS', 'SPAM_REVIEW'];
    const deletableTasks: typeof tasks = [];
    const skippedTasks: Array<{ id: string; reason: string }> = [];

    for (const task of tasks) {
      // Check if status allows deletion
      if (!deletableStatuses.includes(task.status)) {
        skippedTasks.push({
          id: task.id,
          reason: `Cannot delete ${task.status} tasks`,
        });
        continue;
      }

      // For non-Text Club tasks, SPAM_REVIEW is not a valid status
      if (task.status === 'SPAM_REVIEW' && task.taskType !== 'TEXT_CLUB') {
        skippedTasks.push({
          id: task.id,
          reason: 'SPAM_REVIEW status only valid for Text Club tasks',
        });
        continue;
      }

      deletableTasks.push(task);
    }

    if (deletableTasks.length === 0 && rawMessages.length === 0) {
      return NextResponse.json({
        success: true,
        deletedCount: 0,
        skippedCount: skippedTasks.length,
        skippedTasks,
        deletedTaskDetails: [],
        rawMessagesDeleted: 0,
        processingTimeMs: Date.now() - startTime,
      });
    }

    const deletableTaskIds = deletableTasks.map(t => t.id);
    const deletedTaskDetails = deletableTasks.map(t => ({
      id: t.id,
      taskType: t.taskType,
      status: t.status,
    }));

    // Step 3: For Text Club tasks, collect RawMessage IDs to delete
    const textClubTasks = deletableTasks.filter(t => t.taskType === 'TEXT_CLUB' && t.rawMessageId);
    const taskRawMessageIds = textClubTasks
      .map(t => t.rawMessageId)
      .filter((id): id is string => id !== null);

    // Step 4: Collect all RawMessage IDs to delete (from tasks + direct RawMessage deletions)
    const allRawMessageIdsToDelete = Array.from(new Set([
      ...taskRawMessageIds,
      ...rawMessages.map(rm => rm.id),
    ]));

    // Step 5: Perform deletions in a transaction
    await prisma.$transaction(async (tx) => {
      // Delete tasks
      if (deletableTaskIds.length > 0) {
        await tx.task.deleteMany({
          where: { id: { in: deletableTaskIds } },
        });
      }

      // Delete RawMessages (associated with tasks + direct deletions)
      if (allRawMessageIdsToDelete.length > 0) {
        await tx.rawMessage.deleteMany({
          where: { id: { in: allRawMessageIdsToDelete } },
        });
      }
    });

    const processingTime = Date.now() - startTime;
    console.log(`Task deletion completed in ${processingTime}ms: ${deletableTaskIds.length} deleted, ${skippedTasks.length} skipped`);

    const totalDeleted = deletableTaskIds.length + rawMessages.length;
    return NextResponse.json({
      success: true,
      deletedCount: deletableTaskIds.length,
      skippedCount: skippedTasks.length,
      skippedTasks,
      deletedTaskDetails,
      rawMessagesDeleted: rawMessages.length,
      processingTimeMs: processingTime,
      message: `Successfully deleted ${totalDeleted} item(s) (${deletableTaskIds.length} task(s), ${rawMessages.length} raw message(s))${skippedTasks.length > 0 ? `, skipped ${skippedTasks.length} item(s)` : ''}`,
    });
  } catch (err: any) {
    console.error('Task deletion error:', err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to delete tasks',
        details: err instanceof Error ? err.stack : undefined,
      },
      { status: 500 }
    );
  }
}

