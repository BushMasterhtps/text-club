import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { TaskStatus } from "@prisma/client";
import { authorizeAgentTaskMutationBody, verifyAuth } from "@/lib/auth";

const ELIGIBLE_ASSISTANCE_STATUSES: TaskStatus[] = ["IN_PROGRESS", "ASSISTANCE_REQUIRED", "RESOLVED"];

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

    const user = await prisma.user.findFirst({
      where: {
        OR: [{ id: actor.userId }, { email: actor.userEmail }],
      },
      select: { id: true, isActive: true },
    });

    if (!user) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    if (!user.isActive) {
      return NextResponse.json({ success: false, error: "User account is paused" }, { status: 403 });
    }

    const taskPeek = await prisma.task.findUnique({
      where: { id },
      select: {
        id: true,
        assignedToId: true,
        status: true,
        taskType: true,
      },
    });

    if (!taskPeek) {
      return NextResponse.json({ success: false, error: "Task not found." }, { status: 404 });
    }

    if (taskPeek.assignedToId === null) {
      return NextResponse.json(
        {
          success: false,
          error: "This task is no longer assigned. Please refresh your task list.",
        },
        { status: 409 },
      );
    }

    if (taskPeek.assignedToId !== user.id) {
      return NextResponse.json(
        {
          success: false,
          error: "This task is assigned to another user. Please refresh your task list.",
        },
        { status: 403 },
      );
    }

    if (taskPeek.status === "PENDING") {
      return NextResponse.json(
        {
          success: false,
          error: "Please start this task before requesting assistance.",
        },
        { status: 409 },
      );
    }

    if (taskPeek.status === "COMPLETED") {
      return NextResponse.json(
        {
          success: false,
          error: "This task is already completed and cannot request assistance.",
        },
        { status: 409 },
      );
    }

    if (!ELIGIBLE_ASSISTANCE_STATUSES.includes(taskPeek.status)) {
      return NextResponse.json(
        {
          success: false,
          error: "This task is not currently eligible for assistance.",
        },
        { status: 409 },
      );
    }

    const task = await prisma.task.findUnique({
      where: { id },
      select: {
        id: true,
        startTime: true,
        status: true,
        taskType: true,
      },
    });

    if (!task) {
      return NextResponse.json({ success: false, error: "Task not found." }, { status: 404 });
    }

    let assistancePausedDurationSec = null;
    if (task.startTime) {
      const start = new Date(task.startTime);
      const nowForPause = new Date();
      assistancePausedDurationSec = Math.round((nowForPause.getTime() - start.getTime()) / 1000);
    }

    const taskStatusAtSend = task.status;
    const now = new Date();

    const { updatedTask } = await prisma.$transaction(async (tx) => {
      const ut = await tx.task.update({
        where: { id },
        data: {
          status: "ASSISTANCE_REQUIRED",
          assistanceNotes: message,
          managerResponse: null,
          assistancePausedDurationSec: assistancePausedDurationSec,
          assistanceRequestedAt: now,
          updatedAt: now,
        },
        select: {
          id: true,
          status: true,
          assistanceNotes: true,
        },
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
      status: updatedTask.status,
    });

    return NextResponse.json({
      success: true,
      task: updatedTask,
    });
  } catch (err: any) {
    console.error("Error requesting assistance:", err);
    return NextResponse.json(
      {
        success: false,
        error: err?.message || "Failed to request assistance",
      },
      { status: 500 },
    );
  }
}
