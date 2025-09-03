import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const email = body.email;
    const message = body.message;

    if (!email || !message) {
      return NextResponse.json({ success: false, error: "Email and message required" }, { status: 400 });
    }

    // Find the user by email
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
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

    // Update task status and assistance request
    const updatedTask = await prisma.task.update({
      where: { id },
      data: {
        status: "ASSISTANCE_REQUIRED",
        assistanceNotes: message,
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
      agentEmail: email,
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
