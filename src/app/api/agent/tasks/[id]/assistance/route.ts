import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeAgentTaskMutationBody, verifyAuth } from "@/lib/auth";
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const message = body.message;

    const session = await verifyAuth(req);
    const actor = authorizeAgentTaskMutationBody(session, body);
    if (!actor.ok) return actor.response;

    if (!message) {
      return NextResponse.json({ success: false, error: "Message required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: actor.userId },
      select: { id: true, isActive: true }
    });

    if (!user) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    if (!user.isActive) {
      return NextResponse.json({ success: false, error: "User account is paused" }, { status: 403 });
    }

    // Find the task and verify it's assigned to this user.
    // Include RESOLVED so follow-up assistance after manager response works (aligned with POST /start).
    const task = await prisma.task.findFirst({
      where: {
        id,
        assignedToId: user.id,
        status: {
          in: ["IN_PROGRESS", "ASSISTANCE_REQUIRED", "RESOLVED"]
        }
      }
    });

    if (!task) {
      return NextResponse.json({ success: false, error: "Task not found or not available" }, { status: 404 });
    }

    // Calculate elapsed time before assistance (to exclude assistance time from duration)
    let assistancePausedDurationSec = null;
    if (task.startTime) {
      const start = new Date(task.startTime);
      const now = new Date();
      assistancePausedDurationSec = Math.round((now.getTime() - start.getTime()) / 1000);
    }

    const taskStatusAtSend = task.status;
    const now = new Date();

    const { updatedTask } = await prisma.$transaction(async (tx) => {
      const ut = await tx.task.update({
        where: { id },
        data: {
          status: "ASSISTANCE_REQUIRED",
          assistanceNotes: message,
          // New assistance round: clear prior manager reply on Task so lock semantics match waiting state
          managerResponse: null,
          assistancePausedDurationSec: assistancePausedDurationSec,
          assistanceRequestedAt: now,
          updatedAt: now
        },
        select: {
          id: true,
          status: true,
          assistanceNotes: true
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
          authorUserId: actor.userId,
          authorRole: "AGENT",
          messageType: "REQUEST",
          body: message,
          taskStatusAtSend,
          taskTypeAtSend: task.taskType,
        },
      });

      return { updatedTask: ut };
    });

    console.log("🔍 Assistance Request Created:", {
      taskId: id,
      agentEmail: actor.userEmail,
      message: message,
      status: updatedTask.status
    });

    return NextResponse.json({ 
      success: true, 
      task: updatedTask 
    });
  } catch (err: any) {
    console.error("Error requesting assistance:", err);
    return NextResponse.json({ 
      success: false, 
      error: err?.message || "Failed to request assistance" 
    }, { status: 500 });
  }
}
