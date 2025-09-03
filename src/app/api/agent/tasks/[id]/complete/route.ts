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
    const disposition = body.disposition;
    const sfCaseNumber = body.sfCaseNumber;

    if (!email || !disposition) {
      return NextResponse.json({ success: false, error: "Email and disposition required" }, { status: 400 });
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
      },
      select: {
        id: true,
        status: true,
        startTime: true
      }
    });

    if (!task) {
      return NextResponse.json({ success: false, error: "Task not found or not available" }, { status: 404 });
    }

    // Calculate duration if start time exists
    let durationSec = null;
    if (task.startTime) {
      const start = new Date(task.startTime);
      const end = new Date();
      const seconds = Math.round((end.getTime() - start.getTime()) / 1000);
      durationSec = seconds;
    }

    // Update task status, end time, duration, and disposition
    const updatedTask = await prisma.task.update({
      where: { id },
      data: {
        status: "COMPLETED",
        endTime: new Date(),
        durationSec,
        disposition,
        sfCaseNumber: sfCaseNumber || null,
        updatedAt: new Date()
      },
      select: {
        id: true,
        status: true,
        endTime: true,
        durationSec: true,
        disposition: true
      }
    });

    return NextResponse.json({ 
      success: true, 
      task: updatedTask 
    });
  } catch (err: any) {
    console.error("Error completing task:", err);
    return NextResponse.json({ 
      success: false, 
      error: err?.message || "Failed to complete task" 
    }, { status: 500 });
  }
}
