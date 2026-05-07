import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiAuthDeniedResponse, requireManagerApiAuth } from "@/lib/auth";

/**
 * GET durable assistance transcript for a task (manager).
 * Returns thread metadata (if any) and messages ascending by createdAt.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireManagerApiAuth(req);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);

  try {
    const { id: taskId } = await params;
    if (!taskId) {
      return NextResponse.json({ success: false, error: "Task ID required" }, { status: 400 });
    }

    const thread = await prisma.assistanceThread.findUnique({
      where: { taskId },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
          include: {
            authorUser: { select: { id: true, email: true, name: true } },
          },
        },
      },
    });

    if (!thread) {
      return NextResponse.json({
        success: true,
        thread: null,
        messages: [],
      });
    }

    const { messages, ...threadRest } = thread;

    return NextResponse.json({
      success: true,
      thread: threadRest,
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
        author: m.authorUser,
      })),
    });
  } catch (err: unknown) {
    console.error("GET assistance-thread failed:", err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to load assistance thread",
      },
      { status: 500 }
    );
  }
}
