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
      select: { id: true, isLive: true }
    });

    if (!user) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    if (!user.isLive) {
      return NextResponse.json({ success: false, error: "User account is paused" }, { status: 403 });
    }

    // Find the task and verify it's assigned to this user
    const task = await prisma.task.findFirst({
      where: {
        id,
        assignedToId: user.id,
        status: {
          in: ["IN_PROGRESS", "ASSISTANCE_REQUIRED"]
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

    // Update task status and assistance request
    const updatedTask = await prisma.task.update({
      where: { id },
      data: {
        status: "ASSISTANCE_REQUIRED",
        assistanceNotes: message,
        assistancePausedDurationSec: assistancePausedDurationSec,
        assistanceRequestedAt: new Date(),
        updatedAt: new Date()
      },
      select: {
        id: true,
        status: true,
        assistanceNotes: true
      }
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
