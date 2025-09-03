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

    if (!email) {
      return NextResponse.json({ success: false, error: "Email required" }, { status: 400 });
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
    // Allow starting both PENDING and IN_PROGRESS tasks (in case they were auto-assigned)
    const task = await prisma.task.findFirst({
      where: {
        id,
        assignedToId: user.id,
        status: {
          in: ["PENDING", "IN_PROGRESS"]
        }
      }
    });

    if (!task) {
      return NextResponse.json({ success: false, error: "Task not found or not available" }, { status: 404 });
    }

    // Update task status and start time
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

    return NextResponse.json({ 
      success: true, 
      task: updatedTask 
    });
  } catch (err: any) {
    console.error("Error starting task:", err);
    return NextResponse.json({ 
      success: false, 
      error: err?.message || "Failed to start task" 
    }, { status: 500 });
  }
}
