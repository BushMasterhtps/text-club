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
    console.info('[agent/start]', JSON.stringify({ phase: 'route-start', taskId: id }));

    const session = await verifyAuth(req);
    const actor = authorizeAgentTaskMutationBody(session, body);
    if (!actor.ok) return actor.response;

    // Post-rebuild safety: JWT may carry an old userId while email remains correct.
    // Resolve by id OR normalized email to avoid false "User not found" for valid staff.
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ id: actor.userId }, { email: actor.userEmail }],
      },
      select: { id: true, isActive: true, email: true },
    });

    if (!user) {
      console.warn('[agent/start]', JSON.stringify({ phase: 'user-not-found', jwtUserId: actor.userId, jwtEmail: actor.userEmail }));
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    if (!user.isActive) {
      return NextResponse.json({ success: false, error: "User account is paused" }, { status: 403 });
    }

    // Find the task and verify it's assigned to this user
    // Allow starting PENDING, IN_PROGRESS, and RESOLVED tasks
    // RESOLVED tasks can be "restarted" after manager response (they're ready to continue)
    const task = await prisma.task.findFirst({
      where: {
        id,
        assignedToId: user.id,
        status: {
          in: ["PENDING", "IN_PROGRESS", "RESOLVED"]
        }
      },
      select: {
        id: true,
        status: true,
        startTime: true,
      },
    });

    if (!task) {
      console.warn('[agent/start]', JSON.stringify({ phase: 'task-not-found-or-not-available', taskId: id, userId: user.id }));
      return NextResponse.json({ success: false, error: "Task not found or not available" }, { status: 404 });
    }

    // Idempotent: already started — preserve startTime (avoid resetting duration baseline on double-click)
    if (task.status === "IN_PROGRESS" && task.startTime) {
      return NextResponse.json({
        success: true,
        task: {
          id: task.id,
          status: task.status,
          startTime: task.startTime,
        },
      });
    }

    // Update task status and start time (PENDING / RESOLVED, or IN_PROGRESS missing startTime)
    const updatedTask = await prisma.task.update({
      where: { id },
      data: {
        status: "IN_PROGRESS",
        startTime: new Date(),
        updatedAt: new Date()
      },
      select: {
        id: true,
        status: true,
        startTime: true
      }
    });
    console.info('[agent/start]', JSON.stringify({ phase: 'task-started', taskId: id, userId: user.id, status: updatedTask.status }));

    return NextResponse.json({ 
      success: true, 
      task: updatedTask 
    });
  } catch (err: any) {
    console.error("[agent/start] catch", err);
    return NextResponse.json({ 
      success: false, 
      error: err?.message || "Failed to start task" 
    }, { status: 500 });
  }
}
