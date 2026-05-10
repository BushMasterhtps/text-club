import { prisma } from '@/lib/prisma';

export type AssistanceHistoryAuthor = {
  id: string;
  email: string;
  name: string | null;
};

export type AssistanceHistoryMessage = {
  id: string;
  threadId: string;
  taskId: string;
  authorUserId: string | null;
  authorRole: string;
  messageType: string;
  body: string;
  taskStatusAtSend: string;
  taskTypeAtSend: string;
  metadata: unknown;
  createdAt: Date;
  author: AssistanceHistoryAuthor | null;
};

export type AssistanceThreadMetadata = {
  id: string;
  taskId: string;
  openedAt: Date;
  lastActivityAt: Date;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Load durable assistance transcript for a task (read-only).
 * Messages ascending by createdAt; author user summary when present.
 */
export async function fetchAssistanceThreadForTaskId(taskId: string): Promise<{
  thread: AssistanceThreadMetadata | null;
  messages: AssistanceHistoryMessage[];
}> {
  const row = await prisma.assistanceThread.findUnique({
    where: { taskId },
    include: {
      messages: {
        orderBy: { createdAt: 'asc' },
        include: {
          authorUser: { select: { id: true, email: true, name: true } },
        },
      },
    },
  });

  if (!row) {
    return { thread: null, messages: [] };
  }

  const { messages, ...threadRest } = row;

  const normalized: AssistanceHistoryMessage[] = messages.map((m) => ({
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
    author: m.authorUser
      ? { id: m.authorUser.id, email: m.authorUser.email, name: m.authorUser.name }
      : null,
  }));

  return {
    thread: {
      id: threadRest.id,
      taskId: threadRest.taskId,
      openedAt: threadRest.openedAt,
      lastActivityAt: threadRest.lastActivityAt,
      closedAt: threadRest.closedAt,
      createdAt: threadRest.createdAt,
      updatedAt: threadRest.updatedAt,
    },
    messages: normalized,
  };
}
