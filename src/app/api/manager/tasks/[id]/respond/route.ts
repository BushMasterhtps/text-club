import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiAuthDeniedResponse, requireManagerApiAuth } from "@/lib/auth";
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireManagerApiAuth(req);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);

  try {
    const { id } = await params;
    const body = await req.json();
    const response = body.response;

    if (!response) {
      return NextResponse.json({ success: false, error: "Response message required" }, { status: 400 });
    }

    // Find the task and verify it needs assistance
    const task = await prisma.task.findFirst({
      where: {
        id,
        status: "ASSISTANCE_REQUIRED"
      },
      select: {
        id: true,
        status: true,
        assistanceNotes: true,
        taskType: true,
      }
    });

    if (!task) {
      return NextResponse.json({ success: false, error: "Task not found or not in assistance state" }, { status: 404 });
    }

    const taskStatusAtSend = task.status;
    const now = new Date();

    const updatedTask = await prisma.$transaction(async (tx) => {
      const ut = await tx.task.update({
        where: { id },
        data: {
          status: "RESOLVED",
          managerResponse: response,
          updatedAt: now
        },
        select: {
          id: true,
          status: true,
          managerResponse: true
        }
      });

      const thread = await tx.assistanceThread.upsert({
        where: { taskId: id },
        create: {
          taskId: id,
          openedAt: now,
          lastActivityAt: now,
        },
        update: {
          lastActivityAt: now,
        },
      });

      await tx.assistanceMessage.create({
        data: {
          threadId: thread.id,
          taskId: id,
          authorUserId: auth.userId,
          authorRole: "MANAGER",
          messageType: "RESPONSE",
          body: response,
          taskStatusAtSend,
          taskTypeAtSend: task.taskType,
        },
      });

      return ut;
    });

    return NextResponse.json({ 
      success: true, 
      task: updatedTask 
    });
  } catch (err: any) {
    console.error("Error sending manager response:", err);
    return NextResponse.json({ 
      success: false, 
      error: err?.message || "Failed to send response" 
    }, { status: 500 });
  }
}
