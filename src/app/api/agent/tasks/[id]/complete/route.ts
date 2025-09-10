import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { learnFromSpamDecision } from "@/lib/spam-detection";

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
        startTime: true,
        text: true,
        brand: true,
        rawMessage: {
          select: {
            text: true,
            brand: true
          }
        }
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

    // Check if this is a "send back" disposition for WOD/IVCS
    const isSendBack = disposition.includes("Not Completed - No edit button");
    
    // Update task status, end time, duration, and disposition
    const updatedTask = await prisma.task.update({
      where: { id },
      data: {
        status: isSendBack ? "PENDING" : "COMPLETED", // Send back to pending queue
        endTime: new Date(),
        durationSec,
        disposition,
        sfCaseNumber: sfCaseNumber || null,
        assignedToId: isSendBack ? null : task.assignedToId, // Unassign if sending back
        updatedAt: new Date(),
        // Add send-back tracking fields
        ...(isSendBack && {
          sentBackBy: user.id,
          sentBackAt: new Date(),
          sentBackDisposition: disposition
        })
      },
      select: {
        id: true,
        status: true,
        endTime: true,
        durationSec: true,
        disposition: true,
        sentBackBy: true,
        sentBackAt: true,
        sentBackDisposition: true
      }
    });

    // Learn from agent's decision (legitimate vs spam)
    try {
      const taskText = task.text || task.rawMessage?.text;
      const taskBrand = task.brand || task.rawMessage?.brand;
      
      if (taskText) {
        // If disposition is SPAM, learn as spam; otherwise learn as legitimate
        const isSpam = disposition === 'SPAM';
        await learnFromSpamDecision(taskText, isSpam, taskBrand, 'agent');
      }
    } catch (error) {
      console.error('Failed to learn from agent decision:', error);
      // Don't fail the task completion if learning fails
    }

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
